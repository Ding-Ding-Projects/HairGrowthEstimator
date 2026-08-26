import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPackage } from '@electron/asar';

import { assertCleanStatus } from '../assert-clean-candidate.mjs';
import { assertTrackedSnapshot, trackedSnapshot } from '../assert-source-preserved.mjs';
import { asarFiles, compareBoundFiles, expectedReleaseMetadata, validateSourceBindingReceipt } from '../source-binding.mjs';

test('ASAR inventory reads nested files through the host path separator', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-asar-binding-'));
  const source = path.join(root, 'source');
  const archive = path.join(root, 'fixture.asar');
  try {
    await fs.mkdir(path.join(source, 'app', 'core'), { recursive: true });
    await fs.writeFile(path.join(source, 'app', 'core', 'atomic.js'), 'nested bytes\n', 'utf8');
    await createPackage(source, archive);
    const files = asarFiles(archive);
    assert.deepEqual([...files.keys()], ['app/core/atomic.js']);
    assert.equal(files.get('app/core/atomic.js').toString('utf8'), 'nested bytes\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('candidate source binding proves exact bytes and rejects tampering or extra files', () => {
  const expected = new Map([
    ['app/main.js', { sourcePath: 'app/main.js', bytes: Buffer.from('exact bytes\n') }],
    ['assets/app-icon.ico', { sourcePath: 'assets/icons/app-icon.ico', bytes: Buffer.from([0, 1, 2, 3]) }]
  ]);
  const actual = new Map([...expected].map(([name, record]) => [name, Buffer.from(record.bytes)]));
  const result = compareBoundFiles(expected, actual, 'fixture package');
  assert.equal(result.fileCount, 2);
  assert.equal(result.files.length, result.fileCount);
  assert.match(result.inventorySha256, /^[0-9a-f]{64}$/);
  assert.equal(validateSourceBindingReceipt(result), true);
  assert.throws(() => validateSourceBindingReceipt({ ...result, files: [] }), /file count/);
  assert.throws(() => validateSourceBindingReceipt({ ...result, inventorySha256: '0'.repeat(64) }), /inventory SHA-256/);
  assert.throws(() => validateSourceBindingReceipt({ fileCount: 0, bytes: 0, inventorySha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', files: [] }), /at least one file/);

  const tampered = new Map(actual);
  tampered.set('app/main.js', Buffer.from('dirty bytes\n'));
  assert.throws(() => compareBoundFiles(expected, tampered, 'fixture package'), /candidate Git blob/);

  const extra = new Map(actual);
  extra.set('app/uncommitted.js', Buffer.from('not in commit'));
  assert.throws(() => compareBoundFiles(expected, extra, 'fixture package'), /Unexpected: app\/uncommitted\.js/);
});

test('release metadata transformation changes only release-bound fields', () => {
  const base = {
    schemaVersion: 1,
    version: '1.0.0',
    releaseTag: 'v1.0.0',
    sourceCommit: '0'.repeat(40),
    createdAt: '1970-01-01T00:00:00.000Z',
    catalogStatus: 'resolved',
    catalogUnavailableReason: null,
    catalogCommit: '1'.repeat(40),
    codeName: 'Old · 舊',
    catalogRecord: 'hk-dish-0001',
    catalogSlug: 'old',
    publicPhotoUrl: 'https://example.invalid/old.png',
    publicPhotoAsset: 'old.png',
    container: {
      localTag: 'old',
      ociArchive: 'old.tar',
      optionalRegistryTag: 'old',
      createdAt: '1970-01-01T00:00:00.000Z',
      sourceCommit: '0'.repeat(40),
      runtime: { readOnlyRequired: true }
    }
  };
  const context = {
    version: '1.0.19',
    tag: 'v1.0.19',
    commit: '2'.repeat(40),
    createdAt: '2026-08-25T05:00:00.000Z',
    catalogStatus: 'resolved',
    catalogUnavailableReason: null,
    catalogCommit: '3'.repeat(40),
    codeName: 'New · 新',
    catalogRecord: 'hk-dish-0019',
    catalogSlug: 'new',
    publicPhotoUrl: 'https://example.invalid/new.png',
    publicPhotoAsset: 'new.png',
    containerArchive: 'hair-growth-api-1.0.19-linux-amd64.oci.tar'
  };
  const transformed = expectedReleaseMetadata(base, context);
  assert.equal(transformed.container.runtime.readOnlyRequired, true);
  assert.equal(transformed.container.sourceCommit, context.commit);
  assert.equal(transformed.publicPhotoAsset, context.publicPhotoAsset);
  assert.equal(base.version, '1.0.0');
});

test('clean-candidate assertion is red on any Git status entry and green only on empty status', () => {
  assert.equal(assertCleanStatus(''), true);
  assert.throws(() => assertCleanStatus(' M app/main.js'), /must be clean before packaging/);
  assert.throws(() => assertCleanStatus('?? untracked.js'), /must be clean before packaging/);
});

test('source-preservation receipt is red on one changed tracked byte and green on exact bytes', () => {
  const files = new Map([
    ['app/provenance.json', Buffer.from('source provenance\n')],
    ['package.json', Buffer.from('source package\n')]
  ]);
  const before = trackedSnapshot(files.keys(), (name) => files.get(name));
  const after = trackedSnapshot(files.keys(), (name) => files.get(name));
  assert.equal(assertTrackedSnapshot(before, after), true);
  files.set('app/provenance.json', Buffer.from('mutated provenance\n'));
  const changed = trackedSnapshot(files.keys(), (name) => files.get(name));
  assert.throws(() => assertTrackedSnapshot(before, changed), /changed, removed, or added tracked source bytes/);
});
