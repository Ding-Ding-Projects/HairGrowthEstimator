import crypto from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const assetsDirectory = path.join(repositoryRoot, 'assets');
const masterPath = path.join(assetsDirectory, 'logo-master.svg');
const sizes = [16, 24, 32, 48, 64, 128, 256];

const master = await readFile(masterPath, 'utf8');
if (!master.includes('Hair Growth Estimator logo') || !master.includes('viewBox="0 0 512 512"')) {
  throw new Error('The committed logo master is missing its expected identity or view box.');
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function blend(pixel, color, alpha) {
  const inverse = 1 - alpha;
  pixel[0] = Math.round(color[0] * alpha + pixel[0] * inverse);
  pixel[1] = Math.round(color[1] * alpha + pixel[1] * inverse);
  pixel[2] = Math.round(color[2] * alpha + pixel[2] * inverse);
  pixel[3] = Math.round(255 * alpha + pixel[3] * inverse);
}

function roundedRectContains(x, y, left, top, width, height, radius) {
  const right = left + width;
  const bottom = top + height;
  if (x >= left + radius && x <= right - radius && y >= top && y <= bottom) return true;
  if (y >= top + radius && y <= bottom - radius && x >= left && x <= right) return true;
  const centerX = x < left + radius ? left + radius : right - radius;
  const centerY = y < top + radius ? top + radius : bottom - radius;
  return (x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2;
}

function circleContains(x, y, cx, cy, radius) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function rasterize(size) {
  const scale = size / 512;
  const pixels = Buffer.alloc(size * size * 4);
  const sampleOffsets = size < 48 ? [0.2, 0.5, 0.8] : [0.25, 0.75];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sum = [0, 0, 0, 0];
      let samples = 0;
      for (const oy of sampleOffsets) {
        for (const ox of sampleOffsets) {
          const sx = (x + ox) / scale;
          const sy = (y + oy) / scale;
          const pixel = [0, 0, 0, 0];
          if (roundedRectContains(sx, sy, 20, 20, 472, 472, 118)) {
            const mix = Math.max(0, Math.min(1, (sx + sy - 40) / 944));
            blend(pixel, [Math.round(6 + mix * 5), Math.round(63 + mix * 44), Math.round(54 + mix * 37)], 1);
          }
          if (circleContains(sx, sy, 286, 289, 130)) blend(pixel, [255, 217, 194], 1);
          const hairShape = circleContains(sx, sy, 286, 235, 135) && sy < 279 + Math.sin((sx - 145) / 270 * Math.PI) * 20;
          if (hairShape) blend(pixel, [26, 36, 32], 1);
          const strandSegments = [
            [171, 242, 303, 120],
            [204, 231, 316, 126],
            [241, 223, 332, 141]
          ];
          if (strandSegments.some(([ax, ay, bx, by]) => distanceToSegment(sx, sy, ax, ay, bx, by) < 6)) {
            blend(pixel, [115, 224, 193], 0.9);
          }
          if (distanceToSegment(sx, sy, 108, 390, 309, 399) < 8) blend(pixel, [255, 244, 223], 1);
          if (distanceToSegment(sx, sy, 112, 389, 390, 260) < 7) blend(pixel, [255, 203, 105], 1);
          for (const tickX of [127, 164, 201, 238]) {
            if (distanceToSegment(sx, sy, tickX, 364 + (tickX - 127) * 0.16, tickX, 399 + (tickX - 127) * 0.16) < 4.5) {
              blend(pixel, [255, 244, 223], 1);
            }
          }
          for (let index = 0; index < 4; index += 1) sum[index] += pixel[index];
          samples += 1;
        }
      }
      const offset = (y * size + x) * 4;
      for (let index = 0; index < 4; index += 1) pixels[offset + index] = Math.round(sum[index] / samples);
    }
  }

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

await mkdir(assetsDirectory, { recursive: true });
const images = [];
for (const size of sizes) {
  const bytes = rasterize(size);
  const output = path.join(assetsDirectory, `app-icon-${size}.png`);
  await writeFile(output, bytes);
  images.push({ size, bytes, output, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(path.join(assetsDirectory, 'app-icon.png'), images.at(-1).bytes);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = 6 + images.length * 16;
const entries = images.map(({ size, bytes }) => {
  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size;
  entry[1] = size === 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(bytes.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += bytes.length;
  return entry;
});
const ico = Buffer.concat([header, ...entries, ...images.map(({ bytes }) => bytes)]);
await writeFile(path.join(assetsDirectory, 'app-icon.ico'), ico);

const manifest = {
  schemaVersion: 1,
  master: 'logo-master.svg',
  generatedBy: 'scripts/core/generate-icons.mjs',
  ico: {
    file: 'app-icon.ico',
    sizes,
    sha256: crypto.createHash('sha256').update(ico).digest('hex')
  },
  png: images.map(({ size, output, sha256, bytes }) => ({
    file: path.basename(output),
    size,
    bytes: bytes.length,
    sha256
  }))
};
await writeFile(path.join(assetsDirectory, 'icon-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`Generated ${images.length} PNG sizes and a multi-resolution ICO (${ico.length} bytes).\n`);
