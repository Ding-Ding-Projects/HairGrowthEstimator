import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

export const LIMITS = Object.freeze({
  jsonBytes: 4 * 1024 * 1024,
  mediaBytes: 256 * 1024 * 1024,
  imagePixels: 40_000_000,
  packageFiles: 20_000,
  packageBytes: 2 * 1024 * 1024 * 1024,
  stringLength: 4_096,
  steps: 512
});

export class EvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EvidenceError';
    this.code = code;
  }
}

export function fail(code, message) {
  throw new EvidenceError(code, message);
}

export function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_OBJECT', `${label} must be an object.`);
  }
  return value;
}

export function assertExactKeys(value, allowed, label) {
  assertObject(value, label);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) fail('UNEXPECTED_FIELD', `${label} contains unsupported fields.`);
  return value;
}

export function boundedString(value, label, { min = 1, max = LIMITS.stringLength, pattern } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max || value.includes('\0')) {
    fail('INVALID_STRING', `${label} must be a bounded string.`);
  }
  if (pattern && !pattern.test(value)) fail('INVALID_STRING', `${label} has an invalid format.`);
  return value;
}

export function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export async function sha256File(filePath) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) fail('NOT_A_FILE', 'The hashed path must be a regular file.');
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function canonicalJsonValue(value, state, depth) {
  if (depth > 24) fail('INVALID_RECEIPT_VALUE', 'Receipt data exceeds the supported nesting depth.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_RECEIPT_VALUE', 'Receipt data contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') fail('INVALID_RECEIPT_VALUE', 'Receipt data contains an unsupported value type.');
  if (state.seen.has(value)) fail('INVALID_RECEIPT_VALUE', 'Receipt data contains a cycle.');
  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      state.entries += value.length;
      if (state.entries > 20_000) fail('INVALID_RECEIPT_VALUE', 'Receipt data exceeds the supported entry count.');
      return `[${value.map((item) => canonicalJsonValue(item, state, depth + 1)).join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail('INVALID_RECEIPT_VALUE', 'Receipt data must contain plain objects only.');
    const keys = Object.keys(value).sort();
    state.entries += keys.length;
    if (state.entries > 20_000) fail('INVALID_RECEIPT_VALUE', 'Receipt data exceeds the supported entry count.');
    if (keys.some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))) {
      fail('INVALID_RECEIPT_VALUE', 'Receipt data contains an unsafe object key.');
    }
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJsonValue(value[key], state, depth + 1)}`).join(',')}}`;
  } finally {
    state.seen.delete(value);
  }
}

export function canonicalJson(value) {
  return canonicalJsonValue(value, { seen: new Set(), entries: 0 }, 0);
}

export function canonicalHash(value) {
  return sha256Bytes(Buffer.from(canonicalJson(value), 'utf8'));
}

export async function readJson(filePath, maxBytes = LIMITS.jsonBytes) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile() || stat.size > maxBytes) fail('INVALID_JSON_FILE', 'JSON input is missing, not a file, or exceeds its byte limit.');
  let value;
  try {
    value = JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch {
    fail('INVALID_JSON', 'JSON input is malformed.');
  }
  return value;
}

async function renameWithRetry(source, destination) {
  const transient = new Set(['EPERM', 'EACCES', 'EBUSY']);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fsp.rename(source, destination);
      return;
    } catch (error) {
      if (!transient.has(error?.code) || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

export async function atomicWriteJson(filePath, value) {
  const destination = path.resolve(filePath);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(payload) > LIMITS.jsonBytes) fail('JSON_TOO_LARGE', 'JSON output exceeds its byte limit.');
  try {
    await fsp.writeFile(temporary, payload, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await renameWithRetry(temporary, destination);
  } finally {
    await fsp.rm(temporary, { force: true }).catch(() => {});
  }
}

function lexicalPath(value) {
  boundedString(value, 'path', { max: 32_768 });
  if (!path.isAbsolute(value)) fail('PATH_NOT_ABSOLUTE', 'The path must be absolute.');
  return path.resolve(value);
}

export async function rejectLinkComponents(value) {
  const resolved = lexicalPath(value);
  const parsed = path.parse(resolved);
  const relative = path.relative(parsed.root, resolved);
  let current = parsed.root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try {
      stat = await fsp.lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
    if (stat.isSymbolicLink()) fail('LINK_COMPONENT', 'The path contains a symbolic link or junction.');
  }
  return resolved;
}

export async function strictChild(child, root, label = 'path') {
  const resolvedRoot = await rejectLinkComponents(root);
  const resolvedChild = await rejectLinkComponents(child);
  const relative = path.relative(resolvedRoot, resolvedChild);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('PATH_ESCAPE', `${label} must be a strict child of its owned root.`);
  }
  return { root: resolvedRoot, child: resolvedChild, relative: relative.split(path.sep).join('/') };
}

async function directoryManifest(root) {
  const resolvedRoot = await rejectLinkComponents(root);
  const rootStat = await fsp.lstat(resolvedRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('INVALID_FROZEN_DIRECTORY', 'Frozen byte source must be a regular directory.');
  const pending = [''];
  const records = [];
  let totalBytes = 0;
  while (pending.length) {
    const relativeDirectory = pending.pop();
    const directory = relativeDirectory ? path.join(resolvedRoot, relativeDirectory) : resolvedRoot;
    const entries = (await fsp.readdir(directory, { withFileTypes: true })).toSorted((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const relative = path.join(relativeDirectory, entry.name);
      const absolutePath = path.join(resolvedRoot, relative);
      const stat = await fsp.lstat(absolutePath);
      if (stat.isSymbolicLink()) fail('LINK_COMPONENT', 'Frozen byte inventory contains a symbolic link or junction.');
      if (stat.isDirectory()) {
        pending.push(relative);
        continue;
      }
      if (!stat.isFile()) fail('INVALID_FROZEN_DIRECTORY', 'Frozen byte inventory contains an unsupported filesystem entry.');
      totalBytes += stat.size;
      records.push({ path: relative.split(path.sep).join('/'), bytes: stat.size, sha256: await sha256File(absolutePath) });
      if (records.length > LIMITS.packageFiles || totalBytes > LIMITS.packageBytes) {
        fail('FROZEN_DIRECTORY_TOO_LARGE', 'Frozen byte inventory exceeds its file or byte limit.');
      }
    }
  }
  records.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const inventorySha256 = sha256Bytes(Buffer.from(records.map((record) => `${record.path}\0${record.bytes}\0${record.sha256}\n`).join(''), 'utf8'));
  return { root: resolvedRoot, fileCount: records.length, bytes: totalBytes, inventorySha256 };
}

export async function freezeDirectory(sourceRoot, destinationRoot) {
  const source = await rejectLinkComponents(sourceRoot);
  const destination = path.resolve(destinationRoot);
  await rejectLinkComponents(path.dirname(destination));
  const before = await directoryManifest(source);
  try {
    await fsp.cp(source, destination, { recursive: true, dereference: false, errorOnExist: true, force: false });
    const [after, frozen] = await Promise.all([directoryManifest(source), directoryManifest(destination)]);
    if (canonicalHash(before) !== canonicalHash(after) || before.fileCount !== frozen.fileCount || before.bytes !== frozen.bytes || before.inventorySha256 !== frozen.inventorySha256) {
      fail('FROZEN_BYTES_CHANGED', 'Source bytes changed during the owned frozen-directory copy.');
    }
    return frozen;
  } catch (error) {
    await fsp.rm(destination, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function assertFrozenDirectory(binding) {
  assertExactKeys(assertObject(binding, 'frozen directory binding'), new Set(['root', 'fileCount', 'bytes', 'inventorySha256']), 'frozen directory binding');
  if (!path.isAbsolute(binding.root) || !Number.isSafeInteger(binding.fileCount) || binding.fileCount < 1 || binding.fileCount > LIMITS.packageFiles ||
      !Number.isSafeInteger(binding.bytes) || binding.bytes < 1 || binding.bytes > LIMITS.packageBytes ||
      typeof binding.inventorySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(binding.inventorySha256)) {
    fail('INVALID_FROZEN_DIRECTORY', 'Frozen directory binding is invalid.');
  }
  const current = await directoryManifest(binding.root);
  if (canonicalHash(current) !== canonicalHash(binding)) fail('FROZEN_BYTES_CHANGED', 'Owned frozen-directory bytes changed after capture.');
  return current;
}

export function safeRelative(value, label = 'relative path') {
  boundedString(value, label, { max: 1_024 });
  const normalized = value.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    fail('PATH_ESCAPE', `${label} must be a safe relative path.`);
  }
  return normalized;
}

export function runGit(repoRoot, args) {
  try {
    return childProcess.execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    fail('GIT_PROBE_FAILED', `Git source verification failed with exit code ${error?.status ?? 'unknown'}.`);
  }
}

export function assertPinnedSource(repoRoot, expectedSha) {
  boundedString(expectedSha, 'source SHA', { pattern: /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/ });
  const actual = runGit(repoRoot, ['rev-parse', 'HEAD']).toLowerCase();
  if (actual !== expectedSha.toLowerCase()) fail('STALE_SOURCE', 'The source checkout no longer matches the pinned commit.');
  const dirty = runGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=normal']);
  if (dirty) fail('DIRTY_SOURCE', 'The source checkout contains uncommitted or untracked work.');
  return actual;
}

export async function assertPinnedArtifact(artifactPath, expectedSha) {
  boundedString(expectedSha, 'artifact SHA-256', { pattern: /^[a-f0-9]{64}$/ });
  const actual = await sha256File(artifactPath);
  if (actual !== expectedSha.toLowerCase()) fail('STALE_ARTIFACT', 'The packaged artifact no longer matches the pinned SHA-256.');
  return actual;
}

const sensitivePatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:authorization|cookie|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token)\s*[:=]\s*\S+/i,
  /\bbearer\s+[a-z0-9._~+/=-]{8,}/i,
  /(?:^|[\\/])Users[\\/][^\\/\s]+[\\/]/i,
  /(?:^|[\\/])home[\\/][^\\/\s]+[\\/]/i
];

export function assertPublicReceiptValue(value, label = 'receipt') {
  const text = canonicalJson(value);
  if (Buffer.byteLength(text) > LIMITS.jsonBytes) fail('RECEIPT_TOO_LARGE', `${label} exceeds its byte limit.`);
  if (sensitivePatterns.some((pattern) => pattern.test(text))) {
    fail('SENSITIVE_RECEIPT', `${label} contains a secret-like value or user-profile path.`);
  }
  return value;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function decodePngRows(raw, width, height, bytesPerPixel) {
  const rowBytes = width * bytesPerPixel;
  const expected = (rowBytes + 1) * height;
  if (raw.length !== expected) fail('PNG_DECODE_FAILED', 'PNG decompressed bytes do not match its dimensions.');
  const pixels = Buffer.alloc(rowBytes * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset];
    inputOffset += 1;
    const rowOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const value = raw[inputOffset + x];
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[rowOffset + x - rowBytes] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[rowOffset + x - rowBytes - bytesPerPixel] : 0;
      let decoded;
      if (filter === 0) decoded = value;
      else if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + Math.floor((left + up) / 2);
      else if (filter === 4) decoded = value + paeth(left, up, upperLeft);
      else fail('PNG_DECODE_FAILED', 'PNG uses an unsupported row filter.');
      pixels[rowOffset + x] = decoded & 0xff;
    }
    inputOffset += rowBytes;
  }
  return pixels;
}

export async function inspectPng(filePath, { requireNonblank = true } = {}) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile() || stat.size < 67 || stat.size > LIMITS.mediaBytes) fail('INVALID_PNG', 'PNG is missing or outside the allowed byte range.');
  const buffer = await fsp.readFile(filePath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) fail('INVALID_PNG', 'PNG signature is invalid.');
  let offset = 8;
  let ihdr = null;
  let sawIend = false;
  const idat = [];
  const forbidden = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf']);
  const allowed = new Set(['IHDR', 'IDAT', 'IEND']);
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) fail('INVALID_PNG', 'PNG chunk header is truncated.');
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > buffer.length) fail('INVALID_PNG', 'PNG chunk extends outside the file.');
    const typeAndData = buffer.subarray(offset + 4, offset + 8 + length);
    if (crc32(typeAndData) !== buffer.readUInt32BE(offset + 8 + length)) fail('INVALID_PNG', 'PNG chunk checksum is invalid.');
    if (forbidden.has(type)) fail('PNG_METADATA_FORBIDDEN', 'PNG contains a metadata channel that is not allowed in evidence.');
    if (!allowed.has(type)) fail('PNG_CHUNK_FORBIDDEN', 'PNG contains a chunk outside the exact evidence pixel allowlist.');
    if (type === 'IHDR') {
      if (ihdr || length !== 13 || offset !== 8) fail('INVALID_PNG', 'PNG has an invalid IHDR chunk.');
      ihdr = buffer.subarray(offset + 8, offset + 8 + length);
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    } else if (type === 'IEND') {
      if (length !== 0 || end !== buffer.length) fail('INVALID_PNG', 'PNG IEND is invalid or has trailing bytes.');
      sawIend = true;
    }
    offset = end;
  }
  if (!ihdr || !sawIend || idat.length === 0) fail('INVALID_PNG', 'PNG is missing required chunks.');
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  if (!width || !height || width * height > LIMITS.imagePixels) fail('INVALID_PNG', 'PNG dimensions are invalid or exceed the pixel limit.');
  const channelCounts = new Map([[0, 1], [2, 3], [4, 2], [6, 4]]);
  if (bitDepth !== 8 || !channelCounts.has(colorType) || ihdr[10] !== 0 || ihdr[11] !== 0 || ihdr[12] !== 0) {
    fail('PNG_FORMAT_UNSUPPORTED', 'Evidence PNG must be non-interlaced 8-bit grayscale, RGB, grayscale-alpha, or RGBA.');
  }
  let raw;
  try {
    const compressed = Buffer.concat(idat);
    const decoded = zlib.inflateSync(compressed, { maxOutputLength: LIMITS.mediaBytes, info: true });
    if (!decoded || !Buffer.isBuffer(decoded.buffer) || decoded.engine?.bytesWritten !== compressed.length) {
      fail('PNG_DECODE_FAILED', 'PNG compressed stream contains unconsumed bytes.');
    }
    raw = decoded.buffer;
  } catch {
    fail('PNG_DECODE_FAILED', 'PNG pixel data could not be decoded.');
  }
  const pixels = decodePngRows(raw, width, height, channelCounts.get(colorType));
  if (requireNonblank && pixels.length > 0) {
    const bytesPerPixel = channelCounts.get(colorType);
    const alphaIndex = colorType === 4 ? 1 : colorType === 6 ? 3 : null;
    const normalizedPixel = (index) => {
      const sample = Buffer.from(pixels.subarray(index, index + bytesPerPixel));
      if (alphaIndex !== null && sample[alphaIndex] === 0) sample.fill(0);
      return sample;
    };
    const first = normalizedPixel(0);
    let varied = false;
    for (let index = bytesPerPixel; index < pixels.length; index += bytesPerPixel) {
      if (!normalizedPixel(index).equals(first)) {
        varied = true;
        break;
      }
    }
    if (!varied) fail('BLANK_CAPTURE', 'PNG contains one uniform pixel value across the entire image.');
  }
  return { mimeType: 'image/png', width, height, bytes: buffer.length, sha256: sha256Bytes(buffer), nonblank: requireNonblank };
}

function webpDimensions(type, data) {
  if (type === 'VP8X') {
    if (data.length !== 10) fail('INVALID_WEBP', 'VP8X chunk has an invalid length.');
    if ((data[0] & ~0x02) !== 0 || data[1] !== 0 || data[2] !== 0 || data[3] !== 0) fail('INVALID_WEBP', 'VP8X uses unsupported feature or reserved bits.');
    return { width: 1 + data.readUIntLE(4, 3), height: 1 + data.readUIntLE(7, 3), animationFlag: Boolean(data[0] & 0x02) };
  }
  if (type === 'VP8 ') {
    if (data.length < 10 || !data.subarray(3, 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) fail('INVALID_WEBP', 'VP8 frame header is invalid.');
    return { width: data.readUInt16LE(6) & 0x3fff, height: data.readUInt16LE(8) & 0x3fff, animationFlag: false };
  }
  if (type === 'VP8L') {
    if (data.length < 5 || data[0] !== 0x2f) fail('INVALID_WEBP', 'VP8L frame header is invalid.');
    const bits = data.readUInt32LE(1);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff), animationFlag: false };
  }
  return null;
}

function validateAnimatedFrame(data, canvas) {
  if (data.length < 29 || (data[15] & 0xfc) !== 0) fail('INVALID_WEBP', 'Animated WebP frame header or payload is invalid.');
  const x = data.readUIntLE(0, 3) * 2;
  const y = data.readUIntLE(3, 3) * 2;
  const width = data.readUIntLE(6, 3) + 1;
  const height = data.readUIntLE(9, 3) + 1;
  const duration = data.readUIntLE(12, 3);
  if (!width || !height || !duration || x + width > canvas.width || y + height > canvas.height) {
    fail('INVALID_WEBP', 'Animated WebP frame geometry or duration is invalid.');
  }
  let offset = 16;
  let alphaChunks = 0;
  let imageChunks = 0;
  while (offset < data.length) {
    if (offset + 8 > data.length) fail('INVALID_WEBP', 'Animated WebP frame chunk header is truncated.');
    const type = data.toString('ascii', offset, offset + 4);
    const length = data.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const paddedEnd = dataEnd + (length % 2);
    if (paddedEnd > data.length) fail('INVALID_WEBP', 'Animated WebP frame chunk exceeds its payload.');
    if (length % 2 && data[dataEnd] !== 0) fail('WEBP_CHUNK_FORBIDDEN', 'Animated WebP frame padding must not carry data.');
    if (type === 'ALPH') {
      alphaChunks += 1;
      if (alphaChunks !== 1 || imageChunks !== 0 || length < 1) fail('INVALID_WEBP', 'Animated WebP alpha chunk order is invalid.');
    } else if (type === 'VP8 ' || type === 'VP8L') {
      imageChunks += 1;
      const dimensions = webpDimensions(type, data.subarray(dataStart, dataEnd));
      if (imageChunks !== 1 || !dimensions || dimensions.width !== width || dimensions.height !== height) fail('INVALID_WEBP', 'Animated WebP frame bitstream does not match its frame rectangle.');
    } else {
      fail('WEBP_CHUNK_FORBIDDEN', 'Animated WebP frame contains a chunk outside the exact pixel allowlist.');
    }
    offset = paddedEnd;
  }
  if (imageChunks !== 1) fail('INVALID_WEBP', 'Animated WebP frame is missing its exact image bitstream.');
}

export async function inspectWebp(filePath, { requireAnimation = false } = {}) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile() || stat.size < 20 || stat.size > LIMITS.mediaBytes) fail('INVALID_WEBP', 'WebP is missing or outside the allowed byte range.');
  const buffer = await fsp.readFile(filePath);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP' || buffer.readUInt32LE(4) + 8 !== buffer.length) {
    fail('INVALID_WEBP', 'WebP RIFF identity or byte count is invalid.');
  }
  let offset = 12;
  let dimensions = null;
  let animChunks = 0;
  let frameChunks = 0;
  let stage = 0;
  const forbidden = new Set(['EXIF', 'XMP ', 'ICCP']);
  const allowed = new Set(['VP8X', 'ANIM', 'ANMF', 'VP8 ', 'VP8L', 'ALPH']);
  const counts = new Map();
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) fail('INVALID_WEBP', 'WebP chunk header is truncated.');
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const paddedEnd = dataEnd + (length % 2);
    if (paddedEnd > buffer.length) fail('INVALID_WEBP', 'WebP chunk extends outside the file.');
    if (length % 2 && buffer[dataEnd] !== 0) fail('WEBP_CHUNK_FORBIDDEN', 'WebP chunk padding must not carry data.');
    if (forbidden.has(type)) fail('WEBP_METADATA_FORBIDDEN', 'WebP contains a metadata channel that is not allowed in evidence.');
    if (!allowed.has(type)) fail('WEBP_CHUNK_FORBIDDEN', 'WebP contains a chunk outside the exact evidence pixel allowlist.');
    counts.set(type, (counts.get(type) || 0) + 1);
    const candidate = webpDimensions(type, buffer.subarray(dataStart, dataEnd));
    if (candidate) dimensions = dimensions || candidate;
    if (type === 'VP8X') {
      if (stage !== 0) fail('INVALID_WEBP', 'Animated WebP extended header must be the first chunk.');
      stage = 1;
    } else if (type === 'ANIM') {
      if (stage !== 1) fail('INVALID_WEBP', 'Animated WebP control chunk must follow its extended header.');
      stage = 2;
    } else if (type === 'ANMF') {
      if (stage < 2 || !dimensions?.animationFlag) fail('INVALID_WEBP', 'Animated WebP frame order is invalid.');
      stage = 3;
    } else if (stage >= 2) {
      fail('INVALID_WEBP', 'Animated WebP contains an out-of-order top-level image chunk.');
    }
    if (type === 'ANIM') {
      if (length !== 6) fail('INVALID_WEBP', 'Animated WebP control chunk has an invalid length.');
      animChunks += 1;
    }
    if (type === 'ANMF') {
      validateAnimatedFrame(buffer.subarray(dataStart, dataEnd), dimensions);
      frameChunks += 1;
    }
    offset = paddedEnd;
  }
  if (offset !== buffer.length || !dimensions || !dimensions.width || !dimensions.height || dimensions.width * dimensions.height > LIMITS.imagePixels) {
    fail('INVALID_WEBP', 'WebP dimensions or chunk alignment are invalid.');
  }
  if ((counts.get('VP8X') || 0) > 1 || (counts.get('VP8 ') || 0) + (counts.get('VP8L') || 0) > 1 || (counts.get('ALPH') || 0) > 1) {
    fail('INVALID_WEBP', 'WebP contains duplicate top-level structural chunks.');
  }
  const animated = dimensions.animationFlag && counts.get('VP8X') === 1 && animChunks === 1 && frameChunks >= 2 &&
    !counts.has('VP8 ') && !counts.has('VP8L') && !counts.has('ALPH');
  if (requireAnimation && !animated) fail('NOT_ANIMATED_WEBP', 'Recording output must be an animated WebP with at least two frames.');
  return {
    mimeType: 'image/webp',
    width: dimensions.width,
    height: dimensions.height,
    bytes: buffer.length,
    sha256: sha256Bytes(buffer),
    animated,
    frames: frameChunks
  };
}

export function toPublicFailure(error) {
  return {
    ok: false,
    code: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR',
    message: error instanceof EvidenceError ? error.message : 'The evidence helper stopped on an unexpected error.'
  };
}
