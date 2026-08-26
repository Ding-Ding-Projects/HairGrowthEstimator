'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function schoolCore() {
  return require('../../app/core/school-mode');
}

function activeRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    revision: 7,
    enabled: true,
    displayName: 'Focus time',
    unlock: { policy: 'pin', credentialRef: 'vault:school-primary' },
    updatedAt: '2026-08-25T12:00:00.000Z',
    ...overrides
  };
}

function disabledRecord(overrides = {}) {
  return activeRecord({
    revision: 8,
    enabled: false,
    updatedAt: '2026-08-25T12:01:00.000Z',
    ...overrides
  });
}

test('exports the fail-closed shared-record reconciliation API', () => {
  const core = schoolCore();
  assert.equal(typeof core.createSchoolEffectiveState, 'function');
  assert.equal(typeof core.reconcileSchoolRecordRead, 'function');
  assert.deepEqual(core.SCHOOL_READ_AVAILABILITIES, ['available', 'invalid', 'unavailable']);
  assert.deepEqual(core.SCHOOL_DEGRADED_REASONS, [
    'record-invalid',
    'record-unavailable',
    'disable-verification-required',
    'record-stale',
    'revision-conflict'
  ]);
});

test('starts restricted and degraded when no valid shared record is available', () => {
  const { createSchoolEffectiveState } = schoolCore();
  const state = createSchoolEffectiveState();

  assert.deepEqual(state, {
    record: null,
    effectiveEnabled: true,
    status: 'degraded',
    availability: 'unavailable',
    degraded: true,
    reason: 'record-unavailable',
    publishable: false,
    verifiedDisable: false,
    retainedLastValid: false
  });
  assert.equal(Object.isFrozen(state), true);
});

test('accepts a valid disabled initial baseline without inventing transition evidence', () => {
  const { createSchoolEffectiveState } = schoolCore();
  const state = createSchoolEffectiveState(disabledRecord());

  assert.equal(state.record.enabled, false);
  assert.equal(state.effectiveEnabled, false);
  assert.equal(state.status, 'available');
  assert.equal(state.degraded, false);
  assert.equal(state.publishable, true);
  assert.equal(state.verifiedDisable, false);
});

test('invalid and unavailable reads retain the last valid restricted state', () => {
  const { createSchoolEffectiveState, reconcileSchoolRecordRead } = schoolCore();
  const previous = createSchoolEffectiveState(activeRecord());

  const invalid = reconcileSchoolRecordRead({
    candidate: { ...activeRecord(), schemaVersion: 99 },
    previous,
    availability: 'invalid'
  });
  assert.equal(invalid.record.enabled, true);
  assert.equal(invalid.record.revision, 7);
  assert.equal(invalid.effectiveEnabled, true);
  assert.equal(invalid.status, 'degraded');
  assert.equal(invalid.availability, 'invalid');
  assert.equal(invalid.reason, 'record-invalid');
  assert.equal(invalid.publishable, false);
  assert.equal(invalid.verifiedDisable, false);
  assert.equal(invalid.retainedLastValid, true);

  const unavailable = reconcileSchoolRecordRead({
    candidate: null,
    previous,
    availability: 'unavailable'
  });
  assert.equal(unavailable.record.enabled, true);
  assert.equal(unavailable.effectiveEnabled, true);
  assert.equal(unavailable.status, 'degraded');
  assert.equal(unavailable.availability, 'unavailable');
  assert.equal(unavailable.reason, 'record-unavailable');
  assert.equal(unavailable.publishable, false);
  assert.equal(unavailable.verifiedDisable, false);
  assert.equal(unavailable.retainedLastValid, true);
});

test('a malformed candidate marked available degrades without replacing the last valid state', () => {
  const { createSchoolEffectiveState, reconcileSchoolRecordRead } = schoolCore();
  const previous = createSchoolEffectiveState(activeRecord());
  const result = reconcileSchoolRecordRead({
    candidate: { ...activeRecord(), schemaVersion: 99 },
    previous,
    availability: 'available'
  });

  assert.equal(result.record.enabled, true);
  assert.equal(result.effectiveEnabled, true);
  assert.equal(result.status, 'degraded');
  assert.equal(result.availability, 'invalid');
  assert.equal(result.reason, 'record-invalid');
  assert.equal(result.publishable, false);
  assert.equal(result.verifiedDisable, false);
  assert.equal(result.retainedLastValid, true);

  const accessorCandidate = activeRecord();
  Object.defineProperty(accessorCandidate, 'enabled', {
    enumerable: true,
    get() { throw new Error('candidate accessors must not run'); }
  });
  const accessorResult = reconcileSchoolRecordRead({
    candidate: accessorCandidate,
    previous,
    availability: 'available'
  });
  assert.equal(accessorResult.record.enabled, true);
  assert.equal(accessorResult.availability, 'invalid');
  assert.equal(accessorResult.degraded, true);
  assert.equal(accessorResult.publishable, false);
});

test('stale and revision-conflicting reads retain the last valid state', () => {
  const { createSchoolEffectiveState, reconcileSchoolRecordRead } = schoolCore();
  const previous = createSchoolEffectiveState(activeRecord());
  const stale = reconcileSchoolRecordRead({
    candidate: activeRecord({
      revision: 6,
      updatedAt: '2026-08-25T11:59:00.000Z'
    }),
    previous,
    availability: 'available'
  });
  assert.equal(stale.record.revision, 7);
  assert.equal(stale.reason, 'record-stale');
  assert.equal(stale.degraded, true);
  assert.equal(stale.publishable, false);

  const conflict = reconcileSchoolRecordRead({
    candidate: activeRecord({ displayName: 'Conflicting name' }),
    previous,
    availability: 'available'
  });
  assert.equal(conflict.record.displayName, 'Focus time');
  assert.equal(conflict.reason, 'revision-conflict');
  assert.equal(conflict.degraded, true);
  assert.equal(conflict.publishable, false);
});

test('an unverified disabled candidate cannot publish or authorize preference restoration', () => {
  const { createSchoolEffectiveState, reconcileSchoolRecordRead } = schoolCore();
  const previous = createSchoolEffectiveState(activeRecord());
  const result = reconcileSchoolRecordRead({
    candidate: disabledRecord(),
    previous,
    availability: 'available',
    verifiedDisable: false
  });

  assert.equal(result.record.enabled, true);
  assert.equal(result.record.revision, 7);
  assert.equal(result.effectiveEnabled, true);
  assert.equal(result.status, 'degraded');
  assert.equal(result.availability, 'available');
  assert.equal(result.reason, 'disable-verification-required');
  assert.equal(result.publishable, false);
  assert.equal(result.verifiedDisable, false);
  assert.equal(result.retainedLastValid, true);
});

test('a verified disabled transition is the only result that authorizes preference restoration', () => {
  const { createSchoolEffectiveState, reconcileSchoolRecordRead } = schoolCore();
  const previous = createSchoolEffectiveState(activeRecord());
  const result = reconcileSchoolRecordRead({
    candidate: disabledRecord(),
    previous,
    availability: 'available',
    verifiedDisable: true
  });

  assert.equal(result.record.enabled, false);
  assert.equal(result.record.revision, 8);
  assert.equal(result.effectiveEnabled, false);
  assert.equal(result.status, 'available');
  assert.equal(result.availability, 'available');
  assert.equal(result.reason, null);
  assert.equal(result.publishable, true);
  assert.equal(result.verifiedDisable, true);
  assert.equal(result.retainedLastValid, false);

  const degradedAfterDisable = reconcileSchoolRecordRead({
    candidate: null,
    previous: result,
    availability: 'unavailable'
  });
  assert.equal(degradedAfterDisable.record.enabled, false);
  assert.equal(degradedAfterDisable.effectiveEnabled, false);
  assert.equal(degradedAfterDisable.degraded, true);
  assert.equal(degradedAfterDisable.verifiedDisable, false);
  assert.equal(degradedAfterDisable.publishable, false);
});
