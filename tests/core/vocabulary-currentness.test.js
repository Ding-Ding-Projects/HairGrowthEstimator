'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseVocabularyBuffer } = require('../../app/core/vocabulary');

const sourcePath = process.env.HAIR_GROWTH_PERSONAL_VOCABULARY_PATH;
const expectedCount = Number(process.env.HAIR_GROWTH_PERSONAL_VOCABULARY_EXPECTED_COUNT);

test('externally supplied current private vocabulary matches its nonzero receipt count', {
  skip: sourcePath ? false : 'No external private vocabulary path was supplied.'
}, () => {
  assert.ok(Number.isInteger(expectedCount) && expectedCount > 0, 'A nonzero expected entry count must be supplied externally.');
  const bytes = fs.readFileSync(path.resolve(sourcePath));
  const value = parseVocabularyBuffer(bytes);
  const count = Object.keys(value.entries).length;
  assert.equal(count, expectedCount, 'The external private vocabulary entry count is not current.');

  const receipt = {
    schemaVersion: value.schemaVersion,
    entryCount: count,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    validatedAt: new Date().toISOString()
  };
  const receiptPath = path.resolve(process.env.HAIR_GROWTH_VOCABULARY_RECEIPT_PATH || path.join(os.tmpdir(), 'hair-growth-estimator-private-receipts', 'vocabulary-currentness.json'));
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const temporary = `${receiptPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, receiptPath);
  assert.equal(fs.statSync(receiptPath).isFile(), true);
});
