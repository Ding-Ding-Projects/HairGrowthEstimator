'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProvenance } = require('../../app/core/provenance');

const valid = {
  schemaVersion: 1,
  version: '1.0.0',
  commit: '0123456789abcdef0123456789abcdef01234567',
  updatedAt: '2026-08-24T20:00:01.000Z',
  timestampSource: 'git-commit-committer-date',
  signing: 'unsigned'
};

test('artifact provenance accepts an exact package version and recorded timestamp', () => {
  const result = validateProvenance(valid, '1.0.0');
  assert.equal(result.available, true);
  assert.equal(result.version, '1.0.0');
  assert.equal(result.updatedAt, '2026-08-24T20:00:01.000Z');
  assert.equal(result.signing, 'unsigned');
});

test('artifact provenance fails closed on a version mismatch', () => {
  const result = validateProvenance(valid, '1.0.1');
  assert.equal(result.available, false);
  assert.match(result.reason, /does not match/);
  assert.equal(result.updatedAt, null);
});

test('artifact provenance fails closed on launch-like or invalid timestamps', () => {
  const invalid = validateProvenance({ ...valid, updatedAt: 'now' }, '1.0.0');
  assert.equal(invalid.available, false);
  assert.match(invalid.reason, /invalid updated-at/);
});

test('artifact provenance rejects unknown timestamp sources', () => {
  const invalid = validateProvenance({ ...valid, timestampSource: 'file-mtime' }, '1.0.0');
  assert.equal(invalid.available, false);
  assert.match(invalid.reason, /unknown timestamp source/);
});
