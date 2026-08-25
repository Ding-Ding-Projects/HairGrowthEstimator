'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..', '..');

test('generated ICO contains every required PNG-backed size', () => {
  const ico = fs.readFileSync(path.join(root, 'assets', 'app-icon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 7);
  const sizes = [];
  for (let index = 0; index < 7; index += 1) {
    const offset = 6 + index * 16;
    sizes.push(ico[offset] || 256);
    assert.equal(ico.readUInt16LE(offset + 4), 1);
    assert.equal(ico.readUInt16LE(offset + 6), 32);
    assert.ok(ico.readUInt32LE(offset + 8) > 0);
  }
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
});

test('icon manifest hashes the generated multi-resolution ICO', () => {
  const ico = fs.readFileSync(path.join(root, 'assets', 'app-icon.ico'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'icon-manifest.json'), 'utf8'));
  assert.equal(manifest.ico.sha256, crypto.createHash('sha256').update(ico).digest('hex'));
  assert.deepEqual(manifest.ico.sizes, [16, 24, 32, 48, 64, 128, 256]);
  assert.equal(manifest.master, 'logo-master.svg');
});

test('release code name is unique, public-catalog linked, and not locally copied', () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'app', 'release-metadata.json'), 'utf8'));
  assert.equal(metadata.version, '1.0.0');
  assert.equal(metadata.codeName, 'Classic Har Gow · 蝦餃');
  assert.equal(metadata.catalogRecord, 'hk-dish-0001');
  assert.match(metadata.publicPhotoUrl, /^https:\/\/github\.com\/Ding-Ding-Projects\/dim-sum-photos\/releases\/download\/catalog-v1\//);
  assert.equal(metadata.photoStoredLocally, false);
  const localNames = fs.readdirSync(path.join(root, 'assets'), { recursive: true }).map(String);
  assert.ok(!localNames.some((name) => /har-gow|hk-dish-0001/i.test(name)));
});

test('packaging stays Squirrel.Windows and signing remains disabled', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const installerScript = fs.readFileSync(path.join(root, 'build-installer.bat'), 'utf8').replace(/\r\n/g, '\n');
  assert.deepEqual(packageJson.build.win.target, [{ target: 'squirrel', arch: ['x64'] }]);
  assert.equal(packageJson.build.forceCodeSigning, false);
  assert.equal(packageJson.build.win.forceCodeSigning, false);
  assert.equal(packageJson.build.win.signExecutable, false);
  assert.equal(packageJson.build.win.signAndEditExecutable, false);
  assert.equal(packageJson.releasePolicy.signExecutable, false);
  assert.equal(packageJson.build.directories.output, 'dist');
  assert.match(packageJson.build.squirrelWindows.artifactName, /Setup/);
  assert.equal(packageJson.build.squirrelWindows.msi, false);
  assert.match(packageJson.build.win.icon, /\.ico$/);
  assert.match(installerScript, /^set "CSC_IDENTITY_AUTO_DISCOVERY=false"$/m);
  assert.match(installerScript, /^set "CSC_LINK="$/m);
  assert.match(installerScript, /^set "WIN_CSC_LINK="$/m);
});
