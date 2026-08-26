'use strict';

const SCHOOL_SCHEMA_VERSION = 1;
const DEFAULT_SCHOOL_DISPLAY_NAME = 'School mode';
const SCHOOL_RECORD_MAX_BYTES = 8192;
const SCHOOL_DISPLAY_NAME_MAX_CODE_POINTS = 80;
const SCHOOL_DISPLAY_NAME_MAX_BYTES = 256;
const SCHOOL_CREDENTIAL_REF_MAX_CODE_POINTS = 160;
const SCHOOL_PREFERENCE_SNAPSHOT_MAX_BYTES = 4096;

const SCHOOL_UNLOCK_POLICIES = Object.freeze(['pin', 'password', 'passkey']);
const SCHOOL_READ_AVAILABILITIES = Object.freeze(['available', 'invalid', 'unavailable']);
const SCHOOL_DEGRADED_REASONS = Object.freeze([
  'record-invalid',
  'record-unavailable',
  'disable-verification-required',
  'record-stale',
  'revision-conflict'
]);
const SCHOOL_RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'revision',
  'enabled',
  'displayName',
  'unlock',
  'updatedAt'
]);
const SCHOOL_UNLOCK_FIELDS = Object.freeze(['policy', 'credentialRef']);
const SCHOOL_TRANSITION_FIELDS = Object.freeze(['enabled', 'displayName', 'unlock', 'updatedAt']);
const SCHOOL_AUTHORIZATION_FIELDS = Object.freeze(['verifiedCredentialRef', 'enrolledCredentialRef']);
const SCHOOL_RECONCILIATION_FIELDS = Object.freeze([
  'candidate',
  'previous',
  'availability',
  'verifiedDisable'
]);
const SCHOOL_EFFECTIVE_STATE_FIELDS = Object.freeze([
  'record',
  'effectiveEnabled',
  'status',
  'availability',
  'degraded',
  'reason',
  'publishable',
  'verifiedDisable',
  'retainedLastValid'
]);
const SCHOOL_PREFERENCE_FIELDS = Object.freeze([
  'language',
  'funnyEnglish',
  'funnyCantonese',
  'personalVocabularyEnabled',
  'dimSumCapabilitiesEnabled',
  'dimSumSurpriseEnabled',
  'dimSumCodeNamesEnabled',
  'dimSumReferencesEnabled'
]);
const SCHOOL_OPTIONAL_BOOLEAN_PREFERENCE_FIELDS = Object.freeze(SCHOOL_PREFERENCE_FIELDS.slice(3));
const LANGUAGE_MODES = new Set(['en', 'yue', 'bilingual']);

const SCHOOL_SUPPRESSED_FEATURE_IDS = Object.freeze([
  'language',
  'language.cantonese',
  'language.bilingual',
  'funny',
  'funny.english',
  'funny.cantonese',
  'vocabulary',
  'personal-vocabulary',
  'dim-sum',
  'dim-sum.capability',
  'dim-sum.control',
  'dim-sum.copy',
  'dim-sum.route',
  'dim-sum.search-result',
  'dim-sum.palette-result',
  'dim-sum.preview',
  'dim-sum.notification',
  'dim-sum.image',
  'dim-sum.dish-name',
  'dim-sum.code-name',
  'dim-sum.reference'
]);
const SCHOOL_SUPPRESSED_FEATURE_SET = new Set(SCHOOL_SUPPRESSED_FEATURE_IDS);

const OWN = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CREDENTIAL_REFERENCE = /^[a-z][a-z0-9-]{0,31}:[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/;

function fail(code, message, ErrorType = TypeError) {
  const error = new ErrorType(message);
  error.code = code;
  throw error;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('SCHOOL_INVALID_OBJECT', `${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('SCHOOL_INVALID_OBJECT', `${label} must be a plain object.`);
  }
  const symbols = Object.getOwnPropertySymbols(value);
  if (symbols.length) fail('SCHOOL_SYMBOL_FIELD', `${label} must not contain symbol fields.`);
  return value;
}

function clonePlainData(value, label = 'value', depth = 0) {
  if (depth > 8) fail('SCHOOL_MAX_DEPTH', `${label} exceeds the maximum nesting depth.`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('SCHOOL_INVALID_NUMBER', `${label} contains a non-finite number.`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => clonePlainData(item, `${label}[${index}]`, depth + 1));
  }
  assertPlainObject(value, label);
  const clone = Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (UNSAFE_OBJECT_KEYS.has(key)) fail('SCHOOL_UNSAFE_FIELD', `${label} contains an unsafe field.`);
    if (!OWN(descriptor, 'value')) fail('SCHOOL_ACCESSOR_FIELD', `${label}.${key} must not be an accessor.`);
    if (descriptor.value === undefined || ['bigint', 'function', 'symbol'].includes(typeof descriptor.value)) {
      fail('SCHOOL_INVALID_VALUE', `${label}.${key} contains a non-data value.`);
    }
    clone[key] = clonePlainData(descriptor.value, `${label}.${key}`, depth + 1);
  }
  return clone;
}

function cloneTopLevelSettings(value, label = 'School preferences') {
  assertPlainObject(value, label);
  const clone = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (UNSAFE_OBJECT_KEYS.has(key)) fail('SCHOOL_UNSAFE_FIELD', `${label} contains an unsafe field.`);
    if (!OWN(descriptor, 'value')) fail('SCHOOL_ACCESSOR_FIELD', `${label}.${key} must not be an accessor.`);
    clone[key] = descriptor.value;
  }
  return clone;
}

function assertExactFields(value, allowedFields, label) {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail('SCHOOL_UNKNOWN_FIELD', `${label} contains unknown field "${key}".`);
  }
}

function serializedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function codePointLength(value) {
  return [...value].length;
}

function normalizeSchoolDisplayName(value) {
  if (typeof value !== 'string') fail('SCHOOL_DISPLAY_NAME_TYPE', 'School display name must be a string.');
  let normalized;
  try {
    normalized = value.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').trim();
  } catch {
    fail('SCHOOL_DISPLAY_NAME_UNICODE', 'School display name must contain valid Unicode.');
  }
  if (!normalized) fail('SCHOOL_DISPLAY_NAME_EMPTY', 'School display name must not be empty.');
  for (const character of normalized) {
    const point = character.codePointAt(0);
    if (point >= 0xd800 && point <= 0xdfff) {
      fail('SCHOOL_DISPLAY_NAME_UNICODE', 'School display name must not contain an unpaired Unicode surrogate.');
    }
  }
  if (/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(normalized)) {
    fail('SCHOOL_DISPLAY_NAME_FORMAT', 'School display name must not contain control or format characters.');
  }
  if (codePointLength(normalized) > SCHOOL_DISPLAY_NAME_MAX_CODE_POINTS) {
    fail(
      'SCHOOL_DISPLAY_NAME_LENGTH',
      `School display name must contain at most ${SCHOOL_DISPLAY_NAME_MAX_CODE_POINTS} code points.`,
      RangeError
    );
  }
  if (Buffer.byteLength(normalized, 'utf8') > SCHOOL_DISPLAY_NAME_MAX_BYTES) {
    fail(
      'SCHOOL_DISPLAY_NAME_BYTES',
      `School display name must use at most ${SCHOOL_DISPLAY_NAME_MAX_BYTES} UTF-8 bytes.`,
      RangeError
    );
  }
  return normalized;
}

function normalizeCredentialRef(value, label = 'credentialRef') {
  if (typeof value !== 'string' || codePointLength(value) > SCHOOL_CREDENTIAL_REF_MAX_CODE_POINTS || !CREDENTIAL_REFERENCE.test(value)) {
    fail(
      'SCHOOL_CREDENTIAL_REFERENCE',
      `${label} must be a bounded opaque reference in namespace:value form.`
    );
  }
  return value;
}

function normalizeUnlock(value) {
  if (value === null) return null;
  const data = clonePlainData(value, 'School unlock');
  assertExactFields(data, SCHOOL_UNLOCK_FIELDS, 'School unlock');
  if (!SCHOOL_UNLOCK_POLICIES.includes(data.policy)) {
    fail('SCHOOL_UNLOCK_POLICY', `School unlock policy must be one of: ${SCHOOL_UNLOCK_POLICIES.join(', ')}.`);
  }
  return Object.freeze({
    policy: data.policy,
    credentialRef: normalizeCredentialRef(data.credentialRef, 'School unlock credentialRef')
  });
}

function normalizeTimestamp(value, label, allowNull = false) {
  if (value === null && allowNull) return null;
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) {
    fail('SCHOOL_TIMESTAMP', `${label} must be a canonical UTC ISO-8601 timestamp.`);
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime()) || instant.toISOString() !== value) {
    fail('SCHOOL_TIMESTAMP', `${label} must be a canonical UTC ISO-8601 timestamp.`);
  }
  return value;
}

function normalizeSchoolRecord(input) {
  const data = clonePlainData(input, 'School record');
  const bytes = serializedBytes(data);
  if (bytes > SCHOOL_RECORD_MAX_BYTES) {
    fail('SCHOOL_RECORD_BYTES', `School record must use at most ${SCHOOL_RECORD_MAX_BYTES} bytes.`, RangeError);
  }
  assertExactFields(data, SCHOOL_RECORD_FIELDS, 'School record');
  if (data.schemaVersion !== SCHOOL_SCHEMA_VERSION) {
    fail('SCHOOL_SCHEMA_VERSION', `Unsupported School record schema version. Expected ${SCHOOL_SCHEMA_VERSION}.`);
  }
  if (!Number.isSafeInteger(data.revision) || data.revision < 0) {
    fail('SCHOOL_REVISION', 'School record revision must be a non-negative safe integer.');
  }
  if (typeof data.enabled !== 'boolean') fail('SCHOOL_ENABLED', 'School record enabled must be a boolean.');
  const displayName = normalizeSchoolDisplayName(data.displayName);
  const unlock = normalizeUnlock(data.unlock);
  const updatedAt = normalizeTimestamp(data.updatedAt, 'School record updatedAt', true);
  if (data.enabled && !unlock) fail('SCHOOL_ENABLED_UNLOCK', 'An enabled School record requires a configured unlock reference.');
  if (data.revision > 0 && updatedAt === null) {
    fail('SCHOOL_REVISION_TIMESTAMP', 'A changed School record requires an updatedAt timestamp.');
  }
  if (data.revision === 0 && updatedAt !== null) {
    fail('SCHOOL_REVISION_TIMESTAMP', 'An unchanged School record must use a null updatedAt timestamp.');
  }
  return deepFreeze({
    schemaVersion: SCHOOL_SCHEMA_VERSION,
    revision: data.revision,
    enabled: data.enabled,
    displayName,
    unlock,
    updatedAt
  });
}

function createDefaultSchoolRecord(displayName = DEFAULT_SCHOOL_DISPLAY_NAME) {
  return normalizeSchoolRecord({
    schemaVersion: SCHOOL_SCHEMA_VERSION,
    revision: 0,
    enabled: false,
    displayName,
    unlock: null,
    updatedAt: null
  });
}

function sameUnlock(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.policy === right.policy && left.credentialRef === right.credentialRef;
}

function normalizeTransitionRequest(value) {
  if (typeof value === 'boolean') return { enabled: value };
  const data = clonePlainData(value, 'School transition');
  if (serializedBytes(data) > SCHOOL_RECORD_MAX_BYTES) {
    fail('SCHOOL_TRANSITION_BYTES', `School transition must use at most ${SCHOOL_RECORD_MAX_BYTES} bytes.`, RangeError);
  }
  assertExactFields(data, SCHOOL_TRANSITION_FIELDS, 'School transition');
  const request = {};
  if (OWN(data, 'enabled')) {
    if (typeof data.enabled !== 'boolean') fail('SCHOOL_ENABLED', 'School transition enabled must be a boolean.');
    request.enabled = data.enabled;
  }
  if (OWN(data, 'displayName')) request.displayName = normalizeSchoolDisplayName(data.displayName);
  if (OWN(data, 'unlock')) request.unlock = normalizeUnlock(data.unlock);
  if (OWN(data, 'updatedAt')) request.updatedAt = normalizeTimestamp(data.updatedAt, 'School transition updatedAt');
  return request;
}

function normalizeAuthorization(value) {
  if (value === undefined || value === null) return {};
  const data = clonePlainData(value, 'School authorization');
  assertExactFields(data, SCHOOL_AUTHORIZATION_FIELDS, 'School authorization');
  const authorization = {};
  if (OWN(data, 'verifiedCredentialRef')) {
    authorization.verifiedCredentialRef = normalizeCredentialRef(data.verifiedCredentialRef, 'verifiedCredentialRef');
  }
  if (OWN(data, 'enrolledCredentialRef')) {
    authorization.enrolledCredentialRef = normalizeCredentialRef(data.enrolledCredentialRef, 'enrolledCredentialRef');
  }
  return authorization;
}

function candidateFromRequest(current, request) {
  return {
    enabled: OWN(request, 'enabled') ? request.enabled : current.enabled,
    displayName: OWN(request, 'displayName') ? request.displayName : current.displayName,
    unlock: OWN(request, 'unlock') ? request.unlock : current.unlock
  };
}

function transitionRequiresCredential(currentRecord, desired) {
  const current = normalizeSchoolRecord(currentRecord);
  const request = normalizeTransitionRequest(desired);
  const candidate = candidateFromRequest(current, request);
  if (current.enabled && !candidate.enabled) return true;
  return Boolean(current.unlock && OWN(request, 'unlock') && !sameUnlock(current.unlock, candidate.unlock));
}

function transitionSchoolMode(currentRecord, desired, evidence) {
  const current = normalizeSchoolRecord(currentRecord);
  const request = normalizeTransitionRequest(desired);
  const authorization = normalizeAuthorization(evidence);
  const candidate = candidateFromRequest(current, request);
  const unlockChanged = !sameUnlock(current.unlock, candidate.unlock);
  const changed = candidate.enabled !== current.enabled
    || candidate.displayName !== current.displayName
    || unlockChanged;

  if (!changed) return current;
  if (candidate.enabled && !candidate.unlock) {
    fail('SCHOOL_UNLOCK_REQUIRED', 'School mode cannot be enabled until an unlock reference is enrolled.');
  }
  if (transitionRequiresCredential(current, request)
    && authorization.verifiedCredentialRef !== current.unlock?.credentialRef) {
    fail('SCHOOL_CURRENT_CREDENTIAL_REQUIRED', 'The current credential must be verified before this School mode transition.');
  }
  if (unlockChanged && candidate.unlock
    && authorization.enrolledCredentialRef !== candidate.unlock.credentialRef) {
    fail('SCHOOL_ENROLLMENT_REQUIRED', 'The new School mode unlock requires confirmed enrollment evidence.');
  }
  if (!OWN(request, 'updatedAt')) {
    fail('SCHOOL_TIMESTAMP_REQUIRED', 'A changed School mode transition requires updatedAt.');
  }
  if (current.updatedAt !== null && Date.parse(request.updatedAt) <= Date.parse(current.updatedAt)) {
    fail('SCHOOL_TIMESTAMP_ORDER', 'School transition updatedAt must be later than the current record timestamp.');
  }
  if (current.revision === Number.MAX_SAFE_INTEGER) {
    fail('SCHOOL_REVISION_EXHAUSTED', 'School record revision cannot be incremented.', RangeError);
  }
  return normalizeSchoolRecord({
    schemaVersion: SCHOOL_SCHEMA_VERSION,
    revision: current.revision + 1,
    enabled: candidate.enabled,
    displayName: candidate.displayName,
    unlock: candidate.unlock,
    updatedAt: request.updatedAt
  });
}

function suppressedFeatureIds() {
  return Object.freeze([...SCHOOL_SUPPRESSED_FEATURE_IDS]);
}

function schoolModeEnabled(value) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return true;
  return normalizeSchoolRecord(value).enabled;
}

function isSchoolFeatureSuppressed(featureId, enabled = true) {
  if (!schoolModeEnabled(enabled) || typeof featureId !== 'string') return false;
  const normalized = featureId.normalize('NFC').trim().toLowerCase();
  if (!normalized || normalized.length > 160) return false;
  if (SCHOOL_SUPPRESSED_FEATURE_SET.has(normalized)) return true;
  if (/^dim-sum(?:[.:/]|$)/.test(normalized)) return true;
  if (/^personal-vocabulary(?:[.:/]|$)/.test(normalized)) return true;
  return false;
}

function normalizeFunnyLevel(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    fail('SCHOOL_FUNNY_LEVEL', `${label} must be an integer from 1 through 5.`);
  }
  return value;
}

function normalizePreferenceSnapshot(value) {
  const data = clonePlainData(value, 'School preference snapshot');
  if (serializedBytes(data) > SCHOOL_PREFERENCE_SNAPSHOT_MAX_BYTES) {
    fail(
      'SCHOOL_PREFERENCE_BYTES',
      `School preference snapshot must use at most ${SCHOOL_PREFERENCE_SNAPSHOT_MAX_BYTES} bytes.`,
      RangeError
    );
  }
  assertExactFields(data, SCHOOL_PREFERENCE_FIELDS, 'School preference snapshot');
  if (!LANGUAGE_MODES.has(data.language)) {
    fail('SCHOOL_LANGUAGE', 'School preference language must be en, yue, or bilingual.');
  }
  const snapshot = {
    language: data.language,
    funnyEnglish: normalizeFunnyLevel(data.funnyEnglish, 'English funny level'),
    funnyCantonese: normalizeFunnyLevel(data.funnyCantonese, 'Cantonese funny level')
  };
  for (const field of SCHOOL_OPTIONAL_BOOLEAN_PREFERENCE_FIELDS) {
    if (!OWN(data, field)) continue;
    if (typeof data[field] !== 'boolean') fail('SCHOOL_PREFERENCE_BOOLEAN', `${field} must be a boolean.`);
    snapshot[field] = data[field];
  }
  return Object.freeze(snapshot);
}

function captureSchoolPreferences(settings) {
  const current = cloneTopLevelSettings(settings);
  const snapshot = {
    language: current.language,
    funnyEnglish: current.funnyEnglish,
    funnyCantonese: current.funnyCantonese
  };
  for (const field of SCHOOL_OPTIONAL_BOOLEAN_PREFERENCE_FIELDS) {
    if (OWN(current, field)) snapshot[field] = current[field];
  }
  return normalizePreferenceSnapshot(snapshot);
}

function applySchoolPreferences(settings) {
  const effective = cloneTopLevelSettings(settings);
  const snapshot = captureSchoolPreferences(effective);
  effective.language = 'en';
  effective.funnyEnglish = 1;
  effective.funnyCantonese = 1;
  for (const field of SCHOOL_OPTIONAL_BOOLEAN_PREFERENCE_FIELDS) {
    if (OWN(snapshot, field)) effective[field] = false;
  }
  return effective;
}

function restoreSchoolPreferences(settings, snapshot) {
  const restored = cloneTopLevelSettings(settings);
  const prior = normalizePreferenceSnapshot(snapshot);
  for (const field of SCHOOL_PREFERENCE_FIELDS) {
    if (OWN(prior, field)) restored[field] = prior[field];
  }
  return restored;
}

function normalizeSchoolReadAvailability(value) {
  if (!SCHOOL_READ_AVAILABILITIES.includes(value)) {
    fail(
      'SCHOOL_READ_AVAILABILITY',
      `School record availability must be one of: ${SCHOOL_READ_AVAILABILITIES.join(', ')}.`
    );
  }
  return value;
}

function buildSchoolEffectiveState({
  record = null,
  availability,
  reason = null,
  publishable,
  verifiedDisable = false,
  retainedLastValid = false
}) {
  const normalizedRecord = record === null ? null : normalizeSchoolRecord(record);
  const normalizedAvailability = normalizeSchoolReadAvailability(availability);
  if (reason !== null && !SCHOOL_DEGRADED_REASONS.includes(reason)) {
    fail('SCHOOL_DEGRADED_REASON', 'School degraded state uses an unsupported reason.');
  }
  for (const [label, value] of [
    ['publishable', publishable],
    ['verifiedDisable', verifiedDisable],
    ['retainedLastValid', retainedLastValid]
  ]) {
    if (typeof value !== 'boolean') fail('SCHOOL_EFFECTIVE_BOOLEAN', `${label} must be a boolean.`);
  }
  if (verifiedDisable && (normalizedRecord === null || normalizedRecord.enabled)) {
    fail(
      'SCHOOL_VERIFIED_DISABLE_STATE',
      'Verified disable evidence can accompany only an accepted disabled School record.'
    );
  }
  const degraded = reason !== null;
  return deepFreeze({
    record: normalizedRecord,
    effectiveEnabled: normalizedRecord ? normalizedRecord.enabled : true,
    status: degraded ? 'degraded' : 'available',
    availability: normalizedAvailability,
    degraded,
    reason,
    publishable,
    verifiedDisable,
    retainedLastValid
  });
}

function createSchoolEffectiveState(record) {
  if (record === undefined || record === null) {
    return buildSchoolEffectiveState({
      record: null,
      availability: 'unavailable',
      reason: 'record-unavailable',
      publishable: false,
      retainedLastValid: false
    });
  }
  return buildSchoolEffectiveState({
    record,
    availability: 'available',
    publishable: true,
    retainedLastValid: false
  });
}

function normalizePreviousSchoolEffectiveState(value) {
  const data = clonePlainData(value, 'Previous School effective state');
  assertExactFields(data, SCHOOL_EFFECTIVE_STATE_FIELDS, 'Previous School effective state');
  if (typeof data.effectiveEnabled !== 'boolean'
    || typeof data.degraded !== 'boolean'
    || typeof data.publishable !== 'boolean'
    || typeof data.verifiedDisable !== 'boolean'
    || typeof data.retainedLastValid !== 'boolean') {
    fail('SCHOOL_EFFECTIVE_STATE', 'Previous School effective state contains an invalid boolean field.');
  }
  if (!['available', 'degraded'].includes(data.status)) {
    fail('SCHOOL_EFFECTIVE_STATE', 'Previous School effective state has an invalid status.');
  }
  normalizeSchoolReadAvailability(data.availability);
  if (data.reason !== null && !SCHOOL_DEGRADED_REASONS.includes(data.reason)) {
    fail('SCHOOL_EFFECTIVE_STATE', 'Previous School effective state has an invalid degraded reason.');
  }
  if (data.degraded !== (data.status === 'degraded') || data.degraded !== (data.reason !== null)) {
    fail('SCHOOL_EFFECTIVE_STATE', 'Previous School effective state has inconsistent degraded fields.');
  }
  const normalizedRecord = data.record === null ? null : normalizeSchoolRecord(data.record);
  const expectedEnabled = normalizedRecord ? normalizedRecord.enabled : true;
  if (data.effectiveEnabled !== expectedEnabled) {
    fail('SCHOOL_EFFECTIVE_STATE', 'Previous School effective state conflicts with its retained record.');
  }
  if (data.verifiedDisable && (normalizedRecord === null || normalizedRecord.enabled)) {
    fail('SCHOOL_EFFECTIVE_STATE', 'Previous School effective state has invalid disable evidence.');
  }
  return data.record === null
    ? createSchoolEffectiveState()
    : createSchoolEffectiveState(normalizedRecord);
}

function degradedSchoolEffectiveState(previous, availability, reason) {
  return buildSchoolEffectiveState({
    record: previous.record,
    availability,
    reason,
    publishable: false,
    verifiedDisable: false,
    retainedLastValid: previous.record !== null
  });
}

function sameSchoolRecord(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function reconcileSchoolRecordRead(input) {
  const data = cloneTopLevelSettings(input, 'School record reconciliation');
  assertExactFields(data, SCHOOL_RECONCILIATION_FIELDS, 'School record reconciliation');
  if (!OWN(data, 'previous')) {
    fail('SCHOOL_PREVIOUS_STATE_REQUIRED', 'School record reconciliation requires the previous effective state.');
  }
  if (!OWN(data, 'availability')) {
    fail('SCHOOL_READ_AVAILABILITY', 'School record reconciliation requires an availability value.');
  }
  const availability = normalizeSchoolReadAvailability(data.availability);
  const previous = normalizePreviousSchoolEffectiveState(data.previous);
  if (OWN(data, 'verifiedDisable') && typeof data.verifiedDisable !== 'boolean') {
    fail('SCHOOL_VERIFIED_DISABLE', 'verifiedDisable must be a boolean.');
  }
  const verifiedDisable = data.verifiedDisable === true;

  if (availability === 'invalid') {
    return degradedSchoolEffectiveState(previous, 'invalid', 'record-invalid');
  }
  if (availability === 'unavailable') {
    return degradedSchoolEffectiveState(previous, 'unavailable', 'record-unavailable');
  }

  let candidate;
  try {
    candidate = normalizeSchoolRecord(data.candidate);
  } catch {
    return degradedSchoolEffectiveState(previous, 'invalid', 'record-invalid');
  }

  if (previous.record) {
    if (candidate.revision < previous.record.revision
      || (candidate.revision > previous.record.revision
        && previous.record.updatedAt !== null
        && (candidate.updatedAt === null || Date.parse(candidate.updatedAt) <= Date.parse(previous.record.updatedAt)))) {
      return degradedSchoolEffectiveState(previous, 'available', 'record-stale');
    }
    if (candidate.revision === previous.record.revision && !sameSchoolRecord(candidate, previous.record)) {
      return degradedSchoolEffectiveState(previous, 'available', 'revision-conflict');
    }
  }

  const disabling = previous.effectiveEnabled && !candidate.enabled;
  if (disabling && !verifiedDisable) {
    return degradedSchoolEffectiveState(previous, 'available', 'disable-verification-required');
  }

  return buildSchoolEffectiveState({
    record: candidate,
    availability: 'available',
    publishable: true,
    verifiedDisable: disabling,
    retainedLastValid: false
  });
}

function schoolModeUiPolicy(value) {
  const enabled = schoolModeEnabled(value);
  return deepFreeze({
    enabled,
    forcedLanguage: enabled ? 'en' : null,
    funnyLevelsInstalled: !enabled,
    personalVocabularyInstalled: !enabled,
    dimSumInstalled: !enabled,
    hiddenFeatureIds: enabled ? suppressedFeatureIds() : []
  });
}

module.exports = {
  SCHOOL_SCHEMA_VERSION,
  SCHOOL_UNLOCK_POLICIES,
  SCHOOL_RECORD_MAX_BYTES,
  SCHOOL_DISPLAY_NAME_MAX_CODE_POINTS,
  SCHOOL_DISPLAY_NAME_MAX_BYTES,
  SCHOOL_CREDENTIAL_REF_MAX_CODE_POINTS,
  SCHOOL_PREFERENCE_SNAPSHOT_MAX_BYTES,
  SCHOOL_READ_AVAILABILITIES,
  SCHOOL_DEGRADED_REASONS,
  DEFAULT_SCHOOL_DISPLAY_NAME,
  SCHOOL_SUPPRESSED_FEATURE_IDS,
  SCHOOL_PREFERENCE_FIELDS,
  normalizeSchoolRecord,
  normalizeSchoolDisplayName,
  transitionRequiresCredential,
  suppressedFeatureIds,
  captureSchoolPreferences,
  restoreSchoolPreferences,
  createSchoolEffectiveState,
  reconcileSchoolRecordRead,
  createDefaultSchoolRecord,
  transitionSchoolMode,
  isSchoolFeatureSuppressed,
  applySchoolPreferences,
  schoolModeUiPolicy
};
