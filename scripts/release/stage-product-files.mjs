import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeReleaseBasename } from './stage-release-files.mjs';

function exactFile(root, name) {
  const basename = safeReleaseBasename(name);
  const target = path.join(root, basename);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new TypeError(`Validated product file is missing: ${basename}`);
  }
  return { basename, target };
}

export function productFileNames(kind, manifest) {
  if (kind === 'windows') {
    if (manifest?.schemaVersion !== 2 || manifest.installerFamily !== 'Squirrel.Windows') {
      throw new TypeError('Windows product staging requires a validated Squirrel.Windows manifest.');
    }
    return [
      manifest.setup?.file,
      manifest.releaseIndex?.file,
      ...(manifest.packages || []).map((record) => record.file),
      'release-manifest.json'
    ].map(safeReleaseBasename);
  }
  if (kind === 'container') {
    if (manifest?.schemaVersion !== 2 || manifest.archive?.format !== 'oci') {
      throw new TypeError('Container product staging requires a validated OCI manifest.');
    }
    return [manifest.archive.file, 'container-manifest.json'].map(safeReleaseBasename);
  }
  throw new TypeError(`Unknown product kind: ${kind}`);
}

export function stageProductFiles(kind, sourceDirectory, destinationDirectory) {
  const source = path.resolve(sourceDirectory);
  const destination = path.resolve(destinationDirectory);
  const manifestName = kind === 'windows' ? 'release-manifest.json' : 'container-manifest.json';
  const manifestPath = exactFile(source, manifestName).target;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const names = productFileNames(kind, manifest);
  if (new Set(names).size !== names.length) throw new TypeError('Validated product manifest contains duplicate basenames.');
  if (fs.existsSync(destination) && fs.readdirSync(destination).length !== 0) {
    throw new TypeError(`Product staging destination is not empty: ${destination}`);
  }
  fs.mkdirSync(destination, { recursive: true });
  for (const name of names) {
    const sourceFile = exactFile(source, name).target;
    fs.copyFileSync(sourceFile, path.join(destination, name), fs.constants.COPYFILE_EXCL);
  }
  return { kind, source, destination, files: names };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.length !== 5) {
    throw new TypeError('Usage: node stage-product-files.mjs <windows|container> <source-dir> <destination-dir>');
  }
  const result = stageProductFiles(process.argv[2], process.argv[3], process.argv[4]);
  process.stdout.write(`Staged ${result.files.length} validated ${result.kind} product files.\n`);
}
