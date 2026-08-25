import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, '..');
const output = resolve(process.env.SITE_OUTPUT_DIR || join(root, '_site'));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const expectedStages = [0.3, 1.5, 3, 5, 9, 14, 20, 28];

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

async function optionalInstaller() {
  const candidates = [process.env.INSTALLER_MANIFEST, join(root, 'release', 'installer-manifest.json')].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(await readFile(resolve(candidate), 'utf8'));
      if (typeof value.url === 'string' && /^https:\/\//.test(value.url) && /^[a-f0-9]{64}$/.test(value.sha256 || '')) return { url: value.url, sha256: value.sha256, unsigned: value.unsigned !== false };
    } catch {}
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

function normalizeHairManifest(value) {
  const entries = Array.isArray(value) ? value : Array.isArray(value?.stages) ? value.stages : Array.isArray(value?.images) ? value.images : [];
  return entries.map((entry) => {
    const cm = Number(entry.cm ?? entry.length ?? entry.lengthCm ?? entry.targetLengthCm ?? entry.approximateLengthCm);
    return {
      file: String(entry.file || entry.filename || entry.path || '').replace(/\\/g, '/').replace(/^\.\//, ''),
      cm,
      sha256: String(entry.sha256 || '').toLowerCase(),
      alt: String(entry.alt || entry.altText || `Male hair reference at approximately ${cm} centimetres`).slice(0, 300)
    };
  }).filter((entry) => entry.file && Number.isFinite(entry.cm)).sort((a, b) => a.cm - b.cm);
}

async function bundledHairStages() {
  const sourceDirectory = join(root, 'assets', 'hair-growth');
  try {
    const manifestNames = ['stages.json'];
    let manifestValue = null;
    for (const name of manifestNames) {
      try {
        manifestValue = JSON.parse(await readFile(join(sourceDirectory, name), 'utf8'));
        break;
      } catch {}
    }
    if (!manifestValue) throw new Error(`Hair asset manifest is unavailable. Expected one of: ${manifestNames.join(', ')}.`);
    if (manifestValue.schemaVersion !== undefined && manifestValue.schemaVersion !== 1) throw new Error('Hair asset manifest schemaVersion must be 1.');
    if (manifestValue.unit !== undefined && manifestValue.unit !== 'cm') throw new Error('Hair asset manifest unit must be cm.');
    const manifest = normalizeHairManifest(manifestValue);
    if (manifest.length !== expectedStages.length || manifest.some((entry, index) => Math.abs(entry.cm - expectedStages[index]) > 0.001)) throw new Error(`Hair asset manifest must contain stages ${expectedStages.join(', ')} cm in ascending order.`);
    for (const entry of manifest) {
      if (entry.file.includes('..') || entry.file.startsWith('/')) throw new Error(`Unsafe hair asset path ${entry.file}.`);
      const path = join(sourceDirectory, entry.file);
      const info = await stat(path);
      if (!info.isFile() || info.size < 1024 || info.size > 12 * 1024 * 1024) throw new Error(`Hair asset ${entry.file} has an invalid size.`);
      if (!/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Hair asset ${entry.file} is missing a valid SHA-256 digest.`);
      const actualDigest = createHash('sha256').update(await readFile(path)).digest('hex');
      if (actualDigest !== entry.sha256) throw new Error(`Hair asset ${entry.file} does not match its manifest SHA-256 digest.`);
    }
    await mkdir(join(output, 'assets'), { recursive: true });
    await cp(sourceDirectory, join(output, 'assets', 'hair-growth'), { recursive: true });
    return manifest.map((entry) => ({ src: `assets/hair-growth/${entry.file}`, cm: entry.cm, inches: Number((entry.cm / 2.54).toFixed(4)), alt: entry.alt }));
  } catch (error) {
    if (process.env.REQUIRE_HAIR_ASSETS === '1') throw error;
    return [];
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
  installer: await optionalInstaller(),
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
