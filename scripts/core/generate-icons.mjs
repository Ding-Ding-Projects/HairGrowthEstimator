import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { atomicWriteFileSync } from '../release/atomic-file.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const assetsDirectory = path.join(repositoryRoot, 'assets', 'icons');
const masterPath = path.join(assetsDirectory, 'logo-master.svg');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const verifyOnly = process.argv.includes('--verify');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function canonicalTextBytes(bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  return Buffer.from(text.replace(/\r\n?/g, '\n'), 'utf8');
}

function parsePngDimensions(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(bytes) || !bytes.subarray(0, 8).equals(signature) || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new TypeError('Generated icon is not a valid PNG file.');
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function createIco(images) {
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
  return Buffer.concat([header, ...entries, ...images.map(({ bytes }) => bytes)]);
}

export async function renderIconSet(master = undefined) {
  const masterBytes = canonicalTextBytes(master || await readFile(masterPath));
  const masterText = masterBytes.toString('utf8');
  if (!masterText.includes('Hair Growth Estimator logo') || !masterText.includes('viewBox="0 0 512 512"')) {
    throw new Error('The committed logo master is missing its expected identity or view box.');
  }

  const images = [];
  for (const size of sizes) {
    const bytes = await sharp(masterBytes, { density: 384 })
      .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
      .toBuffer();
    const dimensions = parsePngDimensions(bytes);
    if (dimensions.width !== size || dimensions.height !== size) throw new Error(`Generated ${size}px icon has the wrong dimensions.`);
    images.push({ size, bytes, file: `app-icon-${size}.png`, sha256: sha256(bytes) });
  }

  const ico = createIco(images);
  const manifest = {
    schemaVersion: 2,
    master: 'logo-master.svg',
    masterBytes: masterBytes.length,
    masterSha256: sha256(masterBytes),
    generatedBy: 'scripts/core/generate-icons.mjs',
    renderer: {
      package: 'sharp',
      version: sharp.versions.sharp,
      sourceIsMasterBytes: true
    },
    ico: {
      file: 'app-icon.ico',
      sizes,
      bytes: ico.length,
      sha256: sha256(ico)
    },
    png: images.map(({ size, file, sha256: digest, bytes }) => ({
      file,
      size,
      bytes: bytes.length,
      sha256: digest
    }))
  };
  const outputs = new Map(images.map(({ file, bytes }) => [file, bytes]));
  outputs.set('app-icon.png', images.at(-1).bytes);
  outputs.set('app-icon.ico', ico);
  outputs.set('icon-manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
  return { outputs, imageCount: images.length, icoBytes: ico.length };
}

export async function verifyIconSet(iconSet = undefined, readOutput = undefined) {
  const rendered = iconSet || await renderIconSet();
  for (const [file, expected] of rendered.outputs) {
    const relativePath = path.posix.join('assets', 'icons', file);
    let actual;
    try {
      actual = readOutput
        ? await readOutput(file)
        : await readFile(path.join(assetsDirectory, file));
    } catch (error) {
      throw new Error(`Committed icon output is unavailable at ${relativePath}: ${error.message}`);
    }
    const comparedActual = file === 'icon-manifest.json' ? canonicalTextBytes(actual) : actual;
    const comparedExpected = file === 'icon-manifest.json' ? canonicalTextBytes(expected) : expected;
    if (!comparedActual.equals(comparedExpected)) {
      throw new Error(`Committed icon output drifted from logo-master.svg at ${relativePath}. Run npm run generate:icons explicitly and review the result.`);
    }
  }
  return rendered;
}

export function writeIconSet(iconSet) {
  for (const [file, bytes] of iconSet.outputs) {
    atomicWriteFileSync(path.join(assetsDirectory, file), bytes);
  }
  return iconSet;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const unsupportedArguments = process.argv.slice(2).filter((argument) => argument !== '--verify');
  if (unsupportedArguments.length > 0) throw new TypeError(`Unsupported icon-generator argument: ${unsupportedArguments[0]}`);
  const iconSet = await renderIconSet();
  if (verifyOnly) {
    await verifyIconSet(iconSet);
    process.stdout.write(`Verified ${iconSet.imageCount} committed PNG sizes and a multi-resolution ICO (${iconSet.icoBytes} bytes) without rewriting source.\n`);
  } else {
    writeIconSet(iconSet);
    process.stdout.write(`Rendered the SVG master into ${iconSet.imageCount} PNG sizes and a multi-resolution ICO (${iconSet.icoBytes} bytes).\n`);
  }
}
