'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function schoolCore() {
  return require('../../app/core/school-mode');
}

function unlock(policy = 'pin', credentialRef = 'vault:school-primary') {
  return { policy, credentialRef };
}

function schoolRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    revision: 7,
    enabled: true,
    displayName: 'Focus time',
    unlock: unlock(),
    updatedAt: '2026-08-25T12:00:00.000Z',
    ...overrides
  };
}

test('exports the shared School mode contract through the pinned CommonJS seam', () => {
  const core = schoolCore();
  assert.equal(core.SCHOOL_SCHEMA_VERSION, 1);
  assert.deepEqual(core.SCHOOL_UNLOCK_POLICIES, ['pin', 'password', 'passkey']);
  for (const name of [
    'normalizeSchoolRecord',
    'normalizeSchoolDisplayName',
    'transitionRequiresCredential',
    'suppressedFeatureIds',
    'captureSchoolPreferences',
    'restoreSchoolPreferences'
  ]) {
    assert.equal(typeof core[name], 'function', `${name} must be exported`);
  }
});

test('normalizes a bounded record into deeply frozen data without changing its meaning', () => {
  const { normalizeSchoolRecord } = schoolCore();
  const input = schoolRecord();
  const normalized = normalizeSchoolRecord(input);
  assert.deepEqual(normalized, input);
  assert.notEqual(normalized, input);
  assert.notEqual(normalized.unlock, input.unlock);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.unlock), true);
});

test('normalizes safe Unicode display names and rejects invisible or ambiguous names', () => {
  const { normalizeSchoolDisplayName } = schoolCore();
  assert.equal(normalizeSchoolDisplayName('  Cafe\u0301\t學習  '), 'Café 學習');
  assert.throws(() => normalizeSchoolDisplayName('   '), /display name/i);
  assert.throws(() => normalizeSchoolDisplayName('Class\u0000room'), /control|format/i);
  assert.throws(() => normalizeSchoolDisplayName('Safe\u202Ename'), /control|format/i);
  assert.throws(() => normalizeSchoolDisplayName('\uD800'), /Unicode|surrogate/i);
  assert.throws(() => normalizeSchoolDisplayName('x'.repeat(81)), /80 code points/i);
});

test('rejects unsupported schemas, unknown fields, accessors, symbols, invalid revisions, and oversized records', () => {
  const { normalizeSchoolRecord } = schoolCore();
  assert.throws(() => normalizeSchoolRecord({ ...schoolRecord(), schemaVersion: 2 }), /schema version/i);
  assert.throws(() => normalizeSchoolRecord({ ...schoolRecord(), extra: true }), /unknown field/i);
  assert.throws(() => normalizeSchoolRecord({ ...schoolRecord(), revision: -1 }), /revision/i);
  assert.throws(() => normalizeSchoolRecord({ ...schoolRecord(), extra: 'x'.repeat(20000) }), /8192 bytes/i);

  const accessor = schoolRecord();
  Object.defineProperty(accessor, 'displayName', { enumerable: true, get() { throw new Error('must not run'); } });
  assert.throws(() => normalizeSchoolRecord(accessor), /accessor/i);

  const withSymbol = schoolRecord();
  withSymbol[Symbol('hidden')] = true;
  assert.throws(() => normalizeSchoolRecord(withSymbol), /symbol/i);
});

test('supports PIN, password, and passkey references while refusing credential material', () => {
  const { normalizeSchoolRecord } = schoolCore();
  for (const policy of ['pin', 'password', 'passkey']) {
    const normalized = normalizeSchoolRecord(schoolRecord({ unlock: unlock(policy, `${policy}:school-primary`) }));
    assert.deepEqual(normalized.unlock, unlock(policy, `${policy}:school-primary`));
  }
  assert.throws(() => normalizeSchoolRecord(schoolRecord({ unlock: unlock('totp') })), /unlock policy/i);
  assert.throws(() => normalizeSchoolRecord(schoolRecord({ unlock: unlock('pin', 'raw value') })), /opaque reference/i);
  for (const field of ['pin', 'password', 'secret', 'hash', 'salt', 'credential']) {
    assert.throws(
      () => normalizeSchoolRecord(schoolRecord({ unlock: { ...unlock(), [field]: 'not allowed' } })),
      /unknown field/i
    );
  }
  assert.throws(() => normalizeSchoolRecord(schoolRecord({ unlock: null })), /enabled.*unlock/i);
});

test('identifies transitions that require current credential verification', () => {
  const { transitionRequiresCredential } = schoolCore();
  const active = schoolRecord();
  assert.equal(transitionRequiresCredential(active, { enabled: false }), true);
  assert.equal(transitionRequiresCredential(active, { displayName: 'Quiet study' }), false);
  assert.equal(transitionRequiresCredential(active, { enabled: true }), false);
  assert.equal(transitionRequiresCredential(active, { unlock: unlock('password', 'vault:school-next') }), true);

  const inactive = schoolRecord({ enabled: false });
  assert.equal(transitionRequiresCredential(inactive, { enabled: true }), false);
  assert.equal(transitionRequiresCredential(inactive, { unlock: null }), true);
  assert.equal(
    transitionRequiresCredential(
      schoolRecord({ enabled: false, unlock: null }),
      { enabled: true, unlock: unlock('passkey', 'webauthn:school-primary') }
    ),
    false
  );
});

test('requires matching current verification to disable and never consumes a plaintext credential', () => {
  const { transitionSchoolMode } = schoolCore();
  const active = schoolRecord();
  const request = { enabled: false, updatedAt: '2026-08-25T12:01:00.000Z' };
  assert.throws(() => transitionSchoolMode(active, request), /current credential/i);
  assert.throws(
    () => transitionSchoolMode(active, request, { verifiedCredentialRef: 'vault:wrong' }),
    /current credential/i
  );
  const disabled = transitionSchoolMode(active, request, { verifiedCredentialRef: 'vault:school-primary' });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.revision, 8);
  assert.equal(disabled.unlock.credentialRef, 'vault:school-primary');
  assert.equal('credential' in disabled, false);
  assert.equal('password' in disabled, false);
});

test('requires enrollment evidence for a new verifier and both proofs for replacement', () => {
  const { createDefaultSchoolRecord, transitionSchoolMode } = schoolCore();
  const empty = createDefaultSchoolRecord();
  const firstUnlock = unlock('passkey', 'webauthn:school-primary');
  const enable = { enabled: true, unlock: firstUnlock, updatedAt: '2026-08-25T12:01:00.000Z' };
  assert.throws(() => transitionSchoolMode(empty, enable), /enrollment/i);
  const enabled = transitionSchoolMode(empty, enable, { enrolledCredentialRef: 'webauthn:school-primary' });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.revision, 1);

  const replacement = unlock('password', 'vault:school-next');
  const replaceRequest = { unlock: replacement, updatedAt: '2026-08-25T12:02:00.000Z' };
  assert.throws(
    () => transitionSchoolMode(enabled, replaceRequest, { verifiedCredentialRef: 'webauthn:school-primary' }),
    /enrollment/i
  );
  assert.throws(
    () => transitionSchoolMode(enabled, replaceRequest, { enrolledCredentialRef: 'vault:school-next' }),
    /current credential/i
  );
  const replaced = transitionSchoolMode(enabled, replaceRequest, {
    verifiedCredentialRef: 'webauthn:school-primary',
    enrolledCredentialRef: 'vault:school-next'
  });
  assert.deepEqual(replaced.unlock, replacement);
  assert.equal(replaced.revision, 2);
});

test('allows rename and re-enable without weakening revision or timestamp ordering', () => {
  const { transitionSchoolMode } = schoolCore();
  const inactive = schoolRecord({ enabled: false });
  const renamed = transitionSchoolMode(inactive, {
    displayName: '  Study\tmode  ',
    updatedAt: '2026-08-25T12:01:00.000Z'
  });
  assert.equal(renamed.displayName, 'Study mode');
  assert.equal(renamed.revision, 8);

  const enabled = transitionSchoolMode(renamed, {
    enabled: true,
    updatedAt: '2026-08-25T12:02:00.000Z'
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.revision, 9);
  assert.throws(
    () => transitionSchoolMode(enabled, { displayName: 'Later', updatedAt: enabled.updatedAt }),
    /later than/i
  );

  const noChange = transitionSchoolMode(enabled, { displayName: ' Study mode ' });
  assert.deepEqual(noChange, enabled);
  assert.equal(noChange.revision, enabled.revision);
});

test('enumerates exact hidden UI categories and suppresses every dim-sum namespace', () => {
  const { suppressedFeatureIds, isSchoolFeatureSuppressed } = schoolCore();
  const ids = suppressedFeatureIds();
  assert.equal(Object.isFrozen(ids), true);
  for (const id of [
    'language',
    'language.cantonese',
    'language.bilingual',
    'funny',
    'personal-vocabulary',
    'dim-sum.capability',
    'dim-sum.code-name',
    'dim-sum.reference'
  ]) {
    assert.equal(ids.includes(id), true, `missing ${id}`);
    assert.equal(isSchoolFeatureSuppressed(id, true), true, `${id} must be suppressed`);
  }
  for (const id of ['dim-sum.future-capability', 'dim-sum:future-code-name', 'dim-sum/future-reference']) {
    assert.equal(isSchoolFeatureSuppressed(id, true), true, `${id} must be suppressed by namespace`);
  }
  assert.equal(isSchoolFeatureSuppressed('language.english', true), false);
  assert.equal(isSchoolFeatureSuppressed('dim-sum.code-name', false), false);
});

test('forces the exact effective presentation policy while preserving stored preferences', () => {
  const { applySchoolPreferences, captureSchoolPreferences } = schoolCore();
  const settings = {
    language: 'bilingual',
    funnyEnglish: 4,
    funnyCantonese: 2,
    personalVocabularyEnabled: true,
    dimSumCapabilitiesEnabled: true,
    dimSumSurpriseEnabled: true,
    dimSumCodeNamesEnabled: true,
    dimSumReferencesEnabled: true,
    theme: 'dark'
  };
  const snapshot = captureSchoolPreferences(settings);
  const effective = applySchoolPreferences(settings);
  assert.deepEqual(snapshot, {
    language: 'bilingual',
    funnyEnglish: 4,
    funnyCantonese: 2,
    personalVocabularyEnabled: true,
    dimSumCapabilitiesEnabled: true,
    dimSumSurpriseEnabled: true,
    dimSumCodeNamesEnabled: true,
    dimSumReferencesEnabled: true
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.deepEqual(effective, {
    ...settings,
    language: 'en',
    funnyEnglish: 1,
    funnyCantonese: 1,
    personalVocabularyEnabled: false,
    dimSumCapabilitiesEnabled: false,
    dimSumSurpriseEnabled: false,
    dimSumCodeNamesEnabled: false,
    dimSumReferencesEnabled: false
  });
  assert.deepEqual(settings, { ...settings, language: 'bilingual' });
});

test('restores every prior choice exactly without overwriting unrelated settings', () => {
  const { applySchoolPreferences, captureSchoolPreferences, restoreSchoolPreferences } = schoolCore();
  const before = {
    language: 'yue',
    funnyEnglish: 5,
    funnyCantonese: 3,
    personalVocabularyEnabled: true,
    dimSumCapabilitiesEnabled: true,
    dimSumSurpriseEnabled: true,
    dimSumCodeNamesEnabled: false,
    dimSumReferencesEnabled: true,
    theme: 'dark'
  };
  const snapshot = captureSchoolPreferences(before);
  const effective = applySchoolPreferences(before);
  const during = { ...effective, theme: 'light' };
  const restored = restoreSchoolPreferences(during, snapshot);
  assert.deepEqual(restored, { ...before, theme: 'light' });
  assert.notEqual(restored, during);
  assert.deepEqual(effective.language, 'en');
  assert.deepEqual(snapshot.language, 'yue');
  assert.throws(() => restoreSchoolPreferences(during, { ...snapshot, extra: true }), /unknown field/i);
});
