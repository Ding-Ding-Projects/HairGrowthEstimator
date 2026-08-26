'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
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

function normalizedDimension(value) {
  return value === 0 ? 256 : value;
}

function iconGroupRecords(buffer) {
  const executable = NtExecutable.from(buffer);
  const resources = NtExecutableResource.from(executable);
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  const groupKeys = new Set();
  const iconEntries = new Map();
  for (const entry of resources.entries.filter((item) => item.type === 3)) {
    const key = `${entry.id}\0${entry.lang}`;
    if (iconEntries.has(key)) throw new TypeError(`Executable contains a duplicate icon resource with id ${entry.id} and language ${entry.lang}.`);
    iconEntries.set(key, entry);
  }
  const referencedIcons = new Set();
  const records = groups.map((group) => {
    const groupKey = `${group.id}\0${group.lang}`;
    if (groupKeys.has(groupKey)) throw new TypeError(`Executable contains a duplicate icon group with id ${group.id} and language ${group.lang}.`);
    groupKeys.add(groupKey);
    const groupEntry = resources.entries.filter((entry) => entry.type === 14 && entry.id === group.id && entry.lang === group.lang);
    if (groupEntry.length !== 1) throw new TypeError(`Executable icon group ${group.id} language ${group.lang} does not resolve to one group resource.`);
    const resolved = group.icons.map((groupRecord, index) => {
      const iconKey = `${groupRecord.iconID}\0${group.lang}`;
      const iconEntry = iconEntries.get(iconKey);
      if (!iconEntry) throw new TypeError(`Executable icon group ${group.id} language ${group.lang} references missing icon id ${groupRecord.iconID}.`);
      referencedIcons.add(iconKey);
      const entryBytes = Buffer.from(iconEntry.bin);
      if (entryBytes.length !== groupRecord.dataSize) {
        throw new TypeError(`Executable icon group ${group.id} language ${group.lang} references icon id ${groupRecord.iconID} with an inconsistent data size.`);
      }
      const parsed = group.getIconItemsFromEntries([iconEntry]);
      if (parsed.length !== 1) throw new TypeError(`Executable icon group ${group.id} language ${group.lang} cannot resolve icon id ${groupRecord.iconID}.`);
      const data = parsed[0];
      const bytes = iconBytes(data);
      const declaredWidth = normalizedDimension(groupRecord.width);
      const declaredHeight = normalizedDimension(groupRecord.height);
      const actualWidth = data.width || data.bitmapInfo?.width || 256;
      const actualHeight = data.height || Math.abs(data.bitmapInfo?.height || 0) / (data.masks ? 2 : 1) || 256;
      const actualPlanes = data.bitmapInfo?.planes || 1;
      const actualBitCount = data.bitCount || data.bitmapInfo?.bitCount || 0;
      if (declaredWidth !== actualWidth || declaredHeight !== actualHeight || groupRecord.planes !== actualPlanes || groupRecord.bitCount !== actualBitCount) {
        throw new TypeError(`Executable icon group ${group.id} language ${group.lang} references an inconsistent icon resource at index ${index}.`);
      }
      return {
        iconID: groupRecord.iconID,
        width: declaredWidth,
        height: declaredHeight,
        colors: groupRecord.colors,
        planes: actualPlanes,
        bitCount: actualBitCount,
        bytes: bytes.length,
        sha256: sha256(bytes)
      };
    });
    return {
      id: group.id,
      lang: group.lang,
      groupSha256: sha256(Buffer.from(groupEntry[0].bin)),
      records: resolved
    };
  }).sort((left, right) => Number(left.id) - Number(right.id) || Number(left.lang) - Number(right.lang));
  if (referencedIcons.size !== iconEntries.size) {
    const unreferenced = [...iconEntries.keys()].filter((key) => !referencedIcons.has(key));
    throw new TypeError(`Executable contains unreferenced icon resources: ${unreferenced.join(', ')}.`);
  }
  return records;
}

function executableIconRecords(buffer) {
  const groups = iconGroupRecords(buffer);
  const primaryGroups = groups.filter((group) => group.id === 1 && group.lang === 1033);
  if (primaryGroups.length !== 1) throw new TypeError(`Expected exactly one primary executable icon group with id 1 and language 1033, received ${primaryGroups.length}.`);
  return primaryGroups[0].records.map(({ width, height, bitCount, bytes, sha256: digest }) => ({
    width,
    height,
    bitCount,
    bytes,
    sha256: digest
  })).sort((left, right) => left.width - right.width || left.height - right.height || left.sha256.localeCompare(right.sha256));
}

function auxiliaryIconGroups(buffer) {
  return iconGroupRecords(buffer).filter((group) => group.id !== 1 || group.lang !== 1033);
}

function assertEmbeddedIcon(executableBuffer, iconBuffer) {
  const expected = iconFileRecords(iconBuffer);
  const actual = executableIconRecords(executableBuffer);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new TypeError('Executable icon resources do not match the canonical multi-resolution ICO.');
  return actual;
}

function transformExecutableIconBytes(before, iconBuffer) {
  if (!Buffer.isBuffer(before) || !Buffer.isBuffer(iconBuffer)) throw new TypeError('Executable icon transformation requires executable and icon byte buffers.');
  const beforeAuxiliary = auxiliaryIconGroups(before);
  const executable = NtExecutable.from(before);
  const resources = NtExecutableResource.from(executable);
  const iconFile = Data.IconFile.from(iconBuffer);
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 1, 1033, iconFile.icons.map((item) => item.data));
  resources.outputResource(executable);
  const generated = Buffer.from(executable.generate());
  const afterAuxiliary = auxiliaryIconGroups(generated);
  if (JSON.stringify(afterAuxiliary) !== JSON.stringify(beforeAuxiliary)) {
    throw new TypeError('Executable icon replacement changed an auxiliary installer icon group.');
  }
  assertEmbeddedIcon(generated, iconBuffer);
  return generated;
}

async function applyExecutableIcon(executablePath, iconPath) {
  const before = fs.readFileSync(executablePath);
  const icon = fs.readFileSync(iconPath);
  const generated = transformExecutableIconBytes(before, icon);
  const { atomicWriteFileSync } = await import('./atomic-file.mjs');
  atomicWriteFileSync(executablePath, generated);
  const after = fs.readFileSync(executablePath);
  const records = assertEmbeddedIcon(after, icon);
  return { beforeSha256: sha256(before), afterSha256: sha256(after), records };
}

function manifestContext(projectDirectory) {
  return {
    iconPath: path.join(projectDirectory, 'assets', 'icons', 'app-icon.ico')
  };
}

async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const projectDirectory = context.packager.projectDir;
  const executableName = `${context.packager.appInfo.productFilename}.exe`;
  const executablePath = path.join(context.appOutDir, executableName);
  const inputs = manifestContext(projectDirectory);
  const result = await applyExecutableIcon(executablePath, inputs.iconPath);
  process.stdout.write(`Applied ${result.records.length} verified icon resources to ${executableName} without signing.\n`);
}

module.exports = afterPack;
module.exports.afterPack = afterPack;
module.exports.applyExecutableIcon = applyExecutableIcon;
module.exports.assertEmbeddedIcon = assertEmbeddedIcon;
module.exports.auxiliaryIconGroups = auxiliaryIconGroups;
module.exports.executableIconRecords = executableIconRecords;
module.exports.iconGroupRecords = iconGroupRecords;
module.exports.iconFileRecords = iconFileRecords;
module.exports.manifestContext = manifestContext;
module.exports.transformExecutableIconBytes = transformExecutableIconBytes;
