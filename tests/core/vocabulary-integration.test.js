'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const main = fs.readFileSync(path.join(root, 'app', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'app', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'app', 'renderer', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'app', 'renderer', 'index.html'), 'utf8');

test('main process owns the private vocabulary cache and revalidates it on reads', () => {
  assert.match(main, /const \{ LIMITS: VOCABULARY_LIMITS, VocabularyStore, serializeVocabularyCache \} = require\('\.\/core\/vocabulary'\)/);
  assert.match(main, /^\s*function personalVocabularyCachePath\(\)/m);
  assert.match(main, /userDataPath\('personal-vocabulary\.json'\)/);
  assert.match(main, /^\s*async function readVocabularyCache\(\)/m);
  assert.match(main, /new VocabularyStore\(await readVocabularyCacheBytes\(\)\)/);
  assert.match(main, /atomicWriteFile\(personalVocabularyCachePath\(\), serialized,/);
  assert.doesNotMatch(main, /atomicWriteFile\(personalVocabularyCachePath\(\), `\$\{serialized\}\\n`/);
  for (const channel of ['vocabulary:read', 'vocabulary:replace', 'vocabulary:clear']) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\('${channel.replace(/[.]/g, '\\.')}[']`));
  }
});

test('preload exposes only bounded vocabulary cache operations', () => {
  assert.match(preload, /vocabulary: Object\.freeze\(\{/);
  assert.match(preload, /read: \(\) => ipcRenderer\.invoke\('vocabulary:read'\)/);
  assert.match(preload, /replace: \(\) => ipcRenderer\.invoke\('vocabulary:replace'\)/);
  assert.match(preload, /clear: \(\) => ipcRenderer\.invoke\('vocabulary:clear'\)/);
});

test('renderer applies replacements only through marked owned text boundaries', () => {
  assert.match(renderer, /^\s*function applyOwnedVocabularyBoundaries\(\)/m);
  assert.match(renderer, /^\s*function setOwnedText\(element, value\)/m);
  assert.match(renderer, /^\s*function escapeVocabularyPattern\(value\)/m);
  assert.match(renderer, /source\.replace\(pattern, \(match\) => vocabularyCache\.entries\[match\]\)/);
  assert.doesNotMatch(renderer, /entries\.reduce\(\(result, \[needle, replacement\]\)/);
  assert.match(renderer, /^\s*async function loadVocabularyCache\(\)/m);
  assert.match(html, /data-vocabulary-owned/);
  assert.match(html, /data-vocabulary-preserve/);
  assert.doesNotMatch(renderer, /localStorage\.(?:getItem|setItem|removeItem)\('hair-growth-personal-vocabulary'/);
  assert.doesNotMatch(renderer, /^\s*function parseVocabulary\(/m);
});

test('vocabulary status is localized, privacy safe, live, and searchable', () => {
  for (const key of ['vocabularyNoFile', 'vocabularyLoading', 'vocabularyLoaded', 'vocabularyInvalid', 'vocabularyChoose', 'vocabularyReplace', 'vocabularyClear']) {
    assert.match(renderer, new RegExp(`${key}:`));
  }
  assert.match(renderer, /setOwnedText\(\$\('#choose-vocabulary'\), text\(status === 'loaded' \? 'vocabularyReplace' : 'vocabularyChoose'\)\)/);
  assert.match(html, /id="vocabulary-state"[^>]*aria-live="polite"/);
  assert.match(renderer, /id: 'vocabulary-choose'/);
  assert.match(renderer, /id: 'vocabulary-status'/);
  assert.match(renderer, /id: 'vocabulary-clear'/);
  assert.doesNotMatch(renderer, /Object\.keys\(parsed\.(?:entries|replacements)\)\.length/);
  assert.doesNotMatch(renderer, /result\.name[^\n]*vocabulary-state/);
});

test('School mode suppresses and later restores vocabulary behavior completely', () => {
  assert.match(renderer, /^\s*function vocabularyEnabledForSurface\(\)/m);
  assert.match(renderer, /return !schoolRecord\?\.enabled && vocabularyCache\.status === 'loaded'/);
  assert.match(renderer, /paletteEntries\(\)[\s\S]*filter\(\(entry\) => !schoolRecord\?\.enabled \|\| entry\.feature !== 'vocabulary'\)/);
  assert.match(renderer, /applyOwnedVocabularyBoundaries\(\)/);
  assert.match(html, /data-school-feature="vocabulary"/);
  assert.doesNotMatch(renderer, /if \(schoolRecord\?\.enabled\) \{\s*state\.settings\.language = 'en'/);
});
