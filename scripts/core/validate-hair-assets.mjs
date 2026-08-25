import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const assetDirectory = path.join(repositoryRoot, 'assets', 'hair-growth');
const sourceManifest = JSON.parse(await readFile(path.join(assetDirectory, 'hair-growth-image-sequence-manifest.json'), 'utf8'));
const stageManifest = JSON.parse(await readFile(path.join(assetDirectory, 'stages.json'), 'utf8'));
const expectedLengths = [0.3, 1.5, 3, 5, 9, 14, 20, 28];

if (sourceManifest.schemaVersion !== 1 || sourceManifest.stages?.length !== 8) throw new Error('Source image manifest must contain exactly eight stages.');
if (stageManifest.schemaVersion !== 1 || stageManifest.unit !== 'cm' || stageManifest.stages?.length !== 8) throw new Error('Runtime stage manifest must contain exactly eight centimetre stages.');

for (let index = 0; index < 8; index += 1) {
  const source = sourceManifest.stages[index];
  const runtime = stageManifest.stages[index];
  if (runtime.length !== expectedLengths[index]) throw new Error(`Stage ${index + 1} has the wrong deterministic length.`);
  if (runtime.file !== source.file || runtime.sha256 !== source.sha256) throw new Error(`Stage ${index + 1} does not preserve source identity.`);
  const bytes = await readFile(path.join(assetDirectory, runtime.file));
  const signature = bytes.subarray(0, 8);
  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`${runtime.file} is not a PNG.`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== source.width || height !== source.height || width !== 1254 || height !== 1254) throw new Error(`${runtime.file} has unexpected dimensions.`);
  if (bytes.length !== source.bytes) throw new Error(`${runtime.file} has an unexpected byte count.`);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (hash !== source.sha256) throw new Error(`${runtime.file} failed SHA-256 validation.`);
}

process.stdout.write('Validated 8 locally bundled hair-growth PNG stages with preserved hashes and deterministic centimetre mapping.\n');
