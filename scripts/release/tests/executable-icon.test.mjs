import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  applyExecutableIcon,
  assertEmbeddedIcon,
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
