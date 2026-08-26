import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectSafeOutputs,
  safeOutputDescriptor
} from '../collect-safe-outputs.mjs';

test('always-run evidence collection copies only the hand-written safe output inventory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-safe-output-'));
  const evidence = path.join(root, 'dist', 'evidence', 'windows', 'partial');
  try {
    const executable = path.join(root, 'dist', 'win-unpacked', 'Hair Growth Estimator.exe');
    const appAsar = path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar');
    const setup = path.join(root, 'dist', 'squirrel-windows', 'HairGrowthEstimator-Setup-1.0.37-x64.exe');
    const ignored = path.join(root, 'dist', 'win-unpacked', 'private-probe.txt');
    for (const file of [executable, appAsar, setup, ignored]) fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(executable, 'exe');
    fs.writeFileSync(appAsar, 'asar');
    fs.writeFileSync(setup, 'setup');
    fs.writeFileSync(ignored, 'must not upload');

    const manifest = collectSafeOutputs({
      kind: 'windows',
      repositoryRoot: root,
      destination: evidence,
      sourceCommit: '1'.repeat(40),
      runId: '12345',
      runAttempt: '2',
      outcome: 'failure'
    });
    assert.deepEqual(manifest.files.map((record) => [record.sourcePath, record.pathClass]), [
      ['dist/squirrel-windows/HairGrowthEstimator-Setup-1.0.37-x64.exe', 'squirrel-installer'],
      ['dist/win-unpacked/Hair Growth Estimator.exe', 'runnable-executable'],
      ['dist/win-unpacked/resources/app.asar', 'packaged-application']
    ]);
    assert.equal(manifest.files.every((record) => record.sha256 === crypto.createHash('sha256').update(fs.readFileSync(path.join(root, record.sourcePath))).digest('hex')), true);
    assert.equal(manifest.files.some((record) => path.posix.basename(record.artifactPath).startsWith('.')), false);
    assert.equal(fs.existsSync(path.join(evidence, 'private-probe.txt')), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(evidence, 'safe-output-manifest.json'), 'utf8')).outcome, 'failure');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('safe output descriptors reject traversal, foreign names, and oversized files', () => {
  assert.equal(safeOutputDescriptor('windows', 'dist/win-unpacked/resources/app.asar', 4).pathClass, 'packaged-application');
  assert.throws(() => safeOutputDescriptor('windows', '../app.asar', 4), /safe output inventory/);
  assert.throws(() => safeOutputDescriptor('windows', 'dist/win-unpacked/private.txt', 4), /safe output inventory/);
  assert.throws(() => safeOutputDescriptor('container', 'dist/container/image.oci.tar', 1024 * 1024 * 1024 + 1), /size limit/);
});
