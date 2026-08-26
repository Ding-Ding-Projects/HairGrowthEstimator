import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  EvidenceError,
  assertFrozenDirectory,
  assertPublicReceiptValue,
  canonicalJson,
  freezeDirectory,
  inspectPng,
  inspectWebp,
  strictChild
} from '../../scripts/evidence/common.mjs';
import { makeAnimatedWebp, makePng } from './fixtures.mjs';

async function temporaryDirectory(t) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'hair-growth-evidence-common-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  return directory;
}

function assertEvidenceCode(action, code) {
  assert.throws(action, (error) => error instanceof EvidenceError && error.code === code);
}

test('canonical receipt JSON is deterministic and rejects unsafe values', () => {
  assert.equal(canonicalJson({ z: 1, a: ['x', true] }), '{"a":["x",true],"z":1}');
  assertEvidenceCode(() => canonicalJson({ value: undefined }), 'INVALID_RECEIPT_VALUE');
  assertEvidenceCode(() => canonicalJson({ value: Number.POSITIVE_INFINITY }), 'INVALID_RECEIPT_VALUE');
  const cyclic = {};
  cyclic.self = cyclic;
  assertEvidenceCode(() => canonicalJson(cyclic), 'INVALID_RECEIPT_VALUE');
});

test('receipt privacy scan rejects secret-like values and user-profile paths', () => {
  assert.deepEqual(assertPublicReceiptValue({ state: 'ready' }), { state: 'ready' });
  assertEvidenceCode(() => assertPublicReceiptValue({ header: 'Authorization: Bearer example-value' }), 'SENSITIVE_RECEIPT');
  assertEvidenceCode(() => assertPublicReceiptValue({ path: 'C:/Users/example/Documents/private.txt' }), 'SENSITIVE_RECEIPT');
});

test('PNG identity parser accepts non-uniform pixels and rejects metadata or invisible pixels', async (t) => {
  const directory = await temporaryDirectory(t);
  const validPath = path.join(directory, 'valid.png');
  const metadataPath = path.join(directory, 'metadata.png');
  const transparentPath = path.join(directory, 'transparent.png');
  const unknownPath = path.join(directory, 'unknown.png');
  await Promise.all([
    fsp.writeFile(validPath, makePng()),
    fsp.writeFile(metadataPath, makePng(320, 240, { metadata: true })),
    fsp.writeFile(transparentPath, makePng(320, 240, { transparent: true })),
    fsp.writeFile(unknownPath, makePng(320, 240, { unknownChunk: true }))
  ]);
  const valid = await inspectPng(validPath);
  assert.deepEqual({ mimeType: valid.mimeType, width: valid.width, height: valid.height, nonblank: valid.nonblank }, {
    mimeType: 'image/png', width: 320, height: 240, nonblank: true
  });
  await assert.rejects(inspectPng(metadataPath), (error) => error instanceof EvidenceError && error.code === 'PNG_METADATA_FORBIDDEN');
  await assert.rejects(inspectPng(transparentPath), (error) => error instanceof EvidenceError && error.code === 'BLANK_CAPTURE');
  await assert.rejects(inspectPng(unknownPath), (error) => error instanceof EvidenceError && error.code === 'PNG_CHUNK_FORBIDDEN');
});

test('WebP identity parser requires an animated metadata-free RIFF container', async (t) => {
  const directory = await temporaryDirectory(t);
  const validPath = path.join(directory, 'valid.webp');
  const staticPath = path.join(directory, 'static.webp');
  const metadataPath = path.join(directory, 'metadata.webp');
  const unknownPath = path.join(directory, 'unknown.webp');
  const geometryPath = path.join(directory, 'geometry.webp');
  const orderPath = path.join(directory, 'order.webp');
  await Promise.all([
    fsp.writeFile(validPath, makeAnimatedWebp(320, 240, 3)),
    fsp.writeFile(staticPath, makeAnimatedWebp(320, 240, 1)),
    fsp.writeFile(metadataPath, makeAnimatedWebp(320, 240, 2, { metadata: true })),
    fsp.writeFile(unknownPath, makeAnimatedWebp(320, 240, 2, { unknownChunk: true })),
    fsp.writeFile(geometryPath, makeAnimatedWebp(320, 240, 2, { invalidGeometry: true })),
    fsp.writeFile(orderPath, makeAnimatedWebp(320, 240, 2, { invalidOrder: true }))
  ]);
  const valid = await inspectWebp(validPath, { requireAnimation: true });
  assert.deepEqual({ mimeType: valid.mimeType, width: valid.width, height: valid.height, animated: valid.animated, frames: valid.frames }, {
    mimeType: 'image/webp', width: 320, height: 240, animated: true, frames: 3
  });
  await assert.rejects(inspectWebp(staticPath, { requireAnimation: true }), (error) => error instanceof EvidenceError && error.code === 'NOT_ANIMATED_WEBP');
  await assert.rejects(inspectWebp(metadataPath, { requireAnimation: true }), (error) => error instanceof EvidenceError && error.code === 'WEBP_METADATA_FORBIDDEN');
  await assert.rejects(inspectWebp(unknownPath, { requireAnimation: true }), (error) => error instanceof EvidenceError && error.code === 'WEBP_CHUNK_FORBIDDEN');
  await assert.rejects(inspectWebp(geometryPath, { requireAnimation: true }), (error) => error instanceof EvidenceError && error.code === 'INVALID_WEBP');
  await assert.rejects(inspectWebp(orderPath, { requireAnimation: true }), (error) => error instanceof EvidenceError && error.code === 'INVALID_WEBP');
});

test('owned frozen directory binds exact copied bytes and rejects later mutation', async (t) => {
  const directory = await temporaryDirectory(t);
  const source = path.join(directory, 'source');
  const destination = path.join(directory, 'frozen');
  await fsp.mkdir(path.join(source, 'resources'), { recursive: true });
  await fsp.writeFile(path.join(source, 'app.exe'), 'one', 'utf8');
  await fsp.writeFile(path.join(source, 'resources', 'app.asar'), 'two', 'utf8');
  const binding = await freezeDirectory(source, destination);
  assert.equal((await assertFrozenDirectory(binding)).fileCount, 2);
  await fsp.writeFile(path.join(source, 'app.exe'), 'source changed', 'utf8');
  assert.equal((await assertFrozenDirectory(binding)).fileCount, 2);
  await fsp.writeFile(path.join(destination, 'app.exe'), 'frozen changed', 'utf8');
  await assert.rejects(assertFrozenDirectory(binding), (error) => error instanceof EvidenceError && error.code === 'FROZEN_BYTES_CHANGED');
});

test('strict child validation refuses root equality and parent traversal', async (t) => {
  const directory = await temporaryDirectory(t);
  const child = path.join(directory, 'owned', 'result.png');
  assert.equal((await strictChild(child, directory)).relative, 'owned/result.png');
  await assert.rejects(strictChild(directory, directory), (error) => error instanceof EvidenceError && error.code === 'PATH_ESCAPE');
  await assert.rejects(strictChild(path.resolve(directory, '..', 'outside.png'), directory), (error) => error instanceof EvidenceError && error.code === 'PATH_ESCAPE');
});
