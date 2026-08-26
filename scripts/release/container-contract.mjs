import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual, TextDecoder } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { compareBoundFiles, expectedServerFiles } from './source-binding.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true });
const maximumUncompressedLayerBytes = 256 * 1024 * 1024;

const expectedRuntimeConfiguration = Object.freeze({
  Cmd: ['node', 'server/index.js'],
  WorkingDir: '/opt/hair-growth',
  ExposedPorts: { '4782/tcp': {} },
  Volumes: { '/data': {} },
  Healthcheck: {
    Test: [
      'CMD',
      'node',
      '-e',
      "const http=require('node:http');const request=http.get('http://127.0.0.1:4782/health',(response)=>{response.resume();process.exit(response.statusCode===200?0:1)});request.setTimeout(2000,()=>request.destroy(new Error('timeout')));request.on('error',()=>process.exit(1));"
    ],
    Interval: 30_000_000_000,
    Timeout: 3_000_000_000,
    StartPeriod: 5_000_000_000,
    Retries: 3
  },
  StopSignal: 'SIGTERM'
});

function exactLine(text, expression, message) {
  if (!expression.test(text.replace(/\r\n/g, '\n'))) throw new TypeError(message);
}

export function validateContainerSourceContract({ dockerfile, compose, metadata }) {
  const container = metadata?.container;
  if (!container || !/^node:22-alpine@sha256:[0-9a-f]{64}$/.test(container.baseImage || '')) {
    throw new TypeError('Container metadata must pin the Node base by digest.');
  }
  if (container.baseImageIndexDigest !== container.baseImage.split('@')[1] || !/^sha256:[0-9a-f]{64}$/.test(container.baseImageManifestDigest || '') || container.baseImageManifestDigest === container.baseImageIndexDigest) {
    throw new TypeError('Container base index and selected manifest digest metadata is inconsistent.');
  }
  exactLine(dockerfile, new RegExp(`^FROM ${container.baseImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), 'Dockerfile does not use the metadata base image.');
  exactLine(dockerfile, /^ARG BUILD_CREATED_AT=1970-01-01T00:00:00Z$/m, 'Dockerfile does not declare a deterministic creation instant.');
  exactLine(dockerfile, /^\s*org\.opencontainers\.image\.created="\$\{BUILD_CREATED_AT\}"/m, 'Dockerfile does not label the image creation instant.');
  exactLine(dockerfile, /^\s*org\.opencontainers\.image\.base\.index\.digest="\$\{BASE_IMAGE_INDEX_DIGEST\}"/m, 'Dockerfile does not label the immutable base index digest.');
  exactLine(dockerfile, /^\s*org\.opencontainers\.image\.base\.digest="\$\{BASE_IMAGE_MANIFEST_DIGEST\}"/m, 'Dockerfile does not label the selected platform base manifest digest.');
  exactLine(dockerfile, /^\s*HAIR_HOST=0\.0\.0\.0\s*\\?$/m, 'Dockerfile must bind a direct container run to all container interfaces.');
  exactLine(dockerfile, /^USER node:node$/m, 'Dockerfile must use the non-root node account.');
  exactLine(dockerfile, /^COPY --chown=node:node \. \.\/server$/m, 'Dockerfile must copy only the bounded server context.');
  exactLine(dockerfile, /^WORKDIR \/opt\/hair-growth$/m, 'Dockerfile working directory contract is incomplete.');
  exactLine(dockerfile, /^EXPOSE 4782$/m, 'Dockerfile exposed-port contract is incomplete.');
  exactLine(dockerfile, /^VOLUME \["\/data"\]$/m, 'Dockerfile volume contract is incomplete.');
  exactLine(dockerfile, /^HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\\n  CMD \["node", "-e", "const http=require\('node:http'\);const request=http\.get\('http:\/\/127\.0\.0\.1:4782\/health',\(response\)=>\{response\.resume\(\);process\.exit\(response\.statusCode===200\?0:1\)\}\);request\.setTimeout\(2000,\(\)=>request\.destroy\(new Error\('timeout'\)\)\);request\.on\('error',\(\)=>process\.exit\(1\)\);"\]$/m, 'Dockerfile healthcheck contract is incomplete.');
  exactLine(dockerfile, /^STOPSIGNAL SIGTERM$/m, 'Dockerfile stop-signal contract is incomplete.');
  exactLine(dockerfile, /^CMD \["node", "server\/index\.js"\]$/m, 'Dockerfile command contract is incomplete.');
  if (/^\s*ENTRYPOINT\b/m.test(dockerfile.replace(/\r\n/g, '\n'))) throw new TypeError('Dockerfile must inherit the selected base Entrypoint unchanged.');
  exactLine(compose, /^\s+read_only:\s+true$/m, 'Compose must make the root filesystem read-only.');
  exactLine(compose, /^\s+user:\s+"1000:1000"$/m, 'Compose must enforce a non-root numeric identity.');
  exactLine(compose, /^\s+- no-new-privileges:true$/m, 'Compose must disable privilege escalation.');
  exactLine(compose, /^\s+- ALL$/m, 'Compose must drop all Linux capabilities.');
  if (!isDeepStrictEqual(container.runtime, {
    user: 'node:node',
    host: '0.0.0.0',
    port: 4782,
    readOnlyRequired: true,
    noNewPrivilegesRequired: true,
    capabilitiesDropped: ['ALL']
  })) {
    throw new TypeError('Container metadata runtime contract is incomplete.');
  }
  return true;
}

function decodeUtf8(bytes, label) {
  let value;
  try {
    value = fatalUtf8Decoder.decode(bytes);
  } catch {
    throw new TypeError(`${label} is not valid UTF-8.`);
  }
  if (!Buffer.from(value, 'utf8').equals(Buffer.from(bytes))) throw new TypeError(`${label} does not round-trip as UTF-8.`);
  return value;
}

function readTarString(buffer, start, length, label = 'Tar text field') {
  const field = buffer.subarray(start, start + length);
  const nul = field.indexOf(0);
  if (nul >= 0 && !field.subarray(nul).every((byte) => byte === 0)) throw new TypeError(`${label} has nonzero bytes after its terminator.`);
  return decodeUtf8(nul >= 0 ? field.subarray(0, nul) : field, label);
}

function readTerminatedUtf8(bytes, label) {
  const nul = bytes.indexOf(0);
  if (nul >= 0 && !bytes.subarray(nul).every((byte) => byte === 0)) throw new TypeError(`${label} has nonzero bytes after its terminator.`);
  return decodeUtf8(nul >= 0 ? bytes.subarray(0, nul) : bytes, label);
}

function tarDialect(header) {
  const magic = header.subarray(257, 263);
  const version = header.subarray(263, 265);
  if (magic.equals(Buffer.from([0x75, 0x73, 0x74, 0x61, 0x72, 0x00])) && version.equals(Buffer.from('00', 'ascii'))) {
    return { name: 'posix-ustar', hasPrefix: true };
  }
  if (magic.equals(Buffer.from('ustar ', 'ascii')) && version.equals(Buffer.from([0x20, 0x00]))) {
    return { name: 'gnu', hasPrefix: false };
  }
  throw new TypeError('Tar header dialect is unsupported.');
}

function readTarOctal(buffer, start, length) {
  const field = buffer.subarray(start, start + length);
  const nul = field.indexOf(0);
  if (nul >= 0 && !field.subarray(nul + 1).every((byte) => byte === 0 || byte === 0x20)) {
    throw new TypeError('Tar numeric field has bytes outside the supported octal grammar after its terminator.');
  }
  const bytes = nul >= 0 ? field.subarray(0, nul) : field;
  if (bytes.some((byte) => byte !== 0x20 && (byte < 0x30 || byte > 0x37))) throw new TypeError('Tar numeric field is not valid octal.');
  const raw = bytes.toString('ascii').trim();
  if (!raw) return 0;
  if (!/^[0-7]+$/.test(raw)) throw new TypeError('Tar numeric field is not valid octal.');
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Tar numeric field is outside the supported range.');
  return value;
}

function verifyTarChecksum(header) {
  const expected = readTarOctal(header, 148, 8);
  const canonical = Buffer.from(header);
  canonical.fill(0x20, 148, 156);
  const actual = [...canonical].reduce((sum, byte) => sum + byte, 0);
  if (actual !== expected) throw new TypeError('Tar header checksum is invalid.');
}

function canonicalTarPath(value, type) {
  if (typeof value !== 'string' || value.includes('\\') || value.startsWith('/')) throw new TypeError('Tar entry path is unsafe.');
  let name = value;
  while (name.startsWith('./')) name = name.slice(2);
  if (type === 'directory') name = name.replace(/\/+$/, '');
  if (!name || name === '.') {
    if (type === 'directory') return null;
    throw new TypeError('Tar entry path is empty.');
  }
  const segments = name.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..') || path.posix.normalize(name) !== name) {
    throw new TypeError(`Tar entry path is noncanonical or unsafe: ${value}`);
  }
  return name;
}

function canonicalTarType(rawType) {
  const types = new Map([
    ['0', 'file'], ['\0', 'file'], ['', 'file'], ['1', 'hardlink'], ['2', 'symlink'],
    ['3', 'character-device'], ['4', 'block-device'], ['5', 'directory'], ['6', 'fifo'], ['7', 'contiguous-file']
  ]);
  return types.get(rawType) || `unsupported:${rawType}`;
}

function parsePaxRecords(bytes) {
  const records = {};
  for (let offset = 0; offset < bytes.length;) {
    const space = bytes.indexOf(0x20, offset);
    if (space < 0) throw new TypeError('PAX record is missing its byte length.');
    const lengthText = bytes.subarray(offset, space).toString('ascii');
    if (!/^[1-9][0-9]*$/.test(lengthText)) throw new TypeError('PAX record byte length is invalid.');
    const length = Number(lengthText);
    const end = offset + length;
    if (!Number.isSafeInteger(length) || end > bytes.length || bytes[end - 1] !== 0x0a) throw new TypeError('PAX record is truncated.');
    const record = decodeUtf8(bytes.subarray(space + 1, end - 1), 'PAX record');
    const separator = record.indexOf('=');
    if (separator < 1) throw new TypeError('PAX record has no key-value separator.');
    const key = record.slice(0, separator);
    if (Object.hasOwn(records, key)) throw new TypeError(`PAX record contains a duplicate key: ${key}`);
    records[key] = record.slice(separator + 1);
    offset = end;
  }
  return records;
}

function validatePaxRecords(records) {
  const metadataOnly = new Set(['atime', 'charset', 'comment', 'ctime', 'gid', 'gname', 'mtime', 'uid', 'uname']);
  for (const [key, value] of Object.entries(records)) {
    if (['path', 'linkpath'].includes(key)) {
      if (!value || value.includes('\0')) throw new TypeError(`PAX ${key} is empty or unsafe.`);
      continue;
    }
    if (key === 'size') {
      if (!/^(?:0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw new TypeError('PAX size is outside the supported range.');
      continue;
    }
    if (key === 'hdrcharset') {
      if (!['UTF-8', 'ISO-IR 10646 2000 UTF-8'].includes(value)) throw new TypeError(`PAX hdrcharset is unsupported: ${value}`);
      continue;
    }
    if (!metadataOnly.has(key)) throw new TypeError(`PAX extraction keyword is unsupported: ${key}`);
  }
  return records;
}

export function readTarEntries(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1024 || buffer.length % 512 !== 0) throw new TypeError('OCI archive is not a block-aligned tar file.');
  const entries = new Map();
  let globalPax = {};
  let pendingPax = null;
  let pendingLongName = null;
  let pendingLongLink = null;
  let sawTerminator = false;
  for (let offset = 0; offset + 512 <= buffer.length;) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (buffer.length - offset < 1024 || !buffer.subarray(offset).every((byte) => byte === 0)) {
        throw new TypeError('Tar archive requires two zero terminator blocks and zero through end of file.');
      }
      sawTerminator = true;
      break;
    }
    verifyTarChecksum(header);
    const dialect = tarDialect(header);
    const name = readTarString(header, 0, 100, 'Tar entry name');
    readTarString(header, 265, 32, 'Tar owner name');
    readTarString(header, 297, 32, 'Tar group name');
    const prefix = dialect.hasPrefix ? readTarString(header, 345, 155, 'Tar USTAR prefix') : '';
    const headerName = `${prefix ? `${prefix}/` : ''}${name}`;
    const rawType = readTarString(header, 156, 1, 'Tar entry type') || '0';
    const headerSize = readTarOctal(header, 124, 12);
    const extractionPax = { ...globalPax, ...(pendingPax || {}) };
    const size = !['x', 'g', 'L', 'K'].includes(rawType) && Object.hasOwn(extractionPax, 'size')
      ? Number(extractionPax.size)
      : headerSize;
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    const nextOffset = dataStart + Math.ceil(size / 512) * 512;
    if (dataEnd > buffer.length || nextOffset > buffer.length) throw new TypeError('OCI tar entry is truncated.');
    const data = Buffer.from(buffer.subarray(dataStart, dataEnd));
    offset = nextOffset;

    if (rawType === 'x' || rawType === 'g') {
      const pax = validatePaxRecords(parsePaxRecords(data));
      if (rawType === 'g') globalPax = { ...globalPax, ...pax };
      else {
        if (pendingPax) throw new TypeError('Tar archive contains competing pending PAX headers.');
        pendingPax = pax;
      }
      continue;
    }
    if (rawType === 'L' || rawType === 'K') {
      const value = readTerminatedUtf8(data, 'GNU tar long-name metadata');
      if (!value) throw new TypeError('GNU tar long-name metadata is empty.');
      if (rawType === 'L') {
        if (pendingLongName) throw new TypeError('Tar archive contains competing GNU long paths.');
        pendingLongName = value;
      } else {
        if (pendingLongLink) throw new TypeError('Tar archive contains competing GNU long link paths.');
        pendingLongLink = value;
      }
      continue;
    }

    const attributes = { ...globalPax, ...(pendingPax || {}) };
    const type = canonicalTarType(rawType);
    if (pendingLongName && Object.hasOwn(attributes, 'path')) throw new TypeError('Tar archive contains a competing extended path source.');
    if (pendingLongLink && Object.hasOwn(attributes, 'linkpath')) throw new TypeError('Tar archive contains a competing extended link path source.');
    const fullName = canonicalTarPath(pendingLongName ?? attributes.path ?? headerName, type);
    const linkName = (pendingLongLink ?? attributes.linkpath ?? readTarString(header, 157, 100, 'Tar link target')) || null;
    pendingPax = null;
    pendingLongName = null;
    pendingLongLink = null;
    if (fullName === null) continue;
    if (entries.has(fullName)) throw new TypeError(`Tar archive contains a duplicate entry path: ${fullName}`);
    if (['directory', 'hardlink', 'symlink', 'character-device', 'block-device', 'fifo'].includes(type) && data.length !== 0) {
      throw new TypeError(`Tar ${type} entry must not carry file bytes: ${fullName}`);
    }
    if (['hardlink', 'symlink'].includes(type) && (!linkName || Buffer.byteLength(linkName) > 4096 || linkName.includes('\0'))) {
      throw new TypeError(`Tar ${type} entry has an invalid link target: ${fullName}`);
    }
    if (type === 'hardlink') canonicalTarPath(linkName, 'file');
    entries.set(fullName, { type, linkName, bytes: data });
  }
  if (!sawTerminator) throw new TypeError('Tar archive requires two zero terminator blocks and zero through end of file.');
  if (pendingPax || pendingLongName || pendingLongLink) throw new TypeError('Tar archive ends with unapplied extended metadata.');
  return entries;
}

function writeTarString(header, offset, length, value) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length > length) throw new TypeError(`Tar value is too long: ${value}`);
  bytes.copy(header, offset);
}

function writeTarOctal(header, offset, length, value) {
  const digits = value.toString(8).padStart(length - 1, '0');
  writeTarString(header, offset, length, `${digits}\0`);
}

function tarHeader(name, size, epochSeconds, rawType = '0', linkName = '') {
  const header = Buffer.alloc(512);
  let shortName = name;
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const split = name.lastIndexOf('/', 100);
    if (split < 1) throw new TypeError(`Tar path cannot be represented safely: ${name}`);
    prefix = name.slice(0, split);
    shortName = name.slice(split + 1);
  }
  writeTarString(header, 0, 100, shortName);
  writeTarOctal(header, 100, 8, 0o644);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, size);
  writeTarOctal(header, 136, 12, epochSeconds);
  header.fill(0x20, 148, 156);
  header[156] = rawType.charCodeAt(0);
  if (linkName) writeTarString(header, 157, 100, linkName);
  writeTarString(header, 257, 6, 'ustar');
  writeTarString(header, 263, 2, '00');
  writeTarString(header, 265, 32, 'root');
  writeTarString(header, 297, 32, 'root');
  writeTarString(header, 345, 155, prefix);
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, '0');
  writeTarString(header, 148, 8, `${checksumText}\0 `);
  return header;
}

export function canonicalTar(entries, epochSeconds) {
  const parts = [];
  for (const [name, value] of [...entries.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const record = Buffer.isBuffer(value) ? { type: 'file', bytes: value, linkName: '' } : value;
    if (!record || !Buffer.isBuffer(record.bytes || Buffer.alloc(0))) throw new TypeError(`Canonical tar record is invalid: ${name}`);
    const typeCodes = { file: '0', hardlink: '1', symlink: '2', directory: '5' };
    const rawType = typeCodes[record.type];
    if (!rawType) throw new TypeError(`Canonical tar record type is unsupported: ${record.type}`);
    const data = record.bytes || Buffer.alloc(0);
    const linkName = record.linkName || '';
    canonicalTarPath(name, record.type);
    if (['hardlink', 'symlink', 'directory'].includes(record.type) && data.length !== 0) throw new TypeError(`Canonical tar ${record.type} record must not carry bytes.`);
    if (['hardlink', 'symlink'].includes(record.type) && !linkName) throw new TypeError(`Canonical tar ${record.type} record requires a link target.`);
    parts.push(tarHeader(name, data.length, epochSeconds, rawType, linkName), data);
    const padding = (512 - (data.length % 512)) % 512;
    if (padding) parts.push(Buffer.alloc(padding));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseJsonBytes(bytes, label) {
  const text = decodeUtf8(bytes, label);
  try {
    return JSON.parse(text);
  } catch {
    throw new TypeError(`${label} is not valid JSON.`);
  }
}

function readJsonEntry(entries, name) {
  const record = entries.get(name);
  if (!record || record.type !== 'file') throw new TypeError(`OCI archive is missing regular file ${name}.`);
  return parseJsonBytes(record.bytes, `OCI ${name}`);
}

function readDigestBlob(entries, descriptor, allowedMediaTypes) {
  const digest = descriptor?.digest;
  if (!/^sha256:[0-9a-f]{64}$/.test(digest || '')) throw new TypeError(`OCI descriptor digest is invalid: ${digest}`);
  if (!Number.isSafeInteger(descriptor.size) || descriptor.size < 1) throw new TypeError(`OCI descriptor size is invalid for ${digest}.`);
  if (!Array.isArray(allowedMediaTypes) || !allowedMediaTypes.includes(descriptor.mediaType)) {
    throw new TypeError(`OCI descriptor media type is unsupported: ${descriptor.mediaType}`);
  }
  const name = `blobs/sha256/${digest.slice(7)}`;
  const record = entries.get(name);
  if (!record || record.type !== 'file') throw new TypeError(`OCI archive is missing regular descriptor blob ${digest}.`);
  if (sha256(record.bytes) !== digest.slice(7)) throw new TypeError(`OCI descriptor blob hash disagrees for ${digest}.`);
  if (record.bytes.length !== descriptor.size) throw new TypeError(`OCI descriptor size disagrees with blob bytes for ${digest}.`);
  return record.bytes;
}

function proofBytes(base64, byteLength, label) {
  if (typeof base64 !== 'string' || !Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > 16 * 1024 * 1024 || base64.length > Math.ceil(byteLength / 3) * 4 + 4) {
    throw new TypeError(`${label} is incomplete or outside the supported size.`);
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length !== byteLength || bytes.toString('base64') !== base64) throw new TypeError(`${label} is not canonical base64.`);
  return bytes;
}

function descriptorIdentity(descriptor) {
  return { mediaType: descriptor?.mediaType, digest: descriptor?.digest, size: descriptor?.size };
}

function validateArchiveBaseProof(proof, expected) {
  if (proof?.source !== 'docker-buildx-imagetools-inspect' || proof.selectedManifest?.source !== 'docker-buildx-imagetools-inspect-raw' || proof.selectedConfigProjection?.source !== 'docker-buildx-imagetools-inspect-raw-config') {
    throw new TypeError('Container base ancestry proof is incomplete.');
  }
  const rawIndex = proofBytes(proof.rawIndexBase64, proof.rawIndexBytes, 'Retained base index');
  const rawManifest = proofBytes(proof.selectedManifest.rawBase64, proof.selectedManifest.rawBytes, 'Retained selected base manifest');
  const rawProjection = proofBytes(proof.selectedConfigProjection.rawBase64, proof.selectedConfigProjection.rawBytes, 'Retained selected base config projection');
  const indexDigest = `sha256:${sha256(rawIndex)}`;
  const manifestDigest = `sha256:${sha256(rawManifest)}`;
  const projectionDigest = `sha256:${sha256(rawProjection)}`;
  if (indexDigest !== expected.baseIndexDigest || proof.indexDigest !== indexDigest) throw new TypeError('Retained base index bytes disagree with release provenance.');
  if (manifestDigest !== expected.baseManifestDigest || proof.selectedManifest.digest !== manifestDigest || proof.selectedManifest.rawSha256 !== manifestDigest) {
    throw new TypeError('Retained selected base manifest bytes disagree with release provenance.');
  }
  if (proof.selectedConfigProjection.rawSha256 !== projectionDigest) throw new TypeError('Retained selected base config projection hash is invalid.');

  const index = parseJsonBytes(rawIndex, 'Retained base index');
  const candidates = (index.manifests || []).filter((descriptor) => descriptor.platform?.os === 'linux' && descriptor.platform?.architecture === 'amd64' && !descriptor.platform?.variant);
  if (candidates.length !== 1 || !isDeepStrictEqual(candidates[0], proof.selectedDescriptor)) throw new TypeError('Retained selected base descriptor is not exact.');
  if (candidates[0].digest !== manifestDigest || candidates[0].size !== rawManifest.length) throw new TypeError('Retained selected base descriptor does not bind the manifest bytes.');

  const manifest = parseJsonBytes(rawManifest, 'Retained selected base manifest');
  if (manifest.schemaVersion !== 2 || !isDeepStrictEqual(manifest.config, proof.selectedManifest.configDescriptor) || !isDeepStrictEqual(manifest.layers, proof.selectedManifest.layerDescriptors)) {
    throw new TypeError('Retained selected base config or layer descriptors are not exact.');
  }
  if (!manifest.config || !/^sha256:[0-9a-f]{64}$/.test(manifest.config.digest || '') || !Number.isSafeInteger(manifest.config.size) || manifest.config.size < 1) {
    throw new TypeError('Retained selected base config descriptor is invalid.');
  }
  if (projectionDigest !== manifest.config.digest || rawProjection.length !== manifest.config.size) {
    throw new TypeError('Retained selected base config bytes disagree with its descriptor.');
  }
  if (!Array.isArray(manifest.layers) || manifest.layers.length === 0 || manifest.layers.some((layer) => !/^sha256:[0-9a-f]{64}$/.test(layer?.digest || '') || !Number.isSafeInteger(layer?.size) || layer.size < 1)) {
    throw new TypeError('Retained selected base layer descriptors are invalid.');
  }

  const projection = parseJsonBytes(rawProjection, 'Retained selected base config projection');
  const baseDiffIds = projection.rootfs?.diff_ids;
  const inheritedEntrypoint = projection.config?.Entrypoint ?? null;
  if (projection.os !== 'linux' || projection.architecture !== 'amd64' || projection.rootfs?.type !== 'layers' || !Array.isArray(baseDiffIds) || baseDiffIds.length !== manifest.layers.length || baseDiffIds.some((digest) => !/^sha256:[0-9a-f]{64}$/.test(digest || ''))) {
    throw new TypeError('Retained selected base config projection rootfs is invalid.');
  }
  if (!isDeepStrictEqual(baseDiffIds, proof.selectedConfigProjection.rootfsDiffIds) || !isDeepStrictEqual(inheritedEntrypoint, proof.selectedConfigProjection.inheritedEntrypoint)) {
    throw new TypeError('Retained selected base config projection summary is not exact.');
  }
  if (inheritedEntrypoint !== null && (!Array.isArray(inheritedEntrypoint) || inheritedEntrypoint.length === 0 || inheritedEntrypoint.some((value) => typeof value !== 'string' || !value))) {
    throw new TypeError('Retained selected base Entrypoint is invalid.');
  }
  return { manifest, baseDiffIds, inheritedEntrypoint };
}

function resolveArchiveBaseProof(archivePath, expected) {
  if (expected.baseProof) return validateArchiveBaseProof(expected.baseProof, expected);
  const manifestPath = path.join(path.dirname(path.resolve(archivePath)), 'container-manifest.json');
  if (!fs.existsSync(manifestPath)) throw new TypeError('Container archive validation requires retained base ancestry proof.');
  const stat = fs.lstatSync(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > 32 * 1024 * 1024) throw new TypeError('Container manifest carrying base ancestry proof is not a bounded regular file.');
  const transferredManifest = parseJsonBytes(fs.readFileSync(manifestPath), 'Transferred container manifest');
  return validateArchiveBaseProof(transferredManifest.baseProof, expected);
}

const layerMediaTypes = [
  'application/vnd.oci.image.layer.v1.tar+gzip',
  'application/vnd.docker.image.rootfs.diff.tar.gzip',
  'application/vnd.oci.image.layer.v1.tar'
];

function readContainerLayers(entries, manifest) {
  if (!Array.isArray(manifest.layers) || manifest.layers.length === 0) throw new TypeError('OCI manifest has no layers.');
  return manifest.layers.map((descriptor) => {
    const blob = readDigestBlob(entries, descriptor, layerMediaTypes);
    let tar;
    try {
      tar = descriptor.mediaType === 'application/vnd.oci.image.layer.v1.tar'
        ? blob
        : gunzipSync(blob, { maxOutputLength: maximumUncompressedLayerBytes });
      if (tar.length > maximumUncompressedLayerBytes) throw new TypeError('OCI layer exceeds the supported uncompressed byte limit.');
    } catch {
      throw new TypeError(`OCI compressed layer is invalid: ${descriptor.digest}`);
    }
    return {
      descriptor,
      tar,
      diffId: `sha256:${sha256(tar)}`,
      entries: readTarEntries(tar)
    };
  });
}

function containerServerFiles(layers) {
  const files = new Map();
  for (const layer of layers) {
    const additions = [];
    const whiteouts = [];
    for (const [name, record] of layer.entries) {
      const basename = path.posix.basename(name);
      const directory = path.posix.dirname(name);
      if (basename === '.wh..wh..opq') {
        if (record.type !== 'file' || record.bytes.length !== 0) throw new TypeError(`OCI whiteout must be an empty regular file: ${name}`);
        whiteouts.push({ type: 'opaque', directory });
        continue;
      }
      if (basename.startsWith('.wh.')) {
        if (record.type !== 'file' || record.bytes.length !== 0) throw new TypeError(`OCI whiteout must be an empty regular file: ${name}`);
        const targetName = basename.slice(4);
        if (!targetName || targetName === '.' || targetName === '..') throw new TypeError(`OCI whiteout must name a nonempty target: ${name}`);
        whiteouts.push({ type: 'remove', target: path.posix.join(directory, targetName) });
        continue;
      }
      additions.push([name, record]);
    }
    for (const whiteout of whiteouts) {
      if (whiteout.type === 'opaque') {
        const prefix = whiteout.directory === '.' ? '' : `${whiteout.directory}/`;
        for (const existing of [...files.keys()]) {
          if (!prefix || existing.startsWith(prefix)) files.delete(existing);
        }
        continue;
      }
      files.delete(whiteout.target);
      for (const existing of [...files.keys()]) if (existing.startsWith(`${whiteout.target}/`)) files.delete(existing);
    }
    for (const [name, record] of additions) {
      if (record.type !== 'directory') {
        for (const existing of [...files.keys()]) if (existing.startsWith(`${name}/`)) files.delete(existing);
      }
      files.set(name, record);
    }
  }
  const server = new Map();
  const serverPrefix = 'opt/hair-growth/server/';
  for (const [name, record] of files) {
    if (!name.startsWith(serverPrefix)) continue;
    const relative = name.slice(serverPrefix.length);
    if (!relative) continue;
    const ancestors = name.split('/').slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join('/'));
    const blockedAncestor = ancestors.find((ancestor) => files.has(ancestor) && files.get(ancestor).type !== 'directory');
    if (blockedAncestor) throw new TypeError(`OCI server payload is hidden by a non-directory ancestor: ${blockedAncestor}`);
    if (record.type !== 'file') throw new TypeError(`OCI server payload path must be a regular file: ${relative}`);
    server.set(relative, record.bytes);
  }
  return server;
}

export function validateContainerArchive(archivePath, expected) {
  const base = resolveArchiveBaseProof(archivePath, expected);
  const archive = fs.readFileSync(archivePath);
  const entries = readTarEntries(archive);
  const layout = readJsonEntry(entries, 'oci-layout');
  const index = readJsonEntry(entries, 'index.json');
  if (layout.imageLayoutVersion !== '1.0.0' || index.schemaVersion !== 2 || index.manifests?.length !== 1) {
    throw new TypeError('OCI layout or index is unsupported.');
  }
  for (const [name, record] of entries) {
    const match = /^blobs\/sha256\/([0-9a-f]{64})$/.exec(name);
    if (match && (record.type !== 'file' || sha256(record.bytes) !== match[1])) throw new TypeError(`OCI content-addressed blob is corrupt or non-regular: ${name}`);
  }
  const descriptor = index.manifests[0];
  if (descriptor.platform?.os !== 'linux' || descriptor.platform?.architecture !== 'amd64') throw new TypeError('OCI index platform must be linux/amd64.');
  const manifest = parseJsonBytes(readDigestBlob(entries, descriptor, ['application/vnd.oci.image.manifest.v1+json']), 'OCI image manifest');
  const config = parseJsonBytes(readDigestBlob(entries, manifest.config, ['application/vnd.oci.image.config.v1+json']), 'OCI image config');
  const layers = readContainerLayers(entries, manifest);
  if (config.os !== 'linux' || config.architecture !== 'amd64') throw new TypeError('OCI configuration platform must be linux/amd64.');
  if (config.config?.User !== 'node:node') throw new TypeError('OCI configuration does not use the exact non-root account.');
  if (!(config.config?.Env || []).includes('HAIR_HOST=0.0.0.0')) throw new TypeError('OCI configuration is not reachable through a direct published port.');
  const computedDiffIds = layers.map((layer) => layer.diffId);
  if (config.rootfs?.type !== 'layers' || !isDeepStrictEqual(config.rootfs.diff_ids, computedDiffIds)) {
    throw new TypeError('OCI configuration rootfs diff_ids do not match every uncompressed layer in order.');
  }
  if (manifest.layers.length < base.manifest.layers.length || base.manifest.layers.some((layer, index) => !isDeepStrictEqual(descriptorIdentity(manifest.layers[index]), descriptorIdentity(layer)))) {
    throw new TypeError('OCI manifest base layer prefix does not match the exact selected base manifest.');
  }
  if (!isDeepStrictEqual(computedDiffIds.slice(0, base.baseDiffIds.length), base.baseDiffIds)) {
    throw new TypeError('OCI configuration base rootfs diff_ids prefix does not match the selected base config projection.');
  }
  const runtimeConfiguration = config.config || {};
  const exactRuntimeFields = {
    ...expectedRuntimeConfiguration,
    Entrypoint: base.inheritedEntrypoint
  };
  for (const [field, value] of Object.entries(exactRuntimeFields)) {
    if (!isDeepStrictEqual(runtimeConfiguration[field], value)) throw new TypeError(`OCI runtime configuration ${field} does not match the committed Dockerfile and selected base contract.`);
  }
  const labels = config.config?.Labels || {};
  const requiredLabels = {
    'org.opencontainers.image.version': expected.version,
    'org.opencontainers.image.revision': expected.commit,
    'org.opencontainers.image.source': 'https://github.com/Ding-Ding-Projects/HairGrowthEstimator',
    'org.opencontainers.image.created': expected.createdAt,
    'org.opencontainers.image.base.index.digest': expected.baseIndexDigest,
    'org.opencontainers.image.base.digest': expected.baseManifestDigest
  };
  for (const [name, value] of Object.entries(requiredLabels)) {
    if (labels[name] !== value) throw new TypeError(`OCI label ${name} does not match release provenance.`);
  }
  const sourceBinding = compareBoundFiles(expectedServerFiles(expected.commit), containerServerFiles(layers), 'OCI server payload');
  return {
    archivePath: path.resolve(archivePath),
    archiveBytes: archive.length,
    archiveSha256: sha256(archive),
    imageDigest: descriptor.digest,
    configDigest: manifest.config.digest,
    layers: manifest.layers.length,
    platform: 'linux/amd64',
    user: config.config.User,
    labels: requiredLabels,
    sourceBinding
  };
}

export function validateCurrentContainerSources() {
  const dockerfile = fs.readFileSync(path.join(repositoryRoot, 'Dockerfile'), 'utf8');
  const compose = fs.readFileSync(path.join(repositoryRoot, 'docker-compose.yml'), 'utf8');
  const metadata = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'app', 'release-metadata.json'), 'utf8'));
  return validateContainerSourceContract({ dockerfile, compose, metadata });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  validateCurrentContainerSources();
  process.stdout.write('Container source contract is complete and deterministic inputs are pinned.\n');
}
