import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  assertSetupPayloadEntries,
  parseReleases,
  readPeSecurityDirectory,
  readZipEntries,
  validateSquirrelPackageSet
} from '../../core/validate-installer.mjs';

const require = createRequire(import.meta.url);
const { applyExecutableIcon } = require('../apply-executable-icon.cjs');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(name, data) {
  const filename = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc32(data), 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc32(data), 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const centralOffset = local.length + filename.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + filename.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, filename, data, central, filename, eocd]);
}

function extraField(id, data) {
  const header = Buffer.alloc(4);
  header.writeUInt16LE(id, 0);
  header.writeUInt16LE(data.length, 2);
  return Buffer.concat([header, data]);
}

function storedZipEntries(definitions, options = {}) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const definition of definitions) {
    const data = Buffer.from(definition.data || '');
    const name = Buffer.isBuffer(definition.name) ? definition.name : Buffer.from(definition.name);
    const localName = definition.localName || name;
    const localExtra = definition.localExtra || Buffer.alloc(0);
    const centralExtra = definition.centralExtra || localExtra;
    const flags = definition.flags || 0;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(localName.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    const localPart = Buffer.concat([local, localName, localExtra, data]);
    localParts.push(localPart);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(definition.versionMadeBy || 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(centralExtra.length, 30);
    central.writeUInt32LE(definition.externalAttributes || 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(Buffer.concat([central, name, centralExtra]));
    localOffset += localPart.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const comment = Buffer.from(options.comment || '');
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(options.diskNumber || 0, 4);
  eocd.writeUInt16LE(options.centralDisk || 0, 6);
  eocd.writeUInt16LE(options.entriesThisDisk ?? definitions.length, 8);
  eocd.writeUInt16LE(definitions.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  eocd.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd, comment]);
}

function withCentralGap(zip) {
  const eocd = zip.length - 22;
  return Buffer.concat([zip.subarray(0, eocd), Buffer.from([0]), zip.subarray(eocd)]);
}

function withLocalGap(zip) {
  const eocd = zip.length - 22;
  const centralOffset = zip.readUInt32LE(eocd + 16);
  const result = Buffer.concat([zip.subarray(0, centralOffset), Buffer.from([0]), zip.subarray(centralOffset)]);
  result.writeUInt32LE(centralOffset + 1, eocd + 1 + 16);
  return result;
}

function storedZipWithDescriptor(name, data, corruptDescriptor = false) {
  const filename = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0008, 6);
  local.writeUInt16LE(filename.length, 26);
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(corruptDescriptor ? (crc ^ 1) >>> 0 : crc, 4);
  descriptor.writeUInt32LE(data.length, 8);
  descriptor.writeUInt32LE(data.length, 12);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0008, 8);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const centralOffset = local.length + filename.length + data.length + descriptor.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + filename.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, filename, data, descriptor, central, filename, eocd]);
}

function unsignedPe() {
  const buffer = Buffer.alloc(512);
  buffer.write('MZ', 0, 'ascii');
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.write('PE\0\0', 0x80, 'ascii');
  const optionalHeader = 0x80 + 24;
  buffer.writeUInt16LE(0x20b, optionalHeader);
  buffer.writeUInt32LE(16, optionalHeader + 108);
  return buffer;
}

test('ZIP reader validates content and rejects unsafe paths', () => {
  assert.equal(readZipEntries(storedZip('lib/net45/file.txt', Buffer.from('hello'))).get('lib/net45/file.txt').toString(), 'hello');
  assert.throws(() => readZipEntries(storedZip('../escape.txt', Buffer.from('no'))), /unsafe.*ZIP entry/i);
});

test('ZIP reader validates directory entries separately and returns only file payloads', () => {
  const valid = storedZipEntries([
    { name: 'lib/', data: '', externalAttributes: 0x10 },
    { name: 'lib/net45/', data: '', externalAttributes: 0x10 },
    { name: 'lib/net45/file.txt', data: 'payload' }
  ]);
  const entries = readZipEntries(valid);
  assert.deepEqual([...entries.keys()], ['lib/', 'lib/net45/', 'lib/net45/file.txt']);
  assert.equal(entries.get('lib/').length, 0);
  assert.equal(entries.get('lib/net45/').length, 0);
  assert.equal(entries.get('lib/net45/file.txt').toString(), 'payload');
  assert.throws(() => readZipEntries(storedZipEntries([{ name: 'lib/', data: '' }])), /invalid ZIP directory entry/);
  assert.throws(() => readZipEntries(storedZipEntries([{ name: 'lib/', data: 'payload', externalAttributes: 0x10 }])), /invalid ZIP directory entry/);
  assert.throws(() => readZipEntries(storedZipEntries([{ name: 'file.txt', data: '', externalAttributes: 0x10 }])), /directory attribute/);
  assert.throws(
    () => readZipEntries(storedZipEntries([{ name: 'link', data: 'target', versionMadeBy: 0x0314, externalAttributes: (0xa000 << 16) >>> 0 }])),
    /unsupported Unix ZIP entry type/
  );
  assert.throws(
    () => readZipEntries(storedZipEntries([{ name: 'lib', data: '' }, { name: 'lib/file.txt', data: 'payload' }])),
    /ancestor conflict/
  );
});

test('ZIP reader binds local and central headers, rejects encryption, and validates descriptors', () => {
  const data = Buffer.from('payload');
  const mismatchedName = storedZip('file.txt', data);
  mismatchedName[30] = 'g'.charCodeAt(0);
  assert.throws(() => readZipEntries(mismatchedName), /local and central names/);

  const mismatchedMethod = storedZip('file.txt', data);
  mismatchedMethod.writeUInt16LE(8, 8);
  assert.throws(() => readZipEntries(mismatchedMethod), /local and central.*method/);

  const encrypted = storedZip('file.txt', data);
  const centralOffset = encrypted.readUInt32LE(encrypted.length - 22 + 16);
  encrypted.writeUInt16LE(1, 6);
  encrypted.writeUInt16LE(1, centralOffset + 8);
  assert.throws(() => readZipEntries(encrypted), /encrypted/i);

  assert.equal(readZipEntries(storedZipWithDescriptor('file.txt', data)).get('file.txt').toString(), 'payload');
  assert.throws(() => readZipEntries(storedZipWithDescriptor('file.txt', data, true)), /data descriptor/);
});

test('ZIP reader requires an exact single-disk EOCD and complete local and central spans', () => {
  const valid = storedZipEntries([{ name: 'file.txt', data: 'payload' }], { comment: 'verified' });
  assert.equal(readZipEntries(valid).get('file.txt').toString(), 'payload');

  const trailing = Buffer.concat([storedZip('file.txt', Buffer.from('payload')), Buffer.from([0])]);
  assert.throws(() => readZipEntries(trailing), /end of central directory|EOCD|comment/i);

  const disk = storedZipEntries([{ name: 'file.txt', data: 'payload' }], { diskNumber: 1 });
  assert.throws(() => readZipEntries(disk), /single-disk/i);

  const perDisk = storedZipEntries([{ name: 'file.txt', data: 'payload' }], { entriesThisDisk: 0 });
  assert.throws(() => readZipEntries(perDisk), /per-disk|entry count/i);

  assert.throws(() => readZipEntries(withCentralGap(storedZip('file.txt', Buffer.from('payload')))), /adjacent/i);
  assert.throws(() => readZipEntries(withLocalGap(storedZip('file.txt', Buffer.from('payload')))), /complete|gap/i);
});

test('ZIP reader uses fatal supported decoding and canonical Windows extraction identities', () => {
  for (const name of ['a/./b.txt', 'a//b.txt', 'a/b.', 'a/b ']) {
    assert.throws(() => readZipEntries(storedZipEntries([{ name, data: 'payload' }])), /unsafe ZIP entry|canonical/i);
  }
  assert.throws(
    () => readZipEntries(storedZipEntries([{ name: 'File.txt', data: 'one' }, { name: 'file.txt', data: 'two' }])),
    /canonical|alias/i
  );
  assert.throws(
    () => readZipEntries(storedZipEntries([{ name: Buffer.from([0xc3, 0x28]), data: 'payload', flags: 0x0800 }])),
    /UTF-8|encoding/i
  );
  assert.throws(
    () => readZipEntries(storedZipEntries([{ name: Buffer.from([0x82, 0x2e, 0x74, 0x78, 0x74]), data: 'payload' }])),
    /encoding/i
  );
});

test('ZIP reader parses bounded extra-field TLVs and rejects path-changing or unsupported fields', () => {
  const timestamp = extraField(0x5455, Buffer.from([1, 0, 0, 0, 0]));
  assert.equal(readZipEntries(storedZipEntries([{ name: 'file.txt', data: 'payload', localExtra: timestamp }])).size, 1);

  const truncated = Buffer.from([0x55, 0x54, 0x08, 0x00, 0x01]);
  assert.throws(
    () => readZipEntries(storedZipEntries([{ name: 'file.txt', data: 'payload', localExtra: truncated }])),
    /extra field.*truncated|TLV/i
  );
  assert.throws(
    () => readZipEntries(storedZipEntries([{ name: 'file.txt', data: 'payload', localExtra: extraField(0x7075, Buffer.from('alias')) }])),
    /path-changing|unsupported/i
  );
  assert.throws(
    () => readZipEntries(storedZipEntries([{ name: 'file.txt', data: 'payload', localExtra: extraField(0x9999, Buffer.alloc(0)) }])),
    /unsupported/i
  );
  assert.throws(
    () => readZipEntries(storedZipEntries([{ name: 'file.txt', data: 'payload', localExtra: extraField(0x5455, Buffer.alloc(4097)) }])),
    /extra field.*limit|bounded/i
  );
});

test('RELEASES parser binds byte counts and SHA-1 to the actual package', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'squirrel-release-test-'));
  try {
    const bytes = storedZip('file.txt', Buffer.from('payload'));
    const filename = 'example-1.0.0-full.nupkg';
    fs.writeFileSync(path.join(directory, filename), bytes);
    const sha1 = crypto.createHash('sha1').update(bytes).digest('hex').toUpperCase();
    const parsed = parseReleases(`${sha1} ${filename} ${bytes.length}\n`, directory);
    assert.equal(parsed[0].sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.throws(() => parseReleases(`${'0'.repeat(40)} ${filename} ${bytes.length}\n`, directory), /SHA-1 disagrees/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('first release requires one full package and no invented delta package', () => {
  const firstRelease = {
    status: 'first-release-no-previous-package',
    remoteReleases: null,
    requiredAfterFirstRelease: true
  };
  assert.doesNotThrow(() => validateSquirrelPackageSet([{ name: 'example-1.0.0-full.nupkg' }], firstRelease));
  assert.throws(
    () => validateSquirrelPackageSet([
      { name: 'example-1.0.0-full.nupkg' },
      { name: 'example-1.0.0-delta.nupkg' }
    ], firstRelease),
    /must not invent a delta/
  );
  assert.throws(
    () => validateSquirrelPackageSet([{ name: 'example-1.0.1-full.nupkg' }], {
      status: 'later-release-prior-package-required',
      remoteReleases: 1,
      requiredAfterFirstRelease: true
    }),
    /prior full-package acquisition/
  );
});

test('PE validator treats an absent certificate table as unsigned', () => {
  assert.deepEqual(readPeSecurityDirectory(unsignedPe()), { fileOffset: 0, size: 0 });
});

test('final Setup payload embeds the exact validated full package bytes', () => {
  const packageName = 'hair-growth-estimator-1.0.1-full.nupkg';
  const packageBytes = Buffer.from('package bytes');
  const entries = new Map([['Update.exe', Buffer.from('updater')], [packageName, packageBytes]]);
  const icon = fs.readFileSync(path.join(repositoryRoot, 'assets', 'icons', 'app-icon.ico'));
  assert.throws(() => assertSetupPayloadEntries(entries, packageName, Buffer.from('changed'), icon), /embedded full package bytes/);
  assert.throws(() => assertSetupPayloadEntries(entries, packageName, packageBytes), /requires the canonical icon bytes/);
});

test('Setup Update.exe is byte-bound to a validated unsigned PE with the canonical icon', async () => {
  const validator = await import('../../core/validate-installer.mjs');
  assert.equal(typeof validator.validateUpdaterExecutable, 'function');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'squirrel-updater-test-'));
  try {
    const updaterPath = path.join(directory, 'Update.exe');
    const iconPath = path.join(repositoryRoot, 'assets', 'icons', 'app-icon.ico');
    fs.copyFileSync(path.join(repositoryRoot, 'node_modules', 'electron-winstaller', 'vendor', 'Squirrel.exe'), updaterPath);
    await applyExecutableIcon(updaterPath, iconPath);
    const updater = fs.readFileSync(updaterPath);
    const icon = fs.readFileSync(iconPath);
    const expectedUpdater = validator.validateUpdaterExecutable(updater, icon, 'Setup payload Update.exe');
    assert.equal(expectedUpdater.signing, 'NotSigned');
    assert.equal(expectedUpdater.sha256, crypto.createHash('sha256').update(updater).digest('hex'));
    assert.ok(expectedUpdater.iconResourceCount > 0);

    const packageName = 'hair-growth-estimator-1.0.1-full.nupkg';
    const packageBytes = Buffer.from('package bytes');
    const entries = new Map([['Update.exe', updater], [packageName, packageBytes]]);
    const result = assertSetupPayloadEntries(entries, packageName, packageBytes, icon);
    assert.equal(result.updateSha256, expectedUpdater.sha256);

    const changedUpdater = Buffer.from(updater);
    changedUpdater[0] ^= 1;
    entries.set('Update.exe', changedUpdater);
    assert.throws(
      () => assertSetupPayloadEntries(entries, packageName, packageBytes, icon),
      /valid PE|MZ header|Update\.exe/i
    );

    const wrongIcon = Buffer.from(icon);
    wrongIcon[wrongIcon.length - 1] ^= 1;
    assert.throws(() => validator.validateUpdaterExecutable(updater, wrongIcon, 'Update.exe'), /icon resources/i);

    const signed = Buffer.from(updater);
    const peOffset = signed.readUInt32LE(0x3c);
    const optionalHeader = peOffset + 24;
    const securityEntry = optionalHeader + (signed.readUInt16LE(optionalHeader) === 0x20b ? 112 : 96) + (4 * 8);
    signed.writeUInt32LE(signed.length - 8, securityEntry);
    signed.writeUInt32LE(8, securityEntry + 4);
    assert.throws(() => validator.validateUpdaterExecutable(signed, icon, 'Update.exe'), /signed|certificate/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('NuGet metadata uses safe structural XML parsing and exact package identity', async () => {
  const validator = await import('../../core/validate-installer.mjs');
  assert.equal(typeof validator.parseNuspecMetadata, 'function');
  const valid = Buffer.from(`<?xml version="1.0"?>
<package xmlns="http://schemas.microsoft.com/packaging/2010/07/nuspec.xsd">
  <!-- <metadata><id>spoof</id><version>9.9.9</version></metadata> -->
  <metadata>
    <id>hair-growth-estimator</id>
    <version>1.0.0</version>
    <authors>Ding Ding Projects</authors>
  </metadata>
</package>`);
  assert.deepEqual(
    validator.parseNuspecMetadata(valid, 'hair-growth-estimator.nuspec', 'hair-growth-estimator-1.0.0-full.nupkg'),
    { id: 'hair-growth-estimator', version: '1.0.0' }
  );

  const duplicate = Buffer.from('<package><metadata><id>hair-growth-estimator</id><version>1.0.0</version><version>9.9.9</version></metadata></package>');
  assert.throws(
    () => validator.parseNuspecMetadata(duplicate, 'hair-growth-estimator.nuspec', 'hair-growth-estimator-1.0.0-full.nupkg'),
    /exactly one.*version/i
  );

  const externalEntity = Buffer.from('<!DOCTYPE package [<!ENTITY value SYSTEM "file:///private.txt">]><package><metadata><id>hair-growth-estimator</id><version>&value;</version></metadata></package>');
  assert.throws(
    () => validator.parseNuspecMetadata(externalEntity, 'hair-growth-estimator.nuspec', 'hair-growth-estimator-1.0.0-full.nupkg'),
    /DTD|entity/i
  );

  assert.throws(
    () => validator.parseNuspecMetadata(valid, 'different.nuspec', 'hair-growth-estimator-1.0.0-full.nupkg'),
    /filename.*id|identity/i
  );
  assert.throws(
    () => validator.parseNuspecMetadata(valid, 'hair-growth-estimator.nuspec', 'other-1.0.0-full.nupkg'),
    /filename.*id|identity/i
  );
});
