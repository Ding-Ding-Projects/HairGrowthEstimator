import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, '..');
const output = resolve(process.env.SITE_OUTPUT_DIR || join(root, '_site'));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const expectedStages = [0.3, 1.5, 3, 5, 9, 14, 20, 28];
const MAX_INSTALLER_MANIFEST_BYTES = 64 * 1024;
const MAX_HAIR_MANIFEST_BYTES = 64 * 1024;

function git(...args) {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

function validIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function buildTimestamp() {
  if (process.env.SOURCE_DATE_EPOCH && /^\d+$/.test(process.env.SOURCE_DATE_EPOCH)) return new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString();
  const commitTime = git('show', '-s', '--format=%cI', 'HEAD');
  return validIso(commitTime) ? new Date(commitTime).toISOString() : null;
}

function exactFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const keys = Object.keys(value);
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  const extra = keys.filter((field) => !fields.includes(field));
  if (missing.length || extra.length) throw new Error(`${label} manifest mismatch. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${extra.join(', ') || 'none'}.`);
}

function validateInstallerManifest(value, { commit, version }) {
  const fields = ['schemaVersion', 'owner', 'repository', 'tag', 'target', 'version', 'platform', 'filename', 'bytes', 'sha256', 'unsigned', 'publication'];
  exactFields(value, fields, 'Installer');
  if (value.schemaVersion !== 1) throw new Error('Installer manifest schemaVersion must be 1.');
  if (value.owner !== 'Ding-Ding-Projects' || value.repository !== 'HairGrowthEstimator') throw new Error('Installer manifest owner and repository do not match this project.');
  if (value.version !== version) throw new Error(`Installer manifest version must match package version ${version}.`);
  if (value.target !== commit || !/^[a-f0-9]{40}$/.test(value.target)) throw new Error('Installer manifest target must match the exact composed commit.');
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (typeof value.tag !== 'string' || value.tag.length > 128 || !new RegExp(`^v?${escapedVersion}(?:[-.][0-9A-Za-z.-]+)?$`).test(value.tag)) throw new Error('Installer manifest tag must be a bounded immutable version tag for this package version.');
  if (value.platform !== 'windows-x64') throw new Error('Installer manifest platform must be windows-x64.');
  if (typeof value.filename !== 'string' || value.filename.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.exe$/.test(value.filename) || !value.filename.includes(version)) throw new Error('Installer manifest filename must be a safe versioned .exe basename.');
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > 2 * 1024 * 1024 * 1024) throw new Error('Installer manifest bytes must be a positive safe value no larger than 2 GiB.');
  if (!/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error('Installer manifest SHA-256 must be lowercase 64-hex.');
  if (value.unsigned !== true) throw new Error('Installer manifest must state that the artifact is unsigned.');
  exactFields(value.publication, ['state', 'draft', 'prerelease', 'publishedAt', 'releaseId', 'assetId', 'url'], 'Installer publication');
  if (value.publication.state !== 'published' || value.publication.draft !== false || typeof value.publication.prerelease !== 'boolean') throw new Error('Installer publication must describe a published, non-draft release.');
  if (!validIso(value.publication.publishedAt)) throw new Error('Installer publication time must be a valid ISO date and time.');
  if (!Number.isSafeInteger(value.publication.releaseId) || value.publication.releaseId < 1 || !Number.isSafeInteger(value.publication.assetId) || value.publication.assetId < 1) throw new Error('Installer publication release and asset identifiers must be positive safe integers.');
  const expectedUrl = `https://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/download/${value.tag}/${value.filename}`;
  if (value.publication.url !== expectedUrl) throw new Error('Installer publication URL must be the exact immutable GitHub release asset URL.');
  return structuredClone(value);
}

async function optionalInstaller(commit) {
  const candidates = [process.env.INSTALLER_MANIFEST, join(root, 'release', 'installer-manifest.json')].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const bytes = await readFile(resolve(candidate));
      if (bytes.length > MAX_INSTALLER_MANIFEST_BYTES) throw new Error(`Installer manifest exceeds the ${MAX_INSTALLER_MANIFEST_BYTES} byte limit.`);
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new Error('Installer manifest must be valid UTF-8 text.'); }
      const value = JSON.parse(text);
      return validateInstallerManifest(value, { commit, version: packageJson.version });
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw new Error(`Installer manifest ${candidate} was rejected: ${error.message}`);
    }
  }
  return null;
}

async function markdownFiles(directory) {
  const results = [];
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) results.push(...await markdownFiles(path));
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) results.push(path);
    }
  } catch {}
  return results.sort();
}

function markdownTitle(content, path) {
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return title || path.split(/[\\/]/).at(-1).replace(/\.md$/i, '').replace(/[-_]+/g, ' ');
}

async function bundledDocumentation() {
  const docsRoot = join(root, 'docs');
  const files = await markdownFiles(docsRoot);
  return Promise.all(files.map(async (path) => {
    const content = await readFile(path, 'utf8');
    const rel = relative(docsRoot, path).split(sep).join('/');
    return { id: rel.replace(/\.md$/i, '').replace(/[^a-z0-9/.-]+/gi, '-').toLowerCase(), title: markdownTitle(content, path), category: rel.includes('/') ? rel.split('/')[0] : 'General', path: `docs/${rel}`, content };
  }));
}

async function bundledChangelog() {
  let content = '';
  try { content = await readFile(join(root, 'CHANGELOG.md'), 'utf8'); } catch { return []; }
  const headings = [...content.matchAll(/^##\s+(?:\[?([^\]\s]+)\]?)(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/gm)];
  return headings.map((heading, index) => {
    const body = content.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? content.length).trim();
    const title = body.match(/^###\s+(.+)$/m)?.[1] || (heading[1].toLowerCase() === 'unreleased' ? 'Unreleased changes' : 'Recorded changes');
    const commit = body.match(/\b([a-f0-9]{40})\b/)?.[1] || null;
    return { version: heading[1], date: heading[2] || null, title, body: body.replace(/^###\s+.+$/m, '').trim().slice(0, 6000), commit };
  });
}

function inspectPng(bytes, file) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(bytes) || bytes.length < 57 || !bytes.subarray(0, 8).equals(signature)) throw new Error(`Hair asset ${file} has an invalid PNG signature.`);
  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let interlace = null;
  let sawHeader = false;
  let sawEnd = false;
  const imageData = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error(`Hair asset ${file} has a truncated PNG chunk.`);
    const length = bytes.readUInt32BE(offset);
    if (length > 16 * 1024 * 1024 || offset + 12 + length > bytes.length) throw new Error(`Hair asset ${file} has an invalid PNG chunk length.`);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(`Hair asset ${file} has an invalid PNG chunk type.`);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    if (actualCrc !== expectedCrc) throw new Error(`Hair asset ${file} has an invalid PNG chunk checksum.`);
    if (!sawHeader && type !== 'IHDR') throw new Error(`Hair asset ${file} does not begin with IHDR.`);
    if (type === 'IHDR') {
      if (sawHeader || length !== 13) throw new Error(`Hair asset ${file} has an invalid or duplicate IHDR chunk.`);
      sawHeader = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0) throw new Error(`Hair asset ${file} uses an unsupported PNG compression or filter method.`);
      interlace = data[12];
      if (interlace !== 0) throw new Error(`Hair asset ${file} must use the validated non-interlaced PNG layout.`);
    } else if (type === 'IDAT') imageData.push(data);
    else if (type === 'IEND') {
      if (sawEnd || length !== 0) throw new Error(`Hair asset ${file} has an invalid or duplicate IEND chunk.`);
      sawEnd = true;
      offset += 12;
      if (offset !== bytes.length) throw new Error(`Hair asset ${file} has bytes after IEND.`);
      break;
    }
    offset += 12 + length;
  }
  if (!sawHeader || !sawEnd || !imageData.length) throw new Error(`Hair asset ${file} is missing required PNG chunks.`);
  if (width !== 1254 || height !== 1254) throw new Error(`Hair asset ${file} must be exactly 1254 by 1254 pixels.`);
  const channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 })[colorType];
  if (!channels || bitDepth !== 8) throw new Error(`Hair asset ${file} must use an 8-bit grayscale, RGB, grayscale-alpha, or RGBA PNG layout.`);
  const expectedInflatedLength = (1 + width * channels) * height;
  let inflated;
  try { inflated = inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedInflatedLength }); }
  catch (error) { throw new Error(`Hair asset ${file} has invalid bounded PNG image data: ${error.message}`); }
  if (inflated.length !== expectedInflatedLength) throw new Error(`Hair asset ${file} PNG scanline dimensions do not match IHDR.`);
  for (let row = 0; row < height; row += 1) if (inflated[row * (1 + width * channels)] > 4) throw new Error(`Hair asset ${file} has an invalid PNG row filter.`);
  return { width, height, bitDepth, colorType };
}

function normalizeHairManifest(value) {
  exactFields(value, ['schemaVersion', 'unit', 'stages'], 'Hair asset');
  if (value.schemaVersion !== 1 || value.unit !== 'cm' || !Array.isArray(value.stages)) throw new Error('Hair asset manifest must use schemaVersion 1, unit cm, and a stages array.');
  if (value.stages.length !== expectedStages.length) throw new Error(`Hair asset manifest must contain exactly ${expectedStages.length} stages.`);
  return value.stages.map((entry, index) => {
    exactFields(entry, ['length', 'file', 'sha256'], `Hair asset stage ${index + 1}`);
    if (typeof entry.length !== 'number' || !Number.isFinite(entry.length)) throw new Error(`Hair asset manifest stage ${index + 1} must use a finite numeric length.`);
    if (typeof entry.file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/.test(entry.file)) throw new Error(`Hair asset stage ${index + 1} must use a safe PNG basename.`);
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Hair asset stage ${index + 1} must use a lowercase SHA-256 digest.`);
    return { file: entry.file, cm: entry.length, sha256: entry.sha256, alt: `Male hair reference at approximately ${entry.length} centimetres` };
  });
}

async function bundledHairStages() {
  const sourceDirectory = join(root, 'assets', 'hair-growth');
  let sourceEntries;
  try {
    sourceEntries = await readdir(sourceDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT' && process.env.REQUIRE_HAIR_ASSETS !== '1') return [];
    throw error;
  }
  try {
    const manifestBytes = await readFile(join(sourceDirectory, 'stages.json'));
    if (manifestBytes.length > MAX_HAIR_MANIFEST_BYTES) throw new Error(`Hair asset manifest exceeds the ${MAX_HAIR_MANIFEST_BYTES} byte limit.`);
    let manifestText;
    try { manifestText = new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes); }
    catch { throw new Error('Hair asset manifest must be valid UTF-8 text.'); }
    const manifestValue = JSON.parse(manifestText);
    const manifest = normalizeHairManifest(manifestValue);
    const stageSet = new Set();
    const fileSet = new Set();
    const digestSet = new Set();
    for (const entry of manifest) {
      if (stageSet.has(entry.cm)) throw new Error(`Hair asset manifest contains duplicate stage ${entry.cm}.`);
      if (fileSet.has(entry.file)) throw new Error(`Hair asset manifest contains duplicate file ${entry.file}.`);
      if (digestSet.has(entry.sha256)) throw new Error(`Hair asset manifest contains duplicate SHA-256 ${entry.sha256}.`);
      stageSet.add(entry.cm); fileSet.add(entry.file); digestSet.add(entry.sha256);
    }
    if (manifest.some((entry, index) => entry.cm !== expectedStages[index])) throw new Error(`Hair asset manifest stages must remain in canonical order: ${expectedStages.join(', ')} cm.`);
    for (const entry of manifest) {
      const path = join(sourceDirectory, entry.file);
      const info = await stat(path);
      if (!info.isFile() || info.size < 1024 || info.size > 12 * 1024 * 1024) throw new Error(`Hair asset ${entry.file} has an invalid size.`);
      const bytes = await readFile(path);
      inspectPng(bytes, entry.file);
      const actualDigest = createHash('sha256').update(bytes).digest('hex');
      if (actualDigest !== entry.sha256) throw new Error(`Hair asset ${entry.file} does not match its manifest SHA-256 digest.`);
    }
    const actualNames = sourceEntries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
    const expectedNames = ['stages.json', ...manifest.map((entry) => entry.file)].sort();
    if (sourceEntries.some((entry) => !entry.isFile()) || actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index])) throw new Error('Unexpected hair asset or manifest mismatch in the canonical source directory.');
    const targetDirectory = join(output, 'assets', 'hair-growth');
    await mkdir(targetDirectory, { recursive: true });
    await cp(join(sourceDirectory, 'stages.json'), join(targetDirectory, 'stages.json'));
    for (const entry of manifest) await cp(join(sourceDirectory, entry.file), join(targetDirectory, entry.file));
    return manifest.map((entry) => ({ src: `assets/hair-growth/${entry.file}`, cm: entry.cm, inches: Number((entry.cm / 2.54).toFixed(4)), alt: entry.alt }));
  } catch (error) {
    throw new Error(`Canonical hair assets were rejected: ${error.message}`);
  }
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

const glyphs = {
  A: ['01110','10001','10001','11111','10001','10001','10001'], B: ['11110','10001','10001','11110','10001','10001','11110'], C: ['01111','10000','10000','10000','10000','10000','01111'], D: ['11110','10001','10001','10001','10001','10001','11110'], E: ['11111','10000','10000','11110','10000','10000','11111'], G: ['01111','10000','10000','10111','10001','10001','01111'], H: ['10001','10001','10001','11111','10001','10001','10001'], I: ['11111','00100','00100','00100','00100','00100','11111'], J: ['00111','00010','00010','00010','10010','10010','01100'], L: ['10000','10000','10000','10000','10000','10000','11111'], M: ['10001','11011','10101','10101','10001','10001','10001'], O: ['01110','10001','10001','10001','10001','10001','01110'], P: ['11110','10001','10001','11110','10000','10000','10000'], R: ['11110','10001','10001','11110','10100','10010','10001'], S: ['01111','10000','10000','01110','00001','00001','11110'], T: ['11111','00100','00100','00100','00100','00100','00100'], U: ['10001','10001','10001','10001','10001','10001','01110'], W: ['10001','10001','10001','10101','10101','10101','01010'], '.': ['00000','00000','00000','00000','00000','00110','00110'], ' ': ['00000','00000','00000','00000','00000','00000','00000']
};

function generateSocialPreview() {
  const width = 1280, height = 640;
  const rows = [];
  const pixel = (x, y) => {
    const blend = x / width * 0.58 + y / height * 0.18;
    let r = Math.round(16 + 4 * blend), g = Math.round(20 + 72 * blend), b = Math.round(21 + 51 * blend);
    const cx = 190, cy = 220;
    const distance = Math.hypot(x - cx, y - cy);
    if (distance < 115) [r, g, b] = [20, 92, 72];
    const strand = Math.abs((x - 105) - 0.0025 * (y - 120) ** 2);
    if (x < 300 && y > 105 && y < 355 && strand < 18) [r, g, b] = [167, 243, 208];
    if (x > 205 && x < 300 && [162, 198, 234, 270].some((lineY, index) => Math.abs(y - lineY) < 5 && x < 270 + index % 2 * 20)) [r, g, b] = [224, 227, 227];
    return [r, g, b, 255];
  };
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) buffer.set(pixel(x, y), (y * width + x) * 4);
  const drawText = (text, startX, startY, scale, color) => {
    let cursor = startX;
    for (const character of text) {
      const glyph = glyphs[character] || glyphs[' '];
      glyph.forEach((row, gy) => [...row].forEach((on, gx) => {
        if (on !== '1') return;
        for (let sy = 0; sy < scale; sy += 1) for (let sx = 0; sx < scale; sx += 1) {
          const x = cursor + gx * scale + sx, y = startY + gy * scale + sy;
          if (x >= 0 && x < width && y >= 0 && y < height) buffer.set([...color, 255], (y * width + x) * 4);
        }
      }));
      cursor += 6 * scale;
    }
  };
  drawText('HAIR GROWTH ESTIMATOR', 345, 190, 7, [167, 243, 208]);
  drawText('MEASURE. PROJECT. RESET.', 360, 310, 6, [224, 227, 227]);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    buffer.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

async function ensureSocialPreview() {
  const rootPath = join(root, 'social-preview.png');
  await writeFile(rootPath, generateSocialPreview());
  const bytes = await readFile(rootPath);
  await writeFile(join(output, 'social-preview.png'), bytes);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const siteFiles = await readdir(join(root, 'site'), { withFileTypes: true });
for (const entry of siteFiles) {
  if (entry.name === 'index.template.html') continue;
  const source = join(root, 'site', entry.name);
  const destination = join(output, entry.name);
  if (entry.isDirectory()) await cp(source, destination, { recursive: true });
  else await cp(source, destination);
}

const docs = await bundledDocumentation();
const changelog = await bundledChangelog();
const hairAssets = await bundledHairStages();
const socialPreview = await ensureSocialPreview();
const commit = git('rev-parse', 'HEAD');
const provenance = {
  schemaVersion: 1,
  name: packageJson.name,
  version: packageJson.version,
  updatedAt: buildTimestamp(),
  commit: /^[a-f0-9]{40}$/.test(commit) ? commit : null,
  source: 'package.json plus Git commit provenance',
  releaseCodeName: { en: 'Classic Har Gow', zhHant: '蝦餃', catalogId: 'hk-dish-0001', catalogCommit: '736e8c1d9e40e1d146f3c3b11bb329b97c4ef515', publicAsset: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png' },
  installer: await optionalInstaller(commit),
  socialPreview
};

const template = await readFile(join(root, 'site', 'index.template.html'), 'utf8');
const html = template
  .replace('__BUILD_PROVENANCE__', JSON.stringify(provenance).replace(/</g, '\\u003c'))
  .replace('__DOCS_JSON__', JSON.stringify(docs).replace(/</g, '\\u003c'))
  .replace('__CHANGELOG_JSON__', JSON.stringify(changelog).replace(/</g, '\\u003c'))
  .replace('__HAIR_ASSETS_JSON__', JSON.stringify(hairAssets).replace(/</g, '\\u003c'));

if (/__[A-Z0-9_]+__/.test(html)) throw new Error('Site composition left an unresolved template placeholder.');
await writeFile(join(output, 'index.html'), html, 'utf8');
if (docs.length) await cp(join(root, 'docs'), join(output, 'docs'), { recursive: true });

const summary = { output, version: provenance.version, updatedAt: provenance.updatedAt, commit: provenance.commit, docs: docs.length, hairStages: hairAssets.length, socialPreview };
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
