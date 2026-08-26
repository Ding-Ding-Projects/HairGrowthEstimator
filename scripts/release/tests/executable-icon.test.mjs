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
  executableIconRecords,
  manifestContext
} = require('../apply-executable-icon.cjs');
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '..', '..', '..');

test('verified resource editing turns a noncanonical executable icon red then green without signing', () => {
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
    const result = applyExecutableIcon(executable, inputs.iconPath, inputs.resourceEditorPath, inputs.expectedEditorSha256);
    assert.equal(result.records.length, 7);
    assert.doesNotThrow(() => assertEmbeddedIcon(fs.readFileSync(executable), fs.readFileSync(inputs.iconPath)));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('canonical primary icon validation permits additional installer resource groups', () => {
  const sourceExecutable = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
  const inputs = manifestContext(root);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-multi-icon-'));
  const executablePath = path.join(directory, 'Setup.exe');
  try {
    fs.copyFileSync(sourceExecutable, executablePath);
    applyExecutableIcon(executablePath, inputs.iconPath, inputs.resourceEditorPath, inputs.expectedEditorSha256);
    const executable = NtExecutable.from(fs.readFileSync(executablePath));
    const resources = NtExecutableResource.from(executable);
    const iconFile = Data.IconFile.from(fs.readFileSync(inputs.iconPath));
    Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      107,
      1033,
      iconFile.icons.slice(0, 2).map((item) => item.data)
    );
    resources.outputResource(executable);
    const withInstallerGroup = Buffer.from(executable.generate());
    assert.equal(Resource.IconGroupEntry.fromEntries(NtExecutableResource.from(NtExecutable.from(withInstallerGroup)).entries).length, 2);
    assert.equal(executableIconRecords(withInstallerGroup).length, 7);
    assert.doesNotThrow(() => assertEmbeddedIcon(withInstallerGroup, fs.readFileSync(inputs.iconPath)));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
