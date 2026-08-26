import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

export function safeReleaseBasename(name) {
  if (typeof name !== 'string' || !name || name !== path.basename(name) || /[\\/]/.test(name) || name === '.' || name === '..') {
    throw new TypeError(`Release filename is not a safe basename: ${String(name)}`);
  }
  return name;
}

export function validateReleaseStageDestination(destinationDirectory, root = repositoryRoot) {
  const repository = path.resolve(root);
  const destination = path.resolve(destinationDirectory);
  const expected = path.join(repository, 'dist', 'release-assets');
  if (destination !== expected || destination === repository || path.dirname(destination) !== path.join(repository, 'dist')) {
    throw new TypeError('Release files may use only the exact generated release staging directory under dist.');
  }
  return destination;
}

function copyExact(source, destinationDirectory) {
  safeReleaseBasename(path.basename(source));
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new TypeError(`Required build output is missing: ${source}`);
  const destination = path.join(destinationDirectory, path.basename(source));
  if (fs.existsSync(destination)) throw new TypeError(`Duplicate release basename: ${path.basename(source)}`);
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}

export function stageReleaseFiles(windowsDirectory, containerDirectory, destinationDirectory) {
  const windowsRoot = path.resolve(windowsDirectory);
  const containerRoot = path.resolve(containerDirectory);
  const destination = validateReleaseStageDestination(destinationDirectory);
  if (fs.existsSync(destination)) throw new TypeError(`Release staging destination must not already exist: ${destination}`);
  const installerManifestPath = path.join(windowsRoot, 'release-manifest.json');
  const containerManifestPath = path.join(containerRoot, 'container-manifest.json');
  const installer = JSON.parse(fs.readFileSync(installerManifestPath, 'utf8'));
  const container = JSON.parse(fs.readFileSync(containerManifestPath, 'utf8'));
  const windowsNames = [installer.setup.file, installer.releaseIndex.file, ...installer.packages.map((item) => item.file), 'release-manifest.json'];
  const validatedWindowsNames = windowsNames.map(safeReleaseBasename);
  const validatedContainerNames = [container.archive.file, 'container-manifest.json'].map(safeReleaseBasename);
  const staging = `${destination}.${process.pid}.${crypto.randomUUID()}.stage`;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.mkdirSync(staging);
  try {
    for (const name of validatedWindowsNames) copyExact(path.join(windowsRoot, name), staging);
    for (const name of validatedContainerNames) copyExact(path.join(containerRoot, name), staging);
    fs.renameSync(staging, destination);
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  }
  return { destination, files: fs.readdirSync(destination).sort() };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.length < 5) throw new TypeError('Usage: node stage-release-files.mjs <windows-dir> <container-dir> <destination-dir>');
  const result = stageReleaseFiles(process.argv[2], process.argv[3], process.argv[4]);
  process.stdout.write(`Staged ${result.files.length} verified release files in ${result.destination}.\n`);
}
