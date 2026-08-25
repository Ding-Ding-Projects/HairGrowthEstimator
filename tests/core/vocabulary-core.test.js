'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const MODULE_PATH = '../../app/core/vocabulary';

function loadVocabulary() {
  return require(MODULE_PATH);
}

function bytes(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Buffer.from(text, 'utf8');
}

function vocabulary(entries = { hair: 'growth' }) {
  return { schemaVersion: 1, entries };
}

test('valid UTF-8 bytes produce the exact versioned vocabulary shape', () => {
  const Vocabulary = loadVocabulary();
  const result = Vocabulary.parseVocabularyBytes(bytes(vocabulary({ hair: 'growth', trim: '' })));

  assert.equal(Vocabulary.LIMITS.maxBytes, 256 * 1024);
  assert.equal(Vocabulary.LIMITS.maxDepth, 2);
  assert.equal(Vocabulary.LIMITS.maxEntries, 4096);
  assert.equal(Vocabulary.LIMITS.maxKeyLength, 160);
  assert.equal(Vocabulary.LIMITS.maxValueLength, 1000);
  assert.deepEqual(result, vocabulary({ hair: 'growth', trim: '' }));
});

test('decoding is fatal for malformed UTF-8 and rejects oversized input before parsing', () => {
  const Vocabulary = loadVocabulary();

  assert.throws(
    () => Vocabulary.parseVocabularyBytes(Buffer.from([0xc3, 0x28])),
    (error) => error.code === 'ERR_VOCABULARY_UTF8'
  );
  assert.throws(
    () => Vocabulary.parseVocabularyBytes(Buffer.alloc(Vocabulary.LIMITS.maxBytes + 1, 0x20)),
    (error) => error.code === 'ERR_VOCABULARY_TOO_LARGE'
  );
});

test('the root accepts only schemaVersion and entries with supported version 1', () => {
  const Vocabulary = loadVocabulary();

  assert.throws(
    () => Vocabulary.parseVocabularyBytes(bytes({ ...vocabulary(), note: 'extra' })),
    (error) => error.code === 'ERR_VOCABULARY_UNKNOWN_FIELD'
  );
  assert.throws(
    () => Vocabulary.parseVocabularyBytes(bytes({ schemaVersion: 1 })),
    (error) => error.code === 'ERR_VOCABULARY_SCHEMA'
  );
  assert.throws(
    () => Vocabulary.parseVocabularyBytes(bytes({ schemaVersion: 2, entries: {} })),
    (error) => error.code === 'ERR_VOCABULARY_VERSION'
  );
  assert.throws(
    () => Vocabulary.parseVocabularyBytes(bytes({ schemaVersion: 1, replacements: {} })),
    (error) => error.code === 'ERR_VOCABULARY_UNKNOWN_FIELD'
  );
  assert.throws(
    () => Vocabulary.parseVocabularyBytes(bytes([])),
    (error) => error.code === 'ERR_VOCABULARY_SCHEMA'
  );
});

test('duplicate root and entry keys are rejected before full object parsing', () => {
  const Vocabulary = loadVocabulary();
  const duplicateRoot = String.raw`{"schemaVersion":1,"\u0073chemaVersion":1,"entries":{}}`;
  const duplicateEntry = String.raw`{"schemaVersion":1,"entries":{"hair":"growth","ha\u0069r":"length"}}`;

  assert.throws(
    () => Vocabulary.parseVocabularyBytes(bytes(duplicateRoot)),
    (error) => error.code === 'ERR_VOCABULARY_DUPLICATE_KEY'
  );
  assert.throws(
    () => Vocabulary.parseVocabularyBytes(bytes(duplicateEntry)),
    (error) => error.code === 'ERR_VOCABULARY_DUPLICATE_KEY'
  );
});

test('maximum nesting depth is two and entry values are strings only', () => {
  const Vocabulary = loadVocabulary();

  assert.throws(
    () => Vocabulary.parseVocabularyBytes(bytes({ schemaVersion: 1, entries: { hair: { nested: 'growth' } } })),
    (error) => error.code === 'ERR_VOCABULARY_DEPTH'
  );
  for (const value of [1, true, null]) {
    assert.throws(
      () => Vocabulary.parseVocabularyBytes(bytes({ schemaVersion: 1, entries: { hair: value } })),
      (error) => error.code === 'ERR_VOCABULARY_ENTRY_VALUE'
    );
  }
  assert.throws(
    () => Vocabulary.parseVocabularyBytes(bytes({ schemaVersion: 1, entries: [] })),
    (error) => error.code === 'ERR_VOCABULARY_ENTRIES'
  );
});

test('entry count and key and value lengths enforce their exact inclusive bounds', () => {
  const Vocabulary = loadVocabulary();
  const atBounds = vocabulary({ ['k'.repeat(160)]: 'v'.repeat(1000), empty: '' });
  assert.deepEqual(Vocabulary.parseVocabularyBytes(bytes(atBounds)), atBounds);

  const tooMany = Object.fromEntries(Array.from({ length: 4097 }, (_, index) => [`k${index}`, 'v']));
  assert.throws(
    () => Vocabulary.parseVocabularyBytes(bytes(vocabulary(tooMany))),
    (error) => error.code === 'ERR_VOCABULARY_ENTRY_COUNT'
  );
  for (const key of ['', 'k'.repeat(161)]) {
    assert.throws(
      () => Vocabulary.parseVocabularyBytes(bytes(vocabulary({ [key]: 'value' }))),
      (error) => error.code === 'ERR_VOCABULARY_KEY_LENGTH'
    );
  }
  assert.throws(
    () => Vocabulary.parseVocabularyBytes(bytes(vocabulary({ hair: 'v'.repeat(1001) }))),
    (error) => error.code === 'ERR_VOCABULARY_VALUE_LENGTH'
  );
});

test('unsafe entry keys are rejected without prototype side effects', () => {
  const Vocabulary = loadVocabulary();

  for (const key of ['__proto__', 'prototype', 'constructor']) {
    const raw = `{"schemaVersion":1,"entries":{${JSON.stringify(key)}:"value"}}`;
    assert.throws(
      () => Vocabulary.parseVocabularyBytes(bytes(raw)),
      (error) => error.code === 'ERR_VOCABULARY_UNSAFE_KEY'
    );
  }
  assert.equal(Object.prototype.value, undefined);
});

test('serialized caches receive complete validation every time they are loaded', () => {
  const Vocabulary = loadVocabulary();
  const source = vocabulary({ hair: 'growth', fringe: 'bangs' });
  const cache = Vocabulary.serializeVocabularyCache(source);

  assert.equal(typeof cache, 'string');
  assert.deepEqual(Vocabulary.revalidateVocabularyCache(cache), source);
  assert.throws(
    () => Vocabulary.revalidateVocabularyCache('{"schemaVersion":2,"entries":{}}'),
    (error) => error.code === 'ERR_VOCABULARY_VERSION'
  );
  assert.throws(
    () => Vocabulary.revalidateVocabularyCache(String.raw`{"schemaVersion":1,"entries":{"hair":"a","ha\u0069r":"b"}}`),
    (error) => error.code === 'ERR_VOCABULARY_DUPLICATE_KEY'
  );
});

test('a rejected candidate preserves only a completely valid last cache', () => {
  const Vocabulary = loadVocabulary();
  const previous = vocabulary({ hair: 'growth' });
  const previousCache = Vocabulary.serializeVocabularyCache(previous);
  const rejected = Vocabulary.acceptVocabularyCandidate(
    previousCache,
    bytes({ schemaVersion: 2, entries: { hair: 'length' } })
  );

  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.loaded, true);
  assert.equal(rejected.preservedLastValid, true);
  assert.deepEqual(rejected.document, previous);
  assert.equal(rejected.cache, previousCache);
  assert.equal(rejected.error.code, 'ERR_VOCABULARY_VERSION');

  const noValidFallback = Vocabulary.acceptVocabularyCandidate(
    '{"schemaVersion":2,"entries":{}}',
    bytes({ schemaVersion: 1, entries: { hair: 3 } })
  );
  assert.equal(noValidFallback.loaded, false);
  assert.equal(noValidFallback.preservedLastValid, false);
  assert.equal(noValidFallback.document, null);
  assert.equal(noValidFallback.cache, null);
});

test('a valid candidate replaces the prior cache and clear restores original wording state', () => {
  const Vocabulary = loadVocabulary();
  const accepted = Vocabulary.acceptVocabularyCandidate(
    Vocabulary.serializeVocabularyCache(vocabulary({ hair: 'growth' })),
    bytes(vocabulary({ hair: 'length' }))
  );

  assert.equal(accepted.status, 'loaded');
  assert.equal(accepted.loaded, true);
  assert.equal(accepted.preservedLastValid, false);
  assert.deepEqual(accepted.document, vocabulary({ hair: 'length' }));
  assert.deepEqual(Vocabulary.revalidateVocabularyCache(accepted.cache), accepted.document);

  assert.deepEqual(Vocabulary.clearVocabulary(), {
    status: 'empty',
    loaded: false,
    document: null,
    cache: null,
    preservedLastValid: false,
    error: null
  });
});

test('replacement is limited to owned visible and accessibility text boundaries', () => {
  const Vocabulary = loadVocabulary();
  const document = Vocabulary.parseVocabularyBytes(bytes(vocabulary({ hair: 'growth' })));
  const B = Vocabulary.TEXT_BOUNDARIES;

  assert.equal(Vocabulary.applyVocabularyToText('hair', document, B.OWNED_VISIBLE), 'growth');
  assert.equal(Vocabulary.applyVocabularyToText('hair', document, B.OWNED_ACCESSIBILITY), 'growth');
  for (const boundary of [B.COMMAND, B.URL, B.PATH, B.IDENTIFIER, B.TECHNICAL_FACT, B.PROVIDER_AUTHORED]) {
    assert.equal(Vocabulary.applyVocabularyToText('hair', document, boundary), 'hair');
  }
  assert.equal(Vocabulary.applyVocabularyToText('hair', document, 'unclassified'), 'hair');
  assert.equal(Vocabulary.applyVocabularyToText('hair', null, B.OWNED_VISIBLE), 'hair');
});

test('segmented replacement preserves protected material and never mutates caller data', () => {
  const Vocabulary = loadVocabulary();
  const document = Vocabulary.parseVocabularyBytes(bytes(vocabulary({ hair: 'growth' })));
  const B = Vocabulary.TEXT_BOUNDARIES;
  const segments = [
    { text: 'hair', boundary: B.OWNED_VISIBLE },
    { text: ' curl --hair', boundary: B.COMMAND },
    { text: ' https://example.test/hair', boundary: B.URL },
    { text: ' C:\\records\\hair.json', boundary: B.PATH },
    { text: ' hairLengthCm', boundary: B.IDENTIFIER },
    { text: ' 2.54 cm per inch', boundary: B.TECHNICAL_FACT },
    { text: ' provider says hair', boundary: B.PROVIDER_AUTHORED }
  ];
  const before = structuredClone(segments);
  const rendered = Vocabulary.applyVocabularyToSegments(segments, document);

  assert.deepEqual(segments, before);
  assert.deepEqual(rendered.map((segment) => segment.text), [
    'growth',
    ' curl --hair',
    ' https://example.test/hair',
    ' C:\\records\\hair.json',
    ' hairLengthCm',
    ' 2.54 cm per inch',
    ' provider says hair'
  ]);
});

test('literal replacement prefers the longest key and does not cascade values', () => {
  const Vocabulary = loadVocabulary();
  const B = Vocabulary.TEXT_BOUNDARIES;
  const document = Vocabulary.parseVocabularyBytes(bytes(vocabulary({
    'hair growth': 'strand',
    hair: 'growth',
    growth: 'length',
    '[cm]': '$1'
  })));

  assert.equal(
    Vocabulary.applyVocabularyToText('hair growth, hair, growth, [cm]', document, B.OWNED_VISIBLE),
    'strand, growth, length, $1'
  );
});

test('parsing, cache handling, clearing, and rendering make no network request', () => {
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Network access is not allowed in vocabulary handling.');
  };

  try {
    delete require.cache[require.resolve(MODULE_PATH)];
    const Vocabulary = loadVocabulary();
    const document = Vocabulary.parseVocabularyBytes(bytes(vocabulary()));
    const cache = Vocabulary.serializeVocabularyCache(document);
    Vocabulary.revalidateVocabularyCache(cache);
    Vocabulary.acceptVocabularyCandidate(cache, bytes(vocabulary({ hair: 'length' })));
    Vocabulary.applyVocabularyToText('hair', document, Vocabulary.TEXT_BOUNDARIES.OWNED_VISIBLE);
    Vocabulary.clearVocabulary();
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('integration aliases accept buffers and explicit entry maps', () => {
  const Vocabulary = loadVocabulary();
  const B = Vocabulary.TEXT_BOUNDARIES;
  const document = Vocabulary.parseVocabularyBuffer(bytes(vocabulary({ hair: 'growth' })));

  assert.deepEqual(document, vocabulary({ hair: 'growth' }));
  assert.equal(Vocabulary.applyVocabulary('hair', document.entries, B.OWNED_VISIBLE), 'growth');
  assert.equal(Vocabulary.applyVocabulary('hair', document.entries, B.COMMAND), 'hair');
  assert.equal(Vocabulary.applyVocabulary('hair', null, B.OWNED_VISIBLE), 'hair');
});

test('VocabularyStore revalidates, preserves the last valid value, and clears without leaking cache data', () => {
  const Vocabulary = loadVocabulary();
  const initial = vocabulary({ hair: 'growth' });
  const store = new Vocabulary.VocabularyStore(Vocabulary.serializeVocabularyCache(initial));

  assert.deepEqual(store.read(), {
    status: 'loaded',
    loaded: true,
    entries: { hair: 'growth' },
    preservedLastValid: false,
    error: null
  });

  assert.deepEqual(store.replace(bytes(vocabulary({ hair: 'length' }))), {
    status: 'loaded',
    loaded: true,
    entries: { hair: 'length' },
    preservedLastValid: false,
    error: null
  });

  const rejected = store.replace(bytes({ schemaVersion: 2, entries: { hair: 'secret candidate' } }));
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.loaded, true);
  assert.deepEqual(rejected.entries, { hair: 'length' });
  assert.equal(rejected.preservedLastValid, true);
  assert.equal(rejected.error.code, 'ERR_VOCABULARY_VERSION');
  assert.equal(Object.hasOwn(rejected, 'cache'), false);
  assert.equal(Object.hasOwn(rejected, 'document'), false);
  assert.equal(JSON.stringify(rejected).includes('secret candidate'), false);

  assert.deepEqual(store.clear(), {
    status: 'empty',
    loaded: false,
    entries: {},
    preservedLastValid: false,
    error: null
  });

  const corrupt = new Vocabulary.VocabularyStore('{"schemaVersion":2,"entries":{}}');
  const corruptRead = corrupt.read();
  assert.equal(corruptRead.status, 'invalid');
  assert.equal(corruptRead.loaded, false);
  assert.deepEqual(corruptRead.entries, {});
  assert.equal(corruptRead.error.code, 'ERR_VOCABULARY_VERSION');
  assert.equal(JSON.stringify(corruptRead).includes('schemaVersion'), false);
});

test('malformed JSON variants share one stable privacy-safe error', () => {
  const Vocabulary = loadVocabulary();
  const malformed = [
    Buffer.alloc(0),
    bytes('   \r\n\t'),
    bytes('{"schemaVersion":1,"entries":{'),
    bytes('{"schemaVersion":1,"entries":{/* comment */}}'),
    bytes('{"schemaVersion":1,"entries":{},}'),
    bytes('{"schemaVersion":1,"entries":{}} trailing')
  ];

  for (const input of malformed) {
    assert.throws(
      () => Vocabulary.parseVocabularyBuffer(input),
      (error) => error.code === 'ERR_VOCABULARY_JSON'
        && error.message === 'Vocabulary JSON is malformed.'
        && !error.message.includes('private sentinel')
    );
  }
});

test('byte views, a UTF-8 BOM, and the exact byte ceiling are accepted without coercing other inputs', () => {
  const Vocabulary = loadVocabulary();
  const source = bytes(vocabulary({ hair: 'growth' }));

  assert.deepEqual(Vocabulary.parseVocabularyBuffer(source), vocabulary({ hair: 'growth' }));
  assert.deepEqual(
    Vocabulary.parseVocabularyBuffer(new Uint8Array(source)),
    vocabulary({ hair: 'growth' })
  );
  assert.deepEqual(
    Vocabulary.parseVocabularyBuffer(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), source])),
    vocabulary({ hair: 'growth' })
  );

  const exactLimit = Buffer.concat([
    source,
    Buffer.alloc(Vocabulary.LIMITS.maxBytes - source.byteLength, 0x20)
  ]);
  assert.equal(exactLimit.byteLength, Vocabulary.LIMITS.maxBytes);
  assert.deepEqual(Vocabulary.parseVocabularyBuffer(exactLimit), vocabulary({ hair: 'growth' }));

  for (const input of ['{}', {}, null, undefined]) {
    assert.throws(
      () => Vocabulary.parseVocabularyBuffer(input),
      (error) => error.code === 'ERR_VOCABULARY_INPUT'
    );
  }
});

test('duplicate detection stays inside each object and ignores structural text inside values', () => {
  const Vocabulary = loadVocabulary();
  const raw = String.raw`{"entries":{"entries":"value text with \"entries\":{}, commas, and braces {}","hair":"growth"},"schemaVersion":1}`;
  const parsed = Vocabulary.parseVocabularyBuffer(bytes(raw));

  assert.deepEqual(parsed, vocabulary({
    entries: 'value text with "entries":{}, commas, and braces {}',
    hair: 'growth'
  }));
  assert.throws(
    () => Vocabulary.parseVocabularyBuffer(bytes(String.raw`{"schemaVersion":1,"entries":{"\u005f_proto__":"value"}}`)),
    (error) => error.code === 'ERR_VOCABULARY_UNSAFE_KEY'
  );
});

test('exact entry and Unicode code-point bounds remain inclusive', () => {
  const Vocabulary = loadVocabulary();
  const entries = Object.fromEntries(
    Array.from({ length: Vocabulary.LIMITS.maxEntries }, (_, index) => [`k${index}`, 'v'])
  );
  assert.equal(Vocabulary.parseVocabularyBuffer(bytes(vocabulary(entries))).entries.k4095, 'v');

  const exactKey = '🦰'.repeat(Vocabulary.LIMITS.maxKeyLength);
  const exactValue = '🦱'.repeat(Vocabulary.LIMITS.maxValueLength);
  assert.deepEqual(
    Vocabulary.parseVocabularyBuffer(bytes(vocabulary({ [exactKey]: exactValue }))),
    vocabulary({ [exactKey]: exactValue })
  );
  assert.throws(
    () => Vocabulary.parseVocabularyBuffer(bytes(vocabulary({ [`${exactKey}🦰`]: 'value' }))),
    (error) => error.code === 'ERR_VOCABULARY_KEY_LENGTH'
  );
});

test('candidate selection ignores a corrupt prior cache and preserves a valid prior cache exactly', () => {
  const Vocabulary = loadVocabulary();
  const validCandidate = Vocabulary.acceptVocabularyCandidate(
    '{"schemaVersion":2,"entries":{}}',
    bytes(vocabulary({ hair: 'length' }))
  );
  assert.equal(validCandidate.status, 'loaded');
  assert.deepEqual(validCandidate.document, vocabulary({ hair: 'length' }));

  const priorWithWhitespace = '{\n  "schemaVersion": 1,\n  "entries": { "hair": "growth" }\n}\n';
  const rejected = Vocabulary.acceptVocabularyCandidate(
    priorWithWhitespace,
    bytes({ schemaVersion: 1, entries: { hair: 7 } })
  );
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.cache, priorWithWhitespace);
  assert.deepEqual(rejected.document, vocabulary({ hair: 'growth' }));
});

test('clear records are fresh, frozen, and cannot resurrect a cleared cache', () => {
  const Vocabulary = loadVocabulary();
  const first = Vocabulary.clearVocabulary();
  const second = Vocabulary.clearVocabulary();

  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.throws(() => {
    first.cache = Vocabulary.serializeVocabularyCache(vocabulary({ hair: 'growth' }));
  }, TypeError);

  const rejected = Vocabulary.acceptVocabularyCandidate(
    first.cache,
    bytes({ schemaVersion: 2, entries: { hair: 'length' } })
  );
  assert.equal(rejected.loaded, false);
  assert.equal(rejected.document, null);
  assert.equal(rejected.cache, null);
});

test('validated documents resist mutation and phrase matches never cross segment boundaries', () => {
  const Vocabulary = loadVocabulary();
  const B = Vocabulary.TEXT_BOUNDARIES;
  const document = Vocabulary.parseVocabularyBuffer(bytes(vocabulary({ 'hair growth': 'length' })));

  assert.equal(Object.isFrozen(document), true);
  assert.equal(Object.isFrozen(document.entries), true);
  assert.throws(() => {
    document.entries['hair growth'] = 'changed';
  }, TypeError);

  const segments = [
    { id: 1, text: 'hair ', boundary: B.OWNED_VISIBLE },
    { id: 2, text: 'growth', boundary: B.OWNED_VISIBLE },
    { id: 3, text: 'hair growth', boundary: B.PROVIDER_AUTHORED }
  ];
  const rendered = Vocabulary.applyVocabularyToSegments(segments, document);
  assert.deepEqual(rendered, segments);
  assert.notEqual(rendered, segments);
  assert.notEqual(rendered[0], segments[0]);
});
