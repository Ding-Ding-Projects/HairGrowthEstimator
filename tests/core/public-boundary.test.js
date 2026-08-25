'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { parseVocabularyBuffer } = require('../../app/core/vocabulary');

const root = path.resolve(__dirname, '..', '..');
const sourcePath = process.env.HAIR_GROWTH_PERSONAL_VOCABULARY_PATH;
const textExtensions = new Set(['.bat', '.css', '.html', '.js', '.json', '.md', '.mjs', '.txt', '.yaml', '.yml']);

function trackedTextFiles() {
  return childProcess.execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((file) => textExtensions.has(path.extname(file).toLowerCase()));
}

function includesReservedPresentation(text, reservedValues) {
  const folded = text.normalize('NFKC').toLocaleLowerCase();
  return reservedValues.some((value) => folded.includes(value));
}

test('tracked public source excludes externally supplied private presentation values', {
  skip: sourcePath ? false : 'No external private vocabulary path was supplied.'
}, () => {
  const parsed = parseVocabularyBuffer(fs.readFileSync(path.resolve(sourcePath)));
  const reservedValues = Object.entries(parsed.entries)
    .filter(([source, value]) => source.toLocaleLowerCase() !== 'codex' && value.length >= 6)
    .map(([, value]) => value.normalize('NFKC').toLocaleLowerCase());
  assert.ok(reservedValues.length > 0, 'The external source did not provide any bounded presentation values to scan.');
  let violatingFiles = 0;
  for (const relative of trackedTextFiles()) {
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    if (includesReservedPresentation(text, reservedValues)) violatingFiles += 1;
  }
  assert.equal(violatingFiles, 0, 'Tracked public source contains private presentation text.');
});
