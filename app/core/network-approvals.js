'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicWriteJson } = require('./atomic');
const { canonicalScheduledSourceScope, classifyIpAddress } = require('./network-policy');

const NETWORK_APPROVAL_SCHEMA_VERSION = 1;
const MAX_NETWORK_APPROVALS = 64;
const MAX_NETWORK_APPROVAL_ADDRESSES = 16;
const MAX_NETWORK_APPROVAL_FILE_BYTES = 64 * 1024;
const MAX_SOURCE_SCOPE_LENGTH = 2048;
const MAX_ORIGIN_LENGTH = 2048;
const MAX_ADDRESS_LENGTH = 64;
const MAX_FILE_PATH_LENGTH = 4096;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function approvalError(ErrorType, code, message) {
  const error = new ErrorType(message);
  error.code = code;
  return error;
}

function requirePlainObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw approvalError(TypeError, code, message);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw approvalError(TypeError, code, message);
  }
  return value;
}

function requireExactFields(value, allowed, required, code, message) {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || UNSAFE_KEYS.has(key) || !allowed.has(key)) {
      throw approvalError(TypeError, code, message);
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw approvalError(TypeError, code, message);
    }
  }
}

function boundedString(value, maximum, code, message) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw approvalError(TypeError, code, message);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sourceFromCanonicalScope(value) {
  const canonicalSourceScope = boundedString(
    value,
    MAX_SOURCE_SCOPE_LENGTH,
    'ERR_NETWORK_APPROVAL_SCOPE',
    'The approval must bind one bounded canonical scheduled source scope.'
  );
  let source;
  if (canonicalSourceScope.startsWith('api:')) {
    source = { type: 'api', url: canonicalSourceScope.slice(4) };
  } else if (canonicalSourceScope.startsWith('home-assistant:')) {
    const segments = canonicalSourceScope.slice('home-assistant:'.length).split('|');
    if (segments.length !== 3) {
      throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_SCOPE', 'The Home Assistant approval scope is not canonical.');
    }
    source = {
      type: 'home-assistant',
      baseUrl: segments[0],
      entityId: segments[1],
      credentialRef: segments[2]
    };
  } else {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_SCOPE', 'The approval scope type is not supported.');
  }

  let normalized;
  try {
    normalized = canonicalScheduledSourceScope(source);
  } catch {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_SCOPE', 'The approval must bind one canonical scheduled source scope.');
  }
  if (normalized !== canonicalSourceScope) {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_SCOPE', 'The approval source scope is not canonical.');
  }
  const sourceUrl = source.type === 'api' ? source.url : source.baseUrl;
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== 'https:') {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_SCOPE', 'Private LAN approval scopes must use HTTPS.');
  }
  return { canonicalSourceScope, expectedOrigin: parsed.origin };
}

function normalizeOrigin(value) {
  const supplied = boundedString(
    value,
    MAX_ORIGIN_LENGTH,
    'ERR_NETWORK_APPROVAL_ORIGIN',
    'The approval must name one exact canonical HTTPS origin.'
  );
  let parsed;
  try {
    parsed = new URL(supplied);
  } catch {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_ORIGIN', 'The approval must name one exact canonical HTTPS origin.');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.origin !== supplied ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_ORIGIN', 'The approval must name one exact canonical HTTPS origin.');
  }
  return parsed.origin;
}

function normalizeAddresses(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_NETWORK_APPROVAL_ADDRESSES) {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_ADDRESSES', 'The approval requires one bounded complete address set.');
  }
  const seen = new Set();
  const addresses = value.map((entry) => {
    const address = boundedString(
      entry,
      MAX_ADDRESS_LENGTH,
      'ERR_NETWORK_APPROVAL_ADDRESS',
      'Every approved address must be a canonical private IP address.'
    );
    let classified;
    try {
      classified = classifyIpAddress(address);
    } catch {
      throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_ADDRESS', 'Every approved address must be a canonical private IP address.');
    }
    if (classified.address !== address || classified.category !== 'private') {
      throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_ADDRESS', 'Every approved address must be a canonical private IP address.');
    }
    const identity = `${classified.family}:${classified.address}`;
    if (seen.has(identity)) {
      throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_ADDRESSES', 'Approved addresses must not contain duplicates.');
    }
    seen.add(identity);
    return classified.address;
  });
  addresses.sort((left, right) => left.localeCompare(right, 'en'));
  return Object.freeze(addresses);
}

function normalizeIdentity(input, options = {}) {
  const value = requirePlainObject(
    input,
    'ERR_NETWORK_APPROVAL',
    'A bounded network approval identity is required.'
  );
  requireExactFields(
    value,
    new Set(['canonicalSourceScope', 'origin', 'addresses']),
    ['canonicalSourceScope', 'origin', 'addresses'],
    'ERR_NETWORK_APPROVAL_FIELDS',
    'The network approval contains unsupported or missing fields.'
  );
  const source = sourceFromCanonicalScope(value.canonicalSourceScope);
  const origin = normalizeOrigin(value.origin);
  if (options.requireSourceBinding !== false && origin !== source.expectedOrigin) {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_ORIGIN_MISMATCH', 'The approval origin does not match its scheduled source scope.');
  }
  return deepFreeze({
    canonicalSourceScope: source.canonicalSourceScope,
    origin,
    addresses: normalizeAddresses(value.addresses)
  });
}

function normalizeId(value) {
  if (typeof value !== 'string' || !UUID_V4_PATTERN.test(value)) {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_ID', 'The stored approval identifier is invalid.');
  }
  return value;
}

function normalizeApprovedAt(value) {
  if (typeof value !== 'string' || value.length > 32) {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_TIME', 'The stored approval timestamp is invalid.');
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.valueOf()) || instant.toISOString() !== value) {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_TIME', 'The stored approval timestamp is invalid.');
  }
  return value;
}

function validateStoredApproval(input) {
  const value = requirePlainObject(
    input,
    'ERR_NETWORK_APPROVAL_RECORD',
    'Every stored approval must be one bounded record.'
  );
  requireExactFields(
    value,
    new Set(['id', 'canonicalSourceScope', 'origin', 'addresses', 'approvedAt']),
    ['id', 'canonicalSourceScope', 'origin', 'addresses', 'approvedAt'],
    'ERR_NETWORK_APPROVAL_RECORD_FIELDS',
    'A stored approval contains unsupported or missing fields.'
  );
  const identity = normalizeIdentity({
    canonicalSourceScope: value.canonicalSourceScope,
    origin: value.origin,
    addresses: value.addresses
  });
  return deepFreeze({
    id: normalizeId(value.id),
    ...identity,
    approvedAt: normalizeApprovedAt(value.approvedAt)
  });
}

function validateNetworkApprovalDocument(input) {
  const value = requirePlainObject(
    input,
    'ERR_NETWORK_APPROVAL_DOCUMENT',
    'The network approval document is invalid.'
  );
  requireExactFields(
    value,
    new Set(['schemaVersion', 'approvals']),
    ['schemaVersion', 'approvals'],
    'ERR_NETWORK_APPROVAL_DOCUMENT_FIELDS',
    'The network approval document contains unsupported or missing fields.'
  );
  if (value.schemaVersion !== NETWORK_APPROVAL_SCHEMA_VERSION) {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_VERSION', 'The network approval schema version is unsupported.');
  }
  if (!Array.isArray(value.approvals) || value.approvals.length > MAX_NETWORK_APPROVALS) {
    throw approvalError(RangeError, 'ERR_NETWORK_APPROVAL_LIMIT', 'The network approval count exceeds the fixed limit.');
  }
  const ids = new Set();
  const scopes = new Set();
  const approvals = value.approvals.map((record) => {
    const normalized = validateStoredApproval(record);
    if (ids.has(normalized.id) || scopes.has(normalized.canonicalSourceScope)) {
      throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_DUPLICATE', 'Stored approvals must have unique identifiers and source scopes.');
    }
    ids.add(normalized.id);
    scopes.add(normalized.canonicalSourceScope);
    return normalized;
  });
  return deepFreeze({ schemaVersion: NETWORK_APPROVAL_SCHEMA_VERSION, approvals });
}

function emptyDocument() {
  return deepFreeze({ schemaVersion: NETWORK_APPROVAL_SCHEMA_VERSION, approvals: [] });
}

function sameAddressSet(left, right) {
  return left.length === right.length && left.every((address, index) => address === right[index]);
}

function sameIdentity(record, identity) {
  return record.origin === identity.origin && sameAddressSet(record.addresses, identity.addresses);
}

function createNetworkApprovalStore(options = {}) {
  if (process.type === 'renderer') {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_PROCESS', 'The network approval store is available only in the main process.');
  }
  const configuration = requirePlainObject(
    options,
    'ERR_NETWORK_APPROVAL_OPTIONS',
    'Network approval store options are required.'
  );
  requireExactFields(
    configuration,
    new Set(['filePath', 'readFile', 'writeJson', 'now', 'randomUUID']),
    ['filePath'],
    'ERR_NETWORK_APPROVAL_OPTIONS_FIELDS',
    'Network approval store options contain unsupported or missing fields.'
  );
  const configuredPath = boundedString(
    configuration.filePath,
    MAX_FILE_PATH_LENGTH,
    'ERR_NETWORK_APPROVAL_PATH',
    'The network approval file path is invalid.'
  );
  const filePath = path.resolve(configuredPath);
  const readFile = configuration.readFile || fs.readFile;
  const writeJson = configuration.writeJson || atomicWriteJson;
  const now = configuration.now || (() => new Date().toISOString());
  const randomUUID = configuration.randomUUID || (() => crypto.randomUUID());
  if (![readFile, writeJson, now, randomUUID].every((candidate) => typeof candidate === 'function')) {
    throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_OPTIONS', 'Network approval store adapters must be functions.');
  }

  let operationTail = Promise.resolve();
  function serialize(operation) {
    const result = operationTail.catch(() => {}).then(operation);
    operationTail = result.catch(() => {});
    return result;
  }

  async function readDocument() {
    let raw;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyDocument();
      throw error;
    }
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_NETWORK_APPROVAL_FILE_BYTES) {
      throw approvalError(RangeError, 'ERR_NETWORK_APPROVAL_FILE_SIZE', 'The network approval file exceeds its fixed size limit.');
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw approvalError(SyntaxError, 'ERR_NETWORK_APPROVAL_JSON', 'The network approval file is not valid JSON.');
    }
    return validateNetworkApprovalDocument(parsed);
  }

  async function writeDocument(document) {
    const validated = validateNetworkApprovalDocument(document);
    await writeJson(filePath, validated, { maxBytes: MAX_NETWORK_APPROVAL_FILE_BYTES });
    return validated;
  }

  function findExact(document, input) {
    const identity = normalizeIdentity(input, { requireSourceBinding: false });
    const record = document.approvals.find((candidate) => candidate.canonicalSourceScope === identity.canonicalSourceScope);
    if (!record) return { identity, record: null };
    if (!sameIdentity(record, identity)) {
      throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_LOOKUP_MISMATCH', 'The approval lookup does not match the stored origin and complete address set.');
    }
    return { identity, record };
  }

  const store = {
    read() {
      return serialize(() => readDocument());
    },
    get(input) {
      return serialize(async () => {
        const document = await readDocument();
        return findExact(document, input).record;
      });
    },
    set(input) {
      return serialize(async () => {
        const identity = normalizeIdentity(input);
        const document = await readDocument();
        const existing = document.approvals.find((record) => record.canonicalSourceScope === identity.canonicalSourceScope);
        if (existing) {
          if (!sameIdentity(existing, identity)) {
            throw approvalError(TypeError, 'ERR_NETWORK_APPROVAL_LOOKUP_MISMATCH', 'A stored approval already binds this source scope to another exact network identity.');
          }
          return existing;
        }
        if (document.approvals.length >= MAX_NETWORK_APPROVALS) {
          throw approvalError(RangeError, 'ERR_NETWORK_APPROVAL_LIMIT', 'The network approval count exceeds the fixed limit.');
        }
        const record = validateStoredApproval({
          id: normalizeId(randomUUID()),
          ...identity,
          approvedAt: normalizeApprovedAt(now())
        });
        const written = await writeDocument({
          schemaVersion: NETWORK_APPROVAL_SCHEMA_VERSION,
          approvals: [...document.approvals, record]
        });
        return written.approvals.find((candidate) => candidate.id === record.id);
      });
    },
    remove(input) {
      return serialize(async () => {
        const document = await readDocument();
        const { record } = findExact(document, input);
        if (!record) return null;
        await writeDocument({
          schemaVersion: NETWORK_APPROVAL_SCHEMA_VERSION,
          approvals: document.approvals.filter((candidate) => candidate.id !== record.id)
        });
        return record;
      });
    }
  };
  return Object.freeze(store);
}

module.exports = {
  NETWORK_APPROVAL_SCHEMA_VERSION,
  MAX_NETWORK_APPROVALS,
  MAX_NETWORK_APPROVAL_ADDRESSES,
  validateNetworkApprovalDocument,
  createNetworkApprovalStore
};
