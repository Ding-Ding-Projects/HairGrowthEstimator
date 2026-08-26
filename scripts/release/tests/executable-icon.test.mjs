import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Data, NtExecutable, NtExecutableResource, Resource } = require('resedit');
const {
  applyExecutableIcon,
  assertEmbeddedIcon,
  auxiliaryIconGroups,
  executableIconRecords,
  manifestContext
} = require('../apply-executable-icon.cjs');
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '..', '..', '..');

test('verified resource editing turns a noncanonical executable icon red then green without signing', async () => {
  const sourceExecutable = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
  const inputs = manifestContext(root);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-icon-'));
  const executable = path.join(directory, 'Hair Growth Estimator.exe');
  try {
    fs.copyFileSync(sourceExecutable, executable);
    assert.throws(
      () => assertEmbeddedIcon(fs.readFileSync(executable), fs.readFileSync(inputs.iconPath)),
      /do not match the canonical/
    );
    const result = await applyExecutableIcon(executable, inputs.iconPath);
    assert.equal(result.records.length, 7);
    assert.doesNotThrow(() => assertEmbeddedIcon(fs.readFileSync(executable), fs.readFileSync(inputs.iconPath)));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('canonical primary icon validation permits additional installer resource groups', async () => {
  const sourceExecutable = path.join(root, 'node_modules', 'electron-winstaller', 'vendor', 'Setup.exe');
  const inputs = manifestContext(root);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-multi-icon-'));
  const executablePath = path.join(directory, 'Setup.exe');
  try {
    fs.copyFileSync(sourceExecutable, executablePath);
    const pristine = fs.readFileSync(executablePath);
    const beforeAuxiliary = auxiliaryIconGroups(pristine);
    await applyExecutableIcon(executablePath, inputs.iconPath);
    const repaired = fs.readFileSync(executablePath);
    const afterAuxiliary = auxiliaryIconGroups(repaired);
    assert.equal(Resource.IconGroupEntry.fromEntries(NtExecutableResource.from(NtExecutable.from(repaired)).entries).length, 3);
    assert.deepEqual(afterAuxiliary, beforeAuxiliary);
    assert.equal(executableIconRecords(repaired).length, 7);
    assert.doesNotThrow(() => assertEmbeddedIcon(repaired, fs.readFileSync(inputs.iconPath)));

    const corruptedExecutable = NtExecutable.from(pristine);
    const corruptedResources = NtExecutableResource.from(corruptedExecutable);
    const iconFile = Data.IconFile.from(fs.readFileSync(inputs.iconPath));
    const canonicalData = iconFile.icons[0].data;
    const canonicalBytes = Buffer.from(canonicalData.isRaw() ? canonicalData.bin : canonicalData.generate());
    const target = corruptedResources.entries.find((entry) => entry.type === 3 && entry.id === 1 && entry.lang === 1033);
    target.bin = canonicalBytes.buffer.slice(canonicalBytes.byteOffset, canonicalBytes.byteOffset + canonicalBytes.byteLength);
    corruptedResources.outputResource(corruptedExecutable);
    assert.throws(() => auxiliaryIconGroups(Buffer.from(corruptedExecutable.generate())), /inconsistent data size/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
