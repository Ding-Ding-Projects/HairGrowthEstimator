'use strict';

const { TextDecoder, TextEncoder } = require('node:util');

const LIMITS = Object.freeze({
  maxBytes: 256 * 1024,
  maxDepth: 2,
  maxEntries: 4096,
  maxKeyLength: 160,
  maxValueLength: 1000
});

const TEXT_BOUNDARIES = Object.freeze({
  OWNED_VISIBLE: 'owned-visible-text',
  OWNED_ACCESSIBILITY: 'owned-accessibility-text',
  COMMAND: 'command',
  URL: 'url',
  PATH: 'path',
  IDENTIFIER: 'identifier',
  TECHNICAL_FACT: 'technical-fact',
  PROVIDER_AUTHORED: 'provider-authored'
});

const SCHEMA_VERSION = 1;
const ROOT_FIELDS = new Set(['schemaVersion', 'entries']);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const REPLACEABLE_BOUNDARIES = new Set([
  TEXT_BOUNDARIES.OWNED_VISIBLE,
  TEXT_BOUNDARIES.OWNED_ACCESSIBILITY
]);
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const UTF8_ENCODER = new TextEncoder();

function vocabularyError(code, message) {
  const error = new Error(message);
  error.name = 'VocabularyError';
  error.code = code;
  return error;
}

function toByteView(input) {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  throw vocabularyError(
    'ERR_VOCABULARY_INPUT',
    'Vocabulary input must be a byte buffer.'
  );
}

function decodeVocabularyBytes(input) {
  const bytes = toByteView(input);
  if (bytes.byteLength > LIMITS.maxBytes) {
    throw vocabularyError(
      'ERR_VOCABULARY_TOO_LARGE',
      'Vocabulary input exceeds the allowed byte limit.'
    );
  }

  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    throw vocabularyError(
      'ERR_VOCABULARY_UTF8',
      'Vocabulary input is not valid UTF-8.'
    );
  }
}

class JsonStructureScanner {
  constructor(text) {
    this.text = text;
    this.index = 0;
  }

  scan() {
    this.skipWhitespace();
    if (this.index >= this.text.length) {
      this.failSyntax();
    }
    this.parseValue(0);
    this.skipWhitespace();
    if (this.index !== this.text.length) {
      this.failSyntax();
    }
  }

  parseValue(parentDepth) {
    const character = this.text[this.index];
    if (character === '{') {
      this.parseObject(parentDepth + 1);
      return;
    }
    if (character === '[') {
      this.parseArray(parentDepth + 1);
      return;
    }
    if (character === '"') {
      this.parseString();
      return;
    }
    if (character === '-' || this.isDigit(character)) {
      this.parseNumber();
      return;
    }
    if (this.consumeKeyword('true') || this.consumeKeyword('false') || this.consumeKeyword('null')) {
      return;
    }
    this.failSyntax();
  }

  parseObject(depth) {
    this.assertDepth(depth);
    this.index += 1;
    this.skipWhitespace();
    if (this.text[this.index] === '}') {
      this.index += 1;
      return;
    }

    const keys = new Set();
    while (this.index < this.text.length) {
      if (this.text[this.index] !== '"') {
        this.failSyntax();
      }
      const key = this.parseString();
      if (UNSAFE_KEYS.has(key)) {
        throw vocabularyError(
          'ERR_VOCABULARY_UNSAFE_KEY',
          'Vocabulary input contains a disallowed object key.'
        );
      }
      if (keys.has(key)) {
        throw vocabularyError(
          'ERR_VOCABULARY_DUPLICATE_KEY',
          'Vocabulary input contains a duplicate object key.'
        );
      }
      keys.add(key);

      this.skipWhitespace();
      if (this.text[this.index] !== ':') {
        this.failSyntax();
      }
      this.index += 1;
      this.skipWhitespace();
      this.parseValue(depth);
      this.skipWhitespace();

      const separator = this.text[this.index];
      if (separator === '}') {
        this.index += 1;
        return;
      }
      if (separator !== ',') {
        this.failSyntax();
      }
      this.index += 1;
      this.skipWhitespace();
    }
    this.failSyntax();
  }

  parseArray(depth) {
    this.assertDepth(depth);
    this.index += 1;
    this.skipWhitespace();
    if (this.text[this.index] === ']') {
      this.index += 1;
      return;
    }

    while (this.index < this.text.length) {
      this.parseValue(depth);
      this.skipWhitespace();
      const separator = this.text[this.index];
      if (separator === ']') {
        this.index += 1;
        return;
      }
      if (separator !== ',') {
        this.failSyntax();
      }
      this.index += 1;
      this.skipWhitespace();
    }
    this.failSyntax();
  }

  parseString() {
    const start = this.index;
    this.index += 1;

    while (this.index < this.text.length) {
      const character = this.text[this.index];
      if (character === '"') {
        this.index += 1;
        try {
          return JSON.parse(this.text.slice(start, this.index));
        } catch {
          this.failSyntax();
        }
      }

      if (character === '\\') {
        this.index += 1;
        if (this.index >= this.text.length) {
          this.failSyntax();
        }
        const escaped = this.text[this.index];
        if (escaped === 'u') {
          const hex = this.text.slice(this.index + 1, this.index + 5);
          if (hex.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
            this.failSyntax();
          }
          this.index += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(escaped)) {
          this.failSyntax();
        }
        this.index += 1;
        continue;
      }

      if (character.charCodeAt(0) <= 0x1f) {
        this.failSyntax();
      }
      this.index += 1;
    }
    this.failSyntax();
  }

  parseNumber() {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      this.text.slice(this.index)
    );
    if (!match) {
      this.failSyntax();
    }
    this.index += match[0].length;
  }

  consumeKeyword(keyword) {
    if (!this.text.startsWith(keyword, this.index)) {
      return false;
    }
    this.index += keyword.length;
    return true;
  }

  assertDepth(depth) {
    if (depth > LIMITS.maxDepth) {
      throw vocabularyError(
        'ERR_VOCABULARY_DEPTH',
        'Vocabulary input exceeds the allowed nesting depth.'
      );
    }
  }

  skipWhitespace() {
    while (this.index < this.text.length) {
      const character = this.text[this.index];
      if (character !== ' ' && character !== '\t' && character !== '\n' && character !== '\r') {
        return;
      }
      this.index += 1;
    }
  }

  isDigit(character) {
    return character >= '0' && character <= '9';
  }

  failSyntax() {
    throw vocabularyError(
      'ERR_VOCABULARY_JSON',
      'Vocabulary JSON is malformed.'
    );
  }
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getStringOwnKeys(value, code, message) {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) {
    throw vocabularyError(code, message);
  }
  return keys;
}

function readDataProperty(value, key, code, message) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    throw vocabularyError(code, message);
  }
  return descriptor.value;
}

function countCharacters(value) {
  return Array.from(value).length;
}

function assertSerializedSize(document) {
  const serialized = JSON.stringify(document);
  if (UTF8_ENCODER.encode(serialized).byteLength > LIMITS.maxBytes) {
    throw vocabularyError(
      'ERR_VOCABULARY_TOO_LARGE',
      'Vocabulary input exceeds the allowed byte limit.'
    );
  }
  return serialized;
}

function normalizeVocabularyDocument(document) {
  if (!isPlainRecord(document)) {
    throw vocabularyError(
      'ERR_VOCABULARY_SCHEMA',
      'Vocabulary input must be a versioned object with entries.'
    );
  }

  const rootKeys = getStringOwnKeys(
    document,
    'ERR_VOCABULARY_UNKNOWN_FIELD',
    'Vocabulary input contains an unknown root field.'
  );
  if (rootKeys.some((key) => !ROOT_FIELDS.has(key))) {
    throw vocabularyError(
      'ERR_VOCABULARY_UNKNOWN_FIELD',
      'Vocabulary input contains an unknown root field.'
    );
  }
  if (rootKeys.length !== ROOT_FIELDS.size || !rootKeys.includes('schemaVersion') || !rootKeys.includes('entries')) {
    throw vocabularyError(
      'ERR_VOCABULARY_SCHEMA',
      'Vocabulary input must contain schemaVersion and entries.'
    );
  }

  const schemaVersion = readDataProperty(
    document,
    'schemaVersion',
    'ERR_VOCABULARY_SCHEMA',
    'Vocabulary schemaVersion must be a data field.'
  );
  if (schemaVersion !== SCHEMA_VERSION) {
    throw vocabularyError(
      'ERR_VOCABULARY_VERSION',
      'Vocabulary schema version is unsupported.'
    );
  }

  const entries = readDataProperty(
    document,
    'entries',
    'ERR_VOCABULARY_ENTRIES',
    'Vocabulary entries must be an object.'
  );
  if (!isPlainRecord(entries)) {
    throw vocabularyError(
      'ERR_VOCABULARY_ENTRIES',
      'Vocabulary entries must be an object.'
    );
  }

  const entryKeys = getStringOwnKeys(
    entries,
    'ERR_VOCABULARY_ENTRIES',
    'Vocabulary entries must use string keys.'
  );
  if (entryKeys.length > LIMITS.maxEntries) {
    throw vocabularyError(
      'ERR_VOCABULARY_ENTRY_COUNT',
      'Vocabulary input exceeds the allowed entry count.'
    );
  }

  const normalizedEntries = {};
  for (const key of entryKeys) {
    if (UNSAFE_KEYS.has(key)) {
      throw vocabularyError(
        'ERR_VOCABULARY_UNSAFE_KEY',
        'Vocabulary input contains a disallowed entry key.'
      );
    }

    const keyLength = countCharacters(key);
    if (keyLength < 1 || keyLength > LIMITS.maxKeyLength) {
      throw vocabularyError(
        'ERR_VOCABULARY_KEY_LENGTH',
        'Vocabulary entry key length is outside the allowed range.'
      );
    }

    const replacement = readDataProperty(
      entries,
      key,
      'ERR_VOCABULARY_ENTRY_VALUE',
      'Vocabulary entry values must be strings.'
    );
    if (typeof replacement !== 'string') {
      throw vocabularyError(
        'ERR_VOCABULARY_ENTRY_VALUE',
        'Vocabulary entry values must be strings.'
      );
    }
    if (countCharacters(replacement) > LIMITS.maxValueLength) {
      throw vocabularyError(
        'ERR_VOCABULARY_VALUE_LENGTH',
        'Vocabulary entry value length exceeds the allowed range.'
      );
    }

    Object.defineProperty(normalizedEntries, key, {
      value: replacement,
      enumerable: true,
      configurable: false,
      writable: false
    });
  }

  Object.freeze(normalizedEntries);
  const normalized = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    entries: normalizedEntries
  });
  assertSerializedSize(normalized);
  return normalized;
}

function parseVocabularyBytes(input) {
  const text = decodeVocabularyBytes(input);
  new JsonStructureScanner(text).scan();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw vocabularyError(
      'ERR_VOCABULARY_JSON',
      'Vocabulary JSON is malformed.'
    );
  }
  return normalizeVocabularyDocument(parsed);
}

function parseVocabularyBuffer(buffer) {
  return parseVocabularyBytes(buffer);
}

function serializeVocabularyCache(document) {
  return assertSerializedSize(normalizeVocabularyDocument(document));
}

function revalidateVocabularyCache(cache) {
  if (typeof cache === 'string') {
    return parseVocabularyBytes(UTF8_ENCODER.encode(cache));
  }
  return parseVocabularyBytes(cache);
}

function safeErrorRecord(error) {
  const isVocabularyError = error && typeof error.code === 'string' && error.code.startsWith('ERR_VOCABULARY_');
  return Object.freeze({
    name: 'VocabularyError',
    code: isVocabularyError ? error.code : 'ERR_VOCABULARY_UNKNOWN',
    message: isVocabularyError ? error.message : 'Vocabulary processing did not complete.'
  });
}

function acceptVocabularyCandidate(lastValidCache, candidateBytes) {
  let previousDocument = null;
  let previousCache = null;

  if (lastValidCache !== null && lastValidCache !== undefined) {
    try {
      previousDocument = revalidateVocabularyCache(lastValidCache);
      previousCache = typeof lastValidCache === 'string'
        ? lastValidCache
        : serializeVocabularyCache(previousDocument);
    } catch {
      previousDocument = null;
      previousCache = null;
    }
  }

  try {
    const document = parseVocabularyBytes(candidateBytes);
    return Object.freeze({
      status: 'loaded',
      loaded: true,
      document,
      cache: serializeVocabularyCache(document),
      preservedLastValid: false,
      error: null
    });
  } catch (error) {
    return Object.freeze({
      status: 'rejected',
      loaded: previousDocument !== null,
      document: previousDocument,
      cache: previousCache,
      preservedLastValid: previousDocument !== null,
      error: safeErrorRecord(error)
    });
  }
}

function clearVocabulary() {
  return Object.freeze({
    status: 'empty',
    loaded: false,
    document: null,
    cache: null,
    preservedLastValid: false,
    error: null
  });
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyNormalizedVocabulary(text, document, boundary) {
  if (typeof text !== 'string' || !REPLACEABLE_BOUNDARIES.has(boundary)) {
    return text;
  }

  const keys = Object.keys(document.entries);
  if (keys.length === 0) {
    return text;
  }
  keys.sort((left, right) => right.length - left.length || left.localeCompare(right));
  const pattern = new RegExp(keys.map(escapeRegularExpression).join('|'), 'g');
  return text.replace(pattern, (match) => document.entries[match]);
}

function applyVocabularyToText(text, document, boundary) {
  if (typeof text !== 'string' || !REPLACEABLE_BOUNDARIES.has(boundary)) {
    return text;
  }
  try {
    return applyNormalizedVocabulary(text, normalizeVocabularyDocument(document), boundary);
  } catch {
    return text;
  }
}

function applyVocabulary(text, entries, boundary) {
  if (!isPlainRecord(entries)) {
    return text;
  }
  return applyVocabularyToText(text, { schemaVersion: SCHEMA_VERSION, entries }, boundary);
}

function applyVocabularyToSegments(segments, document) {
  if (!Array.isArray(segments)) {
    return [];
  }

  let normalized = null;
  try {
    normalized = normalizeVocabularyDocument(document);
  } catch {
    normalized = null;
  }

  return segments.map((segment) => {
    if (!isPlainRecord(segment)) {
      return segment;
    }
    const text = normalized
      ? applyNormalizedVocabulary(segment.text, normalized, segment.boundary)
      : segment.text;
    return { ...segment, text };
  });
}

function copyEntries(entries) {
  const copy = {};
  for (const [key, value] of Object.entries(entries)) {
    Object.defineProperty(copy, key, {
      value,
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  return Object.freeze(copy);
}

function storeStatus(status, loaded, entries, preservedLastValid, error) {
  return Object.freeze({
    status,
    loaded,
    entries: copyEntries(entries),
    preservedLastValid,
    error
  });
}

function cloneCacheInput(cache) {
  if (typeof cache === 'string' || cache === null || cache === undefined) {
    return cache ?? null;
  }
  const bytes = toByteView(cache);
  return Buffer.from(bytes);
}

class VocabularyStore {
  #cache;

  constructor(initialCache = null) {
    this.#cache = cloneCacheInput(initialCache);
  }

  read() {
    if (this.#cache === null) {
      return storeStatus('empty', false, {}, false, null);
    }

    try {
      const document = revalidateVocabularyCache(this.#cache);
      this.#cache = serializeVocabularyCache(document);
      return storeStatus('loaded', true, document.entries, false, null);
    } catch (error) {
      return storeStatus('invalid', false, {}, false, safeErrorRecord(error));
    }
  }

  replace(buffer) {
    const result = acceptVocabularyCandidate(this.#cache, buffer);
    if (result.status === 'loaded' || result.preservedLastValid) {
      this.#cache = result.cache;
    } else {
      this.#cache = null;
    }
    return storeStatus(
      result.status,
      result.loaded,
      result.document ? result.document.entries : {},
      result.preservedLastValid,
      result.error
    );
  }

  clear() {
    this.#cache = null;
    return storeStatus('empty', false, {}, false, null);
  }
}

module.exports = {
  LIMITS,
  TEXT_BOUNDARIES,
  VocabularyStore,
  acceptVocabularyCandidate,
  applyVocabulary,
  applyVocabularyToSegments,
  applyVocabularyToText,
  clearVocabulary,
  parseVocabularyBuffer,
  parseVocabularyBytes,
  revalidateVocabularyCache,
  serializeVocabularyCache
};
