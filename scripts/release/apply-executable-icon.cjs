'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Data, NtExecutable, NtExecutableResource, Resource } = require('resedit');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function iconBytes(item) {
  return Buffer.from(item.isRaw() ? item.bin : item.generate());
}

function iconFileRecords(buffer) {
  const iconFile = Data.IconFile.from(buffer);
  return iconFile.icons.map((entry) => {
    const data = entry.data;
    const bytes = iconBytes(data);
    return {
      width: entry.width || data.width || data.bitmapInfo?.width || 0,
      height: entry.height || data.height || Math.abs(data.bitmapInfo?.height || 0) / 2,
      bitCount: entry.bitCount || data.bitCount || data.bitmapInfo?.bitCount || 0,
      bytes: bytes.length,
      sha256: sha256(bytes)
    };
  }).sort((left, right) => left.width - right.width || left.height - right.height || left.sha256.localeCompare(right.sha256));
}

function executableIconRecords(buffer) {
  const executable = NtExecutable.from(buffer);
  const resources = NtExecutableResource.from(executable);
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  const primaryGroups = groups.filter((group) => group.id === 1 && group.lang === 1033);
  if (primaryGroups.length !== 1) throw new TypeError(`Expected exactly one primary executable icon group with id 1 and language 1033, received ${primaryGroups.length}.`);
  const primaryGroup = primaryGroups[0];
  return primaryGroup.getIconItemsFromEntries(resources.entries).map((data, index) => {
    const bytes = iconBytes(data);
    const groupRecord = primaryGroup.icons[index];
    return {
      width: groupRecord.width || data.width || data.bitmapInfo?.width || 256,
      height: groupRecord.height || data.height || Math.abs(data.bitmapInfo?.height || 0) / 2 || 256,
      bitCount: data.bitCount || data.bitmapInfo?.bitCount || 0,
      bytes: bytes.length,
      sha256: sha256(bytes)
    };
  }).sort((left, right) => left.width - right.width || left.height - right.height || left.sha256.localeCompare(right.sha256));
}

function assertEmbeddedIcon(executableBuffer, iconBuffer) {
  const expected = iconFileRecords(iconBuffer);
  const actual = executableIconRecords(executableBuffer);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new TypeError('Executable icon resources do not match the canonical multi-resolution ICO.');
  return actual;
}

function applyExecutableIcon(executablePath, iconPath, resourceEditorPath, expectedEditorSha256) {
  const editor = fs.readFileSync(resourceEditorPath);
  if (sha256(editor) !== expectedEditorSha256) throw new TypeError('Resource editor digest does not match dependencies.manifest.json.');
  const before = fs.readFileSync(executablePath);
  NtExecutable.from(before);
  execFileSync(resourceEditorPath, [executablePath, '--set-icon', iconPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const after = fs.readFileSync(executablePath);
  const records = assertEmbeddedIcon(after, fs.readFileSync(iconPath));
  return { beforeSha256: sha256(before), afterSha256: sha256(after), records };
}

function manifestContext(projectDirectory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectDirectory, 'dependencies.manifest.json'), 'utf8'));
  const resourceEditor = manifest.npm?.squirrelResourceEditor;
  if (!resourceEditor?.path || !/^[0-9a-f]{64}$/.test(resourceEditor.sha256 || '')) throw new TypeError('Resource editor dependency metadata is incomplete.');
  return {
    resourceEditorPath: path.join(projectDirectory, resourceEditor.path.replaceAll('/', path.sep)),
    expectedEditorSha256: resourceEditor.sha256,
    iconPath: path.join(projectDirectory, 'assets', 'icons', 'app-icon.ico')
  };
}

async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const projectDirectory = context.packager.projectDir;
  const executableName = `${context.packager.appInfo.productFilename}.exe`;
  const executablePath = path.join(context.appOutDir, executableName);
  const inputs = manifestContext(projectDirectory);
  const result = applyExecutableIcon(executablePath, inputs.iconPath, inputs.resourceEditorPath, inputs.expectedEditorSha256);
  process.stdout.write(`Applied ${result.records.length} verified icon resources to ${executableName} without signing.\n`);
}

module.exports = afterPack;
module.exports.afterPack = afterPack;
module.exports.applyExecutableIcon = applyExecutableIcon;
module.exports.assertEmbeddedIcon = assertEmbeddedIcon;
module.exports.executableIconRecords = executableIconRecords;
module.exports.iconFileRecords = iconFileRecords;
module.exports.manifestContext = manifestContext;
