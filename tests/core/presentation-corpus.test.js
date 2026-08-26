'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  PRESENTATION_ARTICLES,
  PRESENTATION_COMPOSITION,
  PRESENTATION_CORPUS,
  PRESENTATION_INVENTORY_IDS,
  PRESENTATION_INVENTORY_SUMMARY,
  resolvePresentationArticle,
  resolvePresentationByEnglishSource,
  resolvePresentationById,
  validatePresentationCorpus
} = require('../../app/core/presentation-corpus');
const {
  ARTICLE_ROWS,
  COMMAND_SETTINGS_PALETTE_SOURCE_ROWS,
  NOTIFICATION_ERROR_SOURCE_ROWS,
  RENDERER_SOURCE_ROWS
} = require('../../app/core/presentation-renderer-rows');

function mutableCorpus() {
  return structuredClone(PRESENTATION_CORPUS);
}

function decodeHtmlText(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function currentIndexSources() {
  const html = fs.readFileSync(path.join(__dirname, '../../app/renderer/index.html'), 'utf8');
  const sources = new Set();
  for (const match of html.matchAll(/>([^<>]+)</g)) {
    const value = decodeHtmlText(match[1]);
    if (value) sources.add(value);
  }
  for (const expression of [
    /\baria-label="([^"]+)"/g,
    /\bplaceholder="([^"]+)"/g,
    /\balt="([^"]+)"/g,
    /<input\b[^>]*\bvalue="([^"]+)"[^>]*>/g
  ]) {
    for (const match of html.matchAll(expression)) {
      const value = decodeHtmlText(match[1]);
      if (value) sources.add(value);
    }
  }
  return sources;
}

function assertRendererSourceBoundary(row, appLines) {
  assert.equal(Number.isInteger(row.sourceLine), true, row.id + ' needs an exact source line');
  const line = appLines[row.sourceLine - 1];
  assert.equal(typeof line, 'string', row.id + ' points outside app.js');
  const normalizedLine = line.replace(/\\'/g, "'").replace(/\\"/g, '"');
  const sourceFragments = row.en
    .split(/\{[a-z][a-zA-Z0-9]*\}/g)
    .filter((value) => value.length >= 2);
  const exactFragments = (row.exact || [])
    .map(String)
    .filter((value) => value.length >= 2 && !row.placeholders.includes(value));
  const sourceNeedles = (row.sourceNeedles || [])
    .map(String)
    .filter((value) => value.length >= 2);
  const candidates = [...sourceFragments, ...exactFragments, ...sourceNeedles];
  assert.ok(candidates.length > 0, row.id + ' has no independent source needle');
  assert.ok(
    candidates.some((candidate) => normalizedLine.includes(candidate)),
    row.id + ' has no exact source needle on app.js line ' + row.sourceLine
  );
}

test('exports an immutable, explicit renderer inventory with all index and article boundaries', () => {
  assert.equal(Object.isFrozen(PRESENTATION_CORPUS), true);
  assert.equal(Object.isFrozen(PRESENTATION_INVENTORY_IDS), true);
  assert.equal(Object.isFrozen(PRESENTATION_INVENTORY_SUMMARY), true);
  assert.equal(Object.isFrozen(PRESENTATION_COMPOSITION), true);
  assert.equal(PRESENTATION_INVENTORY_SUMMARY.indexSourceCount, 515);
  assert.equal(PRESENTATION_INVENTORY_SUMMARY.articleCount, 15);
  assert.equal(PRESENTATION_INVENTORY_SUMMARY.totalCount, PRESENTATION_INVENTORY_IDS.length);
  assert.equal(PRESENTATION_INVENTORY_SUMMARY.rendererBoundaryCount, 288);
  assert.deepEqual(PRESENTATION_INVENTORY_SUMMARY.rendererCounts, {
    commandSettingsPalette: 19,
    notificationError: 91,
    other: 178
  });
  assert.deepEqual(PRESENTATION_INVENTORY_SUMMARY.rendererInvocationCounts, {
    notify: 27,
    handleError: 44,
    total: 71
  });
  assert.ok(PRESENTATION_INVENTORY_SUMMARY.templateCount > 0);
  assert.ok(PRESENTATION_INVENTORY_SUMMARY.preservedCount > 0);
  assert.deepEqual(validatePresentationCorpus(), PRESENTATION_INVENTORY_SUMMARY);
});

test('matches the complete case-sensitive current index source boundary instead of discovering only registered rows', () => {
  const expected = currentIndexSources();
  const actual = new Set(
    Object.values(PRESENTATION_CORPUS)
      .filter((entry) => entry.sourceSet === 'index')
      .map((entry) => entry.source)
  );
  assert.equal(expected.size, 515);
  assert.equal(actual.size, 515);
  assert.deepEqual([...actual].sort(), [...expected].sort());
});

test('pins every hand-written renderer row to its current app.js source line and exact literal boundary', () => {
  const appLines = fs.readFileSync(path.join(__dirname, '../../app/renderer/app.js'), 'utf8').split(/\r?\n/);
  assert.equal(COMMAND_SETTINGS_PALETTE_SOURCE_ROWS.length, 19);
  assert.equal(NOTIFICATION_ERROR_SOURCE_ROWS.length, 91);
  assert.ok(RENDERER_SOURCE_ROWS.length > 0);
  assert.equal(ARTICLE_ROWS.length, 15);
  assert.equal(appLines.filter((line) => /\bnotify\(/.test(line)).length - 1, 27);
  assert.equal(appLines.filter((line) => /\bhandleError\(/.test(line)).length - 1, 44);
  for (const row of [
    ...COMMAND_SETTINGS_PALETTE_SOURCE_ROWS,
    ...NOTIFICATION_ERROR_SOURCE_ROWS,
    ...RENDERER_SOURCE_ROWS
  ]) {
    assertRendererSourceBoundary(row, appLines);
  }
});

test('the strict validator turns red when one explicit inventory entry is deleted, then returns green when restored', () => {
  const corpus = mutableCorpus();
  const id = PRESENTATION_INVENTORY_IDS[0];
  const restored = corpus[id];
  delete corpus[id];
  assert.throws(
    () => validatePresentationCorpus(corpus, PRESENTATION_INVENTORY_IDS),
    new RegExp('Missing presentation corpus entry: ' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  corpus[id] = restored;
  assert.deepEqual(validatePresentationCorpus(corpus, PRESENTATION_INVENTORY_IDS), PRESENTATION_INVENTORY_SUMMARY);
});

test('the strict validator turns red when a Cantonese level-5 variant is omitted, then returns green when restored', () => {
  const corpus = mutableCorpus();
  const id = PRESENTATION_INVENTORY_IDS.find((candidate) => !corpus[candidate].preserve);
  const restored = corpus[id].variants.yue['5'];
  delete corpus[id].variants.yue['5'];
  assert.throws(
    () => validatePresentationCorpus(corpus, PRESENTATION_INVENTORY_IDS),
    new RegExp('Missing yue level 5 variant: ' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  corpus[id].variants.yue['5'] = restored;
  assert.deepEqual(validatePresentationCorpus(corpus, PRESENTATION_INVENTORY_IDS), PRESENTATION_INVENTORY_SUMMARY);
});

test('the strict validator turns red when Cantonese is misrouted to English or contains no Han text', () => {
  const corpus = mutableCorpus();
  const id = PRESENTATION_INVENTORY_IDS.find((candidate) => !corpus[candidate].preserve);
  const restored = corpus[id].variants.yue['1'];
  corpus[id].variants.yue['1'] = corpus[id].variants.en['1'];
  assert.throws(
    () => validatePresentationCorpus(corpus, PRESENTATION_INVENTORY_IDS),
    new RegExp('Cantonese variant must contain distinct Han text: ' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  corpus[id].variants.yue['1'] = 'Cantonese only';
  assert.throws(
    () => validatePresentationCorpus(corpus, PRESENTATION_INVENTORY_IDS),
    /Cantonese variant must contain distinct Han text/
  );
  corpus[id].variants.yue['1'] = restored;
  assert.deepEqual(validatePresentationCorpus(corpus, PRESENTATION_INVENTORY_IDS), PRESENTATION_INVENTORY_SUMMARY);
});

test('resolves exact English source with renderer-friendly language and independent funny levels', () => {
  const source = 'Record a haircut';
  const serious = resolvePresentationByEnglishSource(source, {
    language: 'en',
    funnyEnglish: 1,
    funnyCantonese: 5
  });
  assert.equal(serious.primary, source);
  assert.equal(serious.secondary, null);
  assert.equal(serious.text, source);

  const bilingual = resolvePresentationByEnglishSource(source, {
    language: 'bilingual',
    funnyEnglish: 1,
    funnyCantonese: 5
  });
  assert.equal(bilingual.primary, source);
  assert.match(bilingual.secondary, /[\u3400-\u9fff]/u);
  assert.equal(bilingual.text, bilingual.primary + PRESENTATION_COMPOSITION.textSeparator + bilingual.secondary);
  assert.equal(bilingual.segments[0].language, 'en');
  assert.equal(bilingual.segments[1].language, 'yue');
});

test('preserves complete technical sources, URLs, paths, version facts, and provider text in every mode', () => {
  for (const source of [
    'RFC 6238',
    'SHA-256',
    'https://example.invalid/settings',
    '{"schemaVersion":1,"settings":{...}}',
    'Ctrl+L'
  ]) {
    const result = resolvePresentationByEnglishSource(source, {
      language: 'bilingual',
      funnyEnglish: 5,
      funnyCantonese: 5
    });
    assert.equal(result.primary, source);
    assert.equal(result.secondary, source);
    assert.equal(result.preserve, true);
  }
});

test('resolves bounded named-placeholder templates without changing factual values', () => {
  const templateId = PRESENTATION_INVENTORY_IDS.find((id) => PRESENTATION_CORPUS[id].template);
  assert.ok(templateId);
  const placeholders = PRESENTATION_CORPUS[templateId].placeholders;
  const values = Object.fromEntries(placeholders.map((name, index) => [name, 'FACT-' + index]));
  const result = resolvePresentationById(templateId, {
    language: 'bilingual',
    funnyEnglish: 5,
    funnyCantonese: 1
  }, values);
  for (const value of Object.values(values)) {
    assert.match(result.primary, new RegExp(value));
    assert.match(result.secondary, new RegExp(value));
  }
  assert.throws(() => resolvePresentationById(templateId, { language: 'en' }, {}), /Missing template value/);
  assert.throws(() => resolvePresentationById(templateId, { language: 'en' }, { ...values, surprise: 'extra' }), /Unexpected template value/);
  assert.throws(() => resolvePresentationById(templateId, { language: 'en' }, Object.fromEntries(placeholders.map((name) => [name, {}]))), /bounded scalar/);
});

test('matches an actual constructed English source against the most specific bounded registered template', () => {
  const templateId = PRESENTATION_INVENTORY_IDS.find((id) => {
    const entry = PRESENTATION_CORPUS[id];
    return entry.template && entry.source.replace(/\{[a-z][a-zA-Z0-9]*\}/g, '').length >= 6;
  });
  assert.ok(templateId);
  const entry = PRESENTATION_CORPUS[templateId];
  const values = Object.fromEntries(entry.placeholders.map((name, index) => [name, 'BOUND-' + index]));
  const constructed = entry.source.replace(/\{([a-z][a-zA-Z0-9]*)\}/g, (_match, name) => values[name]);
  const result = resolvePresentationByEnglishSource(constructed, {
    language: 'bilingual',
    funnyEnglish: 1,
    funnyCantonese: 5
  });
  assert.equal(result.id, templateId);
  assert.equal(result.fallback, false);
  for (const value of Object.values(values)) {
    assert.match(result.primary, new RegExp(value));
  }
  for (const name of entry.requiredPlaceholders) {
    assert.match(result.secondary, new RegExp(values[name]));
  }
});

test('returns an honest English fallback for an unregistered exact source', () => {
  const source = 'Unregistered provider fact 9.4.2';
  const result = resolvePresentationByEnglishSource(source, {
    language: 'bilingual',
    funnyEnglish: 5,
    funnyCantonese: 5
  });
  assert.equal(result.fallback, true);
  assert.equal(result.primary, source);
  assert.equal(result.secondary, null);
  assert.equal(result.text, source);
});

test('resolves all bundled articles as complete title and body records with separate bilingual segments', () => {
  assert.equal(Object.keys(PRESENTATION_ARTICLES).length, 15);
  for (const [id, article] of Object.entries(PRESENTATION_ARTICLES)) {
    assert.equal(typeof article.titleSource, 'string');
    assert.equal(typeof article.bodySourceHtml, 'string');
    assert.match(article.bodySourceHtml, /<p>|<ul>|<ol>/);
    const resolved = resolvePresentationArticle(id, {
      language: 'bilingual',
      funnyEnglish: 5,
      funnyCantonese: 5
    });
    assert.equal(resolved.primary.language, 'en');
    assert.equal(resolved.secondary.language, 'yue');
    assert.match(resolved.primary.bodyHtml, /<p>|<ul>|<ol>/);
    assert.match(resolved.secondary.bodyHtml, /<p>|<ul>|<ol>/);
    assert.equal(resolved.composition.articleSeparatorElement, 'hr');
    assert.equal(resolved.composition.articleSeparatorAriaHidden, true);
  }
});

test('provides explicit School-safe About and Privacy article bodies', () => {
  for (const id of ['about', 'privacy']) {
    const article = PRESENTATION_ARTICLES[id];
    assert.ok(article.schoolSafe);
    const ordinary = resolvePresentationArticle(id, { language: 'en', funnyEnglish: 1 }, { schoolMode: false });
    const schoolSafe = resolvePresentationArticle(id, { language: 'en', funnyEnglish: 1 }, { schoolMode: true });
    assert.notEqual(schoolSafe.primary.bodyHtml, ordinary.primary.bodyHtml);
    assert.doesNotMatch(schoolSafe.primary.bodyHtml, /Cantonese|bilingual|funny|dim[ -]sum|personal vocabulary/i);
  }
});

test('rejects invalid language options, funny levels, identifiers, and oversized sources', () => {
  assert.throws(() => resolvePresentationById('missing.id'), /Unknown presentation corpus id/);
  assert.throws(() => resolvePresentationById(PRESENTATION_INVENTORY_IDS[0], { language: 'fr' }), /Unsupported language/);
  assert.throws(() => resolvePresentationById(PRESENTATION_INVENTORY_IDS[0], { funnyEnglish: 0 }), /funnyEnglish/);
  assert.throws(() => resolvePresentationByEnglishSource('x'.repeat(65537)), /at most 65536/);
});
