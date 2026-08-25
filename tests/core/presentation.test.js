'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Presentation = require('../../app/core/presentation');

const placeholderNames = (template) => [...template.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
  .map((match) => match[1])
  .sort();

test('exports the exact rendering seam and immutable public metadata', () => {
  assert.equal(typeof Presentation.renderMessage, 'function');
  assert.equal(typeof Presentation.renderLiteral, 'function');
  assert.equal(typeof Presentation.renderCategoryMessage, 'function');
  assert.deepEqual(Presentation.LANGUAGE_MODES, ['en', 'yue', 'bilingual']);
  assert.deepEqual(Presentation.FUNNY_LEVELS, [1, 2, 3, 4, 5]);
  assert.deepEqual(Presentation.MESSAGE_CATEGORIES, [
    'informational',
    'success',
    'progress',
    'warning',
    'error',
    'destructive',
    'security',
    'accessibility',
    'notification'
  ]);

  for (const value of [
    Presentation.LANGUAGE_MODES,
    Presentation.FUNNY_LEVELS,
    Presentation.MESSAGE_CATEGORIES,
    Presentation.LANGUAGE_METADATA,
    Presentation.CATEGORY_METADATA,
    Presentation.LEVEL_METADATA,
    Presentation.CATALOG_METADATA,
    Presentation.CATALOG,
    Presentation.LITERAL_CATALOG
  ]) assert.ok(Object.isFrozen(value));
});

test('category and level metadata explicitly covers every supported boundary', () => {
  assert.deepEqual(Object.keys(Presentation.CATEGORY_METADATA), Presentation.MESSAGE_CATEGORIES);
  assert.deepEqual(Object.keys(Presentation.LEVEL_METADATA), Presentation.FUNNY_LEVELS.map(String));
  assert.equal(Presentation.LEVEL_METADATA[1].tone, 'fully serious');
  assert.equal(Presentation.LEVEL_METADATA[5].tone, 'maximum playfulness');
  assert.equal(Presentation.CATALOG_METADATA.categoryCount, 9);
  assert.equal(Presentation.CATALOG_METADATA.levelCount, 5);
  assert.equal(Presentation.CATALOG_METADATA.messageCount, Object.keys(Presentation.CATALOG).length);
  assert.equal(Presentation.CATALOG_METADATA.literalCount, Object.keys(Presentation.LITERAL_CATALOG).length);
  assert.equal(Presentation.CATALOG_METADATA.literalMaxCharacters, 1000);
  assert.equal(Presentation.CATALOG_METADATA.literalCatalogMaxEntries, 128);
  assert.ok(Presentation.CATALOG_METADATA.literalCount <= Presentation.CATALOG_METADATA.literalCatalogMaxEntries);
});

test('the bounded literal catalog has complete English and Cantonese levels', () => {
  for (const [english, entry] of Object.entries(Presentation.LITERAL_CATALOG)) {
    assert.equal(entry.key, null);
    assert.ok(Presentation.MESSAGE_CATEGORIES.includes(entry.category));
    assert.equal(entry.en.length, 5);
    assert.equal(entry.yue.length, 5);
    assert.ok(entry.en.every((variant) => variant.includes(english)));
    assert.ok(entry.yue.every((variant) => variant.trim().length > 0));
    assert.ok([...entry.en, ...entry.yue].every((variant) => placeholderNames(variant).length === 0));
    assert.ok(Object.isFrozen(entry));
    assert.ok(Object.isFrozen(entry.en));
    assert.ok(Object.isFrozen(entry.yue));
  }
});

test('the catalog has all nine categories and five complete variants per language', () => {
  const seen = new Set();
  for (const [key, entry] of Object.entries(Presentation.CATALOG)) {
    assert.equal(entry.key, key);
    assert.ok(Presentation.MESSAGE_CATEGORIES.includes(entry.category));
    assert.equal(entry.en.length, 5);
    assert.equal(entry.yue.length, 5);
    assert.ok(Object.isFrozen(entry));
    assert.ok(Object.isFrozen(entry.en));
    assert.ok(Object.isFrozen(entry.yue));
    seen.add(entry.category);

    const expected = placeholderNames(entry.en[0]);
    for (const variant of [...entry.en, ...entry.yue]) {
      assert.deepEqual(placeholderNames(variant), expected, `${key} changed its factual placeholders`);
    }
  }
  assert.deepEqual([...seen].sort(), [...Presentation.MESSAGE_CATEGORIES].sort());
});

test('English rendering uses only the independently selected English funny level', () => {
  const rendered = Presentation.renderMessage('informational.estimate', {
    language: 'en',
    funnyEnglish: 2,
    funnyCantonese: 5,
    facts: { length: '7.25 cm', date: '2026-08-25' }
  });
  assert.equal(rendered.primary, 'Update: Estimated hair length is 7.25 cm on 2026-08-25.');
  assert.equal(rendered.secondary, null);
  assert.equal(rendered.text, rendered.primary);
  assert.equal(rendered.primaryLanguage, 'en');
  assert.deepEqual(rendered.segments, [{ language: 'en', text: rendered.primary }]);
});

test('Cantonese rendering uses only the independently selected Cantonese funny level', () => {
  const rendered = Presentation.renderMessage('progress.calculation', {
    language: 'yue',
    funnyEnglish: 1,
    funnyCantonese: 4,
    facts: { percent: 64 }
  });
  assert.equal(rendered.primary, '迷你進度列車開緊：頭髮生長計算完成咗 64%。');
  assert.equal(rendered.secondary, null);
  assert.equal(rendered.primaryLanguage, 'yue');
  assert.deepEqual(rendered.segments, [{ language: 'yue', text: rendered.primary }]);
});

test('bilingual rendering keeps English primary and Cantonese secondary', () => {
  const rendered = Presentation.renderMessage('success.haircutSaved', {
    language: 'bilingual',
    funnyEnglish: 3,
    funnyCantonese: 5,
    facts: { date: '2026-08-25' }
  });
  assert.equal(rendered.primary, 'Good news: Haircut record for 2026-08-25 was saved.');
  assert.equal(rendered.secondary, '迷你紙碎炮批准放炮：2026-08-25 嘅剪髮紀錄已經儲存好。');
  assert.equal(rendered.text, `${rendered.primary}\n${rendered.secondary}`);
  assert.deepEqual(rendered.segments, [
    { language: 'en', text: rendered.primary },
    { language: 'yue', text: rendered.secondary }
  ]);
});

test('fact interpolation preserves exact finite scalar values without producing markup', () => {
  const rendered = Presentation.renderMessage('notification.message', {
    language: 'en',
    funnyEnglish: 1,
    funnyCantonese: 1,
    facts: {
      title: 'Result',
      message: '<img src=x onerror=alert(1)>',
      count: 0,
      enabled: false
    }
  });
  assert.equal(rendered.text, 'Result: <img src=x onerror=alert(1)> (count 0, enabled false).');
  assert.equal(rendered.html, undefined);
});

test('missing, extra, non-finite, accessor, and structured facts fail closed', () => {
  const base = { language: 'en', funnyEnglish: 1, funnyCantonese: 1 };
  assert.throws(() => Presentation.renderMessage('error.operationFailed', {
    ...base, facts: { operation: 'Save' }
  }), /Missing fact: reason/);
  assert.throws(() => Presentation.renderMessage('error.operationFailed', {
    ...base, facts: { operation: 'Save', reason: 'disk full', extra: true }
  }), /Unexpected fact: extra/);
  assert.throws(() => Presentation.renderMessage('error.operationFailed', {
    ...base, facts: { operation: 'Save', reason: Number.NaN }
  }), /finite/);
  assert.throws(() => Presentation.renderMessage('error.operationFailed', {
    ...base, facts: { operation: 'Save', reason: { code: 'FULL' } }
  }), /scalar/);
  assert.throws(() => Presentation.renderMessage('error.operationFailed', {
    ...base,
    facts: Object.defineProperty({ operation: 'Save' }, 'reason', { enumerable: true, get: () => 'disk full' })
  }), /data property/);
});

test('unknown keys, language modes, and funny levels fail closed', () => {
  assert.throws(() => Presentation.renderMessage('missing.key'), /Unknown presentation message key/);
  assert.throws(() => Presentation.renderMessage('informational.estimate', {
    language: 'fr', funnyEnglish: 1, funnyCantonese: 1, facts: { length: '1 cm', date: '2026-08-25' }
  }), /Unsupported language mode/);
  assert.throws(() => Presentation.renderMessage('informational.estimate', {
    language: 'en', funnyEnglish: 0, funnyCantonese: 1, facts: { length: '1 cm', date: '2026-08-25' }
  }), /between 1 and 5/);
  assert.throws(() => Presentation.renderMessage('informational.estimate', {
    language: 'en', funnyEnglish: 1, funnyCantonese: 6, facts: { length: '1 cm', date: '2026-08-25' }
  }), /between 1 and 5/);
});

test('each explicit message category renders its factual values at both extreme levels', () => {
  const samples = {
    'informational.estimate': { length: '8 cm', date: '2026-08-25' },
    'success.haircutSaved': { date: '2026-08-25' },
    'progress.calculation': { percent: 50 },
    'warning.growthRate': { rate: '1 cm' },
    'error.operationFailed': { operation: 'Save', reason: 'disk full' },
    'destructive.deleteHaircuts': { count: 3 },
    'security.connectionRejected': { destination: 'https://example.test', reason: 'certificate mismatch' },
    'accessibility.announcement': { message: 'Hair length updated' },
    'notification.message': { title: 'Ready', message: 'Estimate updated', count: 1, enabled: true }
  };

  for (const [key, facts] of Object.entries(samples)) {
    const serious = Presentation.renderMessage(key, {
      language: 'bilingual', funnyEnglish: 1, funnyCantonese: 1, facts
    });
    const playful = Presentation.renderMessage(key, {
      language: 'bilingual', funnyEnglish: 5, funnyCantonese: 5, facts
    });
    for (const value of Object.values(facts).map(String)) {
      assert.ok(serious.text.includes(value), `${key} serious copy omitted ${value}`);
      assert.ok(playful.text.includes(value), `${key} playful copy omitted ${value}`);
    }
    assert.notEqual(playful.primary, serious.primary);
    assert.notEqual(playful.secondary, serious.secondary);
  }
});

test('category messages frame one exact scalar payload across all categories and funny extremes', () => {
  const message = 'Server E17 returned 41 records.';
  for (const category of Presentation.MESSAGE_CATEGORIES) {
    const serious = Presentation.renderCategoryMessage(category, message, {
      language: 'bilingual', funnyEnglish: 1, funnyCantonese: 1
    });
    const playful = Presentation.renderCategoryMessage(category, message, {
      language: 'bilingual', funnyEnglish: 5, funnyCantonese: 5
    });
    assert.equal(serious.category, category);
    assert.equal(playful.category, category);
    assert.equal(serious.source, 'category-message');
    assert.equal(playful.source, 'category-message');
    assert.ok(serious.primary.includes(message));
    assert.ok(serious.secondary.includes(message));
    assert.ok(playful.primary.includes(message));
    assert.ok(playful.secondary.includes(message));
    assert.equal(serious.primary.match(/Server E17 returned 41 records[.]/g).length, 1);
    assert.equal(serious.secondary.match(/Server E17 returned 41 records[.]/g).length, 1);
    assert.equal(playful.primary.match(/Server E17 returned 41 records[.]/g).length, 1);
    assert.equal(playful.secondary.match(/Server E17 returned 41 records[.]/g).length, 1);
    assert.notEqual(playful.primary, serious.primary);
    assert.notEqual(playful.secondary, serious.secondary);
  }
});

test('category messages honor three language modes and independently selected levels', () => {
  const english = Presentation.renderCategoryMessage('success', '42 records saved.', {
    language: 'en', funnyEnglish: 2, funnyCantonese: 5
  });
  assert.equal(english.primary, 'Done: 42 records saved.');
  assert.equal(english.secondary, null);
  assert.equal(english.primaryLanguage, 'en');

  const cantonese = Presentation.renderCategoryMessage('warning', 'Check code E17.', {
    language: 'yue', funnyEnglish: 1, funnyCantonese: 4
  });
  assert.equal(cantonese.primary, '黃色小旗好有禮貌咁揮緊：Check code E17.');
  assert.equal(cantonese.secondary, null);
  assert.equal(cantonese.primaryLanguage, 'yue');

  const bilingual = Presentation.renderCategoryMessage('error', 'Save failed with E17.', {
    language: 'bilingual', funnyEnglish: 4, funnyCantonese: 2
  });
  assert.equal(bilingual.primary, 'The plan tripped over its own shoelace: Save failed with E17.');
  assert.equal(bilingual.secondary, '出咗問題：Save failed with E17.');
});

test('category message input is strict, bounded, immutable, and plain text only', () => {
  assert.throws(() => Presentation.renderCategoryMessage('other', 'Message'), /Unsupported presentation category/);
  assert.throws(() => Presentation.renderCategoryMessage('notification', undefined), /must be a scalar/);
  assert.throws(() => Presentation.renderCategoryMessage('notification', Number.NaN), /finite/);
  assert.throws(() => Presentation.renderCategoryMessage('notification', {}), /must be a scalar/);
  assert.throws(() => Presentation.renderCategoryMessage('notification', '   '), /must not be empty/);
  assert.throws(() => Presentation.renderCategoryMessage('notification', 'x'.repeat(4097)), /at most 4096 characters/);

  const options = { language: 'en', funnyEnglish: 1, funnyCantonese: 5 };
  const rendered = Presentation.renderCategoryMessage('notification', '<strong>Ready</strong>', options);
  assert.equal(rendered.text, '<strong>Ready</strong>');
  assert.equal(rendered.html, undefined);
  assert.equal(Object.isFrozen(rendered), true);
  assert.equal(Object.isFrozen(rendered.segments), true);
  assert.equal(Object.isFrozen(options), false);
  assert.equal(Presentation.renderCategoryMessage('informational', 0, options).text, '0');
  assert.equal(Presentation.renderCategoryMessage('informational', false, options).text, 'false');
  assert.equal(Presentation.renderCategoryMessage('informational', 17n, options).text, '17');
});

test('registered literals render through independent English and Cantonese levels', () => {
  const rendered = Presentation.renderLiteral('Saved', {
    language: 'bilingual', funnyEnglish: 2, funnyCantonese: 5
  });
  assert.equal(rendered.primary, 'Done: Saved');
  assert.equal(rendered.secondary, '迷你紙碎炮批准放炮：已儲存。');
  assert.equal(rendered.fallback, false);
  assert.equal(rendered.category, 'success');
});

test('unregistered literals preserve exact English instead of inventing Cantonese or new facts', () => {
  const literal = 'Server E17 returned 41 records.';
  for (const language of Presentation.LANGUAGE_MODES) {
    const rendered = Presentation.renderLiteral(literal, {
      language, funnyEnglish: 5, funnyCantonese: 5
    });
    assert.equal(rendered.primary, literal);
    assert.equal(rendered.secondary, null);
    assert.equal(rendered.text, literal);
    assert.equal(rendered.primaryLanguage, 'en');
    assert.equal(rendered.fallback, true);
    assert.match(rendered.fallbackReason, /original English text was preserved/);
    assert.deepEqual(rendered.segments, [{ language: 'en', text: literal }]);
  }
  assert.equal(Presentation.renderLiteral('saved').fallback, true, 'literal matching must remain exact');
});

test('literal input is type checked, non-empty, and bounded', () => {
  assert.throws(() => Presentation.renderLiteral(42), /must be a string/);
  assert.throws(() => Presentation.renderLiteral('   '), /must not be empty/);
  assert.throws(() => Presentation.renderLiteral('x'.repeat(1001)), /at most 1000 characters/);
  assert.doesNotThrow(() => Presentation.renderLiteral('x'.repeat(1000)));
});

test('rendered contracts and every nested catalog value are immutable', () => {
  const options = {
    language: 'bilingual', funnyEnglish: 4, funnyCantonese: 4, facts: { rate: '1 cm' }
  };
  const rendered = Presentation.renderMessage('warning.growthRate', options);
  assert.ok(Object.isFrozen(rendered));
  assert.ok(Object.isFrozen(rendered.segments));
  assert.ok(Object.isFrozen(rendered.segments[0]));
  assert.equal(rendered.source, 'message-catalog');
  assert.equal(Object.isFrozen(options), false);
  assert.equal(Object.isFrozen(options.facts), false);
  assert.ok(Object.isFrozen(Presentation.CATALOG['warning.growthRate']));
  assert.throws(() => { Presentation.CATALOG['warning.growthRate'].en[0] = 'changed'; }, TypeError);
  assert.throws(() => { Presentation.CATEGORY_METADATA.warning.delivery = 'changed'; }, TypeError);
});
