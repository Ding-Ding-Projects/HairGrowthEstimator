import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync } from './atomic-file.mjs';

const require = createRequire(import.meta.url);
const { applyExecutableIcon, assertEmbeddedIcon } = require('./apply-executable-icon.cjs');
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function inventory(directory) {
  const files = [];
  const visit = (current, prefix = '') => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new TypeError(`Squirrel vendor input contains a symbolic link: ${relative}.`);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(absolute);
        files.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
      } else throw new TypeError(`Squirrel vendor input contains an unsupported entry type: ${relative}.`);
    }
  };
  visit(directory);
  files.sort((left, right) => left.path.localeCompare(right.path));
  const encoded = files.map((record) => `${record.path}\0${record.bytes}\0${record.sha256}\n`).join('');
  return {
    fileCount: files.length,
    bytes: files.reduce((total, record) => total + record.bytes, 0),
    inventorySha256: sha256(Buffer.from(encoded, 'utf8')),
    files
  };
}

function copyInventory(sourceDirectory, destinationDirectory, sourceInventory) {
  fs.rmSync(destinationDirectory, { recursive: true, force: true });
  fs.mkdirSync(destinationDirectory, { recursive: true });
  for (const record of sourceInventory.files) {
    const source = path.join(sourceDirectory, ...record.path.split('/'));
    const destination = path.join(destinationDirectory, ...record.path.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  }
}

function assertPinnedInputs(sourceDirectory, dependencyManifest) {
  const expected = dependencyManifest?.npm?.squirrelExecutableTools;
  if (!expected || JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify(['Setup.exe', 'Squirrel.exe', 'WriteZipToSetup.exe'])) {
    throw new TypeError('Squirrel vendor staging requires the exact three executable-tool digests.');
  }
  for (const [name, digest] of Object.entries(expected)) {
    const actual = sha256(fs.readFileSync(path.join(sourceDirectory, name)));
    if (actual !== digest) throw new TypeError(`Pinned Squirrel vendor digest is invalid: ${name}.`);
  }
  for (const item of [dependencyManifest.npm?.squirrelBundled7Zip, dependencyManifest.npm?.squirrelResourceEditor]) {
    if (!item || !/^[0-9a-f]{64}$/.test(item.sha256 || '')) throw new TypeError('Squirrel vendor staging requires pinned archive and resource-tool digests.');
    const actual = sha256(fs.readFileSync(path.join(repositoryRoot, item.path)));
    if (actual !== item.sha256) throw new TypeError(`Pinned Squirrel vendor digest is invalid: ${path.basename(item.path)}.`);
  }
  return expected;
}

export async function stageSquirrelVendor(options = {}) {
  const sourceDirectory = path.resolve(options.sourceDirectory || path.join(repositoryRoot, 'node_modules', 'electron-winstaller', 'vendor'));
  const destinationDirectory = path.resolve(options.destinationDirectory || path.join(repositoryRoot, 'dist', 'build-input', 'squirrel-vendor'));
  const iconPath = path.resolve(options.iconPath || path.join(repositoryRoot, 'assets', 'icons', 'app-icon.ico'));
  const receiptPath = path.resolve(options.receiptPath || path.join(repositoryRoot, 'dist', 'release', 'squirrel-vendor-receipt.json'));
  const dependencyManifest = options.dependencyManifest || JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'dependencies.manifest.json'), 'utf8'));
  if (!fs.statSync(sourceDirectory).isDirectory()) throw new TypeError('Squirrel vendor source is not a directory.');
  if (!fs.statSync(iconPath).isFile()) throw new TypeError('Canonical Squirrel updater icon is not a file.');
  const expectedTools = assertPinnedInputs(sourceDirectory, dependencyManifest);
  const sourceBefore = inventory(sourceDirectory);
  copyInventory(sourceDirectory, destinationDirectory, sourceBefore);
  const copied = inventory(destinationDirectory);
  if (JSON.stringify(copied) !== JSON.stringify(sourceBefore)) throw new TypeError('Staged Squirrel vendor bytes disagree with the verified package source.');

  const stagedSquirrel = path.join(destinationDirectory, 'Squirrel.exe');
  const icon = fs.readFileSync(iconPath);
  const sourceSquirrelSha256 = expectedTools['Squirrel.exe'];
  const transformed = await applyExecutableIcon(stagedSquirrel, iconPath);
  const transformedBytes = fs.readFileSync(stagedSquirrel);
  const transformedSquirrelSha256 = sha256(transformedBytes);
  if (transformedSquirrelSha256 === sourceSquirrelSha256 || transformedSquirrelSha256 !== transformed.afterSha256) {
    throw new TypeError('Staged Squirrel updater transformation did not produce one new verified byte identity.');
  }
  const iconRecords = assertEmbeddedIcon(transformedBytes, icon);
  const stagedAfter = inventory(destinationDirectory);
  if (stagedAfter.fileCount !== sourceBefore.fileCount || stagedAfter.files.map((item) => item.path).join('\0') !== sourceBefore.files.map((item) => item.path).join('\0')) {
    throw new TypeError('Staged Squirrel vendor transformation changed the package inventory.');
  }
  for (const record of stagedAfter.files) {
    const original = sourceBefore.files.find((item) => item.path === record.path);
    if (record.path === 'Squirrel.exe') {
      if (record.sha256 !== transformedSquirrelSha256) throw new TypeError('Staged Squirrel updater digest changed after icon verification.');
    } else if (JSON.stringify(record) !== JSON.stringify(original)) {
      throw new TypeError(`Staged Squirrel vendor transformation changed an unrelated file: ${record.path}.`);
    }
  }
  const sourceAfter = inventory(sourceDirectory);
  if (JSON.stringify(sourceAfter) !== JSON.stringify(sourceBefore)) throw new TypeError('Squirrel vendor staging mutated the installed package source.');

  const receipt = {
    schemaVersion: 1,
    sourceInventory: sourceBefore,
    stagedInventory: stagedAfter,
    sourceSquirrelSha256,
    transformedSquirrelSha256,
    iconSha256: sha256(icon),
    iconResourceCount: iconRecords.length
  };
  atomicWriteFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { destinationDirectory, receiptPath, receipt };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await stageSquirrelVendor();
  process.stdout.write(`Staged ${result.receipt.stagedInventory.fileCount} verified Squirrel vendor files with a canonical unsigned updater.\n`);
}
