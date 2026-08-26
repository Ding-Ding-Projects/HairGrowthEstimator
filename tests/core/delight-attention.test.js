'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ATTENTION_KEYS,
  DEFAULT_MOMENTUM_IDLE_MS,
  DIM_SUM_CATALOG_URL,
  DIM_SUM_DISH,
  DIM_SUM_RECORD,
  SURPRISE_PROBABILITY,
  createDefaultAttentionState,
  createLaunchState,
  decideStartupSurprise,
  deriveAttentionBehavior,
  deriveAttentionView,
  dismissMomentum,
  markMeaningfulChange,
  normalizeAttentionSettings,
  normalizeAttentionState,
  shouldShowStartupSurprise,
  startupSurprisePresentationPolicy,
  updateAttentionSetting
} = require('../../app/core/delight-attention');

const NOW = '2026-08-25T12:00:00.000Z';
const SESSION_START = '2026-08-25T11:00:00.000Z';

function eligibleContext(draw) {
  return {
    draw,
    firstRun: false,
    schoolMode: false,
    errorActive: false,
    updateActive: false,
    midTask: false
  };
}

test('published dish metadata is factual, immutable, and references only the public catalog', () => {
  assert.strictEqual(DIM_SUM_RECORD, DIM_SUM_DISH);
  assert.equal(DIM_SUM_CATALOG_URL, 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json');
  assert.deepEqual(DIM_SUM_DISH.name, { en: 'Classic Har Gow', zhHant: '蝦餃' });
  assert.equal(DIM_SUM_DISH.id, 'hk-dish-0001');
  assert.equal(DIM_SUM_DISH.catalogRelease, 'catalog-v1');
  assert.equal(
    DIM_SUM_DISH.photoUrl,
    'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png'
  );
  assert.equal(DIM_SUM_DISH.photoFileName, 'hk-dish-0001-classic-har-gow.png');
  assert.equal(Object.isFrozen(DIM_SUM_DISH), true);
  assert.equal(Object.isFrozen(DIM_SUM_DISH.name), true);
  assert.throws(() => {
    DIM_SUM_DISH.name.en = 'Changed';
  }, TypeError);
});

test('the renderer integration seam exposes deterministic canonical functions', () => {
  assert.strictEqual(normalizeAttentionSettings, normalizeAttentionState);
  assert.strictEqual(deriveAttentionView, deriveAttentionBehavior);
  const decision = shouldShowStartupSurprise({
    draw: 0.05,
    launchState: createLaunchState(),
    exclusions: {
      firstRun: false,
      schoolMode: false,
      errorActive: false,
      updateActive: false,
      midTask: false
    }
  });
  assert.equal(decision.selected, true);
  const excluded = shouldShowStartupSurprise({
    draw: 0,
    launchState: createLaunchState(),
    exclusions: { schoolMode: true }
  });
  assert.equal(excluded.selected, false);
  assert.equal(excluded.reason, 'school-mode');
});

test('startup selection uses the exact lower-inclusive and upper-exclusive ten percent boundary', () => {
  assert.equal(SURPRISE_PROBABILITY, 0.1);
  for (const draw of [0, Number.MIN_VALUE, 0.099999999999]) {
    const decision = decideStartupSurprise(createLaunchState(), eligibleContext(draw));
    assert.equal(decision.selected, true, `draw ${draw} should select`);
    assert.equal(decision.reason, 'selected');
  }
  for (const draw of [0.1, 0.100000000001, 0.999999999999]) {
    const decision = decideStartupSurprise(createLaunchState(), eligibleContext(draw));
    assert.equal(decision.selected, false, `draw ${draw} should not select`);
    assert.equal(decision.reason, 'not-selected');
  }
});

test('startup selection rejects draws outside the normalized random range', () => {
  for (const draw of [-1, -Number.MIN_VALUE, 1, Number.POSITIVE_INFINITY, Number.NaN, '0.05']) {
    assert.throws(
      () => decideStartupSurprise(createLaunchState(), eligibleContext(draw)),
      /draw must be a finite number greater than or equal to 0 and less than 1/
    );
  }
});

test('startup selection is decided only once per launch', () => {
  const first = decideStartupSurprise(createLaunchState(), eligibleContext(0.05));
  assert.equal(first.selected, true);
  assert.equal(first.launchState.decided, true);

  const second = decideStartupSurprise(first.launchState, eligibleContext(0.99));
  assert.equal(second.selected, false);
  assert.equal(second.reason, 'already-decided');
  assert.strictEqual(second.launchState, first.launchState);
});

test('startup selection records every required suppression without consuming probability semantics', () => {
  const cases = [
    ['firstRun', 'first-run'],
    ['schoolMode', 'school-mode'],
    ['errorActive', 'error-path'],
    ['updateActive', 'update-flow'],
    ['midTask', 'mid-task']
  ];

  for (const [field, reason] of cases) {
    const context = { ...eligibleContext(0), [field]: true };
    const decision = decideStartupSurprise(createLaunchState(), context);
    assert.equal(decision.selected, false);
    assert.equal(decision.reason, reason);
    assert.equal(decision.launchState.decided, true);
  }
});

test('startup presentation is non-blocking, never steals focus, and respects quiet and reduced motion', () => {
  const standard = startupSurprisePresentationPolicy({ selected: true, reducedMotion: false, quietMode: false });
  assert.deepEqual(standard, {
    visible: true,
    animation: 'gentle',
    ariaLive: 'polite',
    autoDismissMs: 8000,
    sound: false,
    blocksStartup: false,
    stealsFocus: false,
    suppressedByQuietMode: false
  });

  const reduced = startupSurprisePresentationPolicy({ selected: true, reducedMotion: true, quietMode: false });
  assert.equal(reduced.visible, true);
  assert.equal(reduced.animation, 'none');
  assert.equal(reduced.ariaLive, 'polite');

  const quiet = startupSurprisePresentationPolicy({ selected: true, reducedMotion: false, quietMode: true });
  assert.equal(quiet.visible, false);
  assert.equal(quiet.animation, 'none');
  assert.equal(quiet.ariaLive, 'off');
  assert.equal(quiet.autoDismissMs, 0);
  assert.equal(quiet.suppressedByQuietMode, true);

  const notSelected = startupSurprisePresentationPolicy({ selected: false });
  assert.equal(notSelected.visible, false);
  assert.equal(notSelected.autoDismissMs, 0);
});

test('all five attention accommodations are independent and off by default', () => {
  assert.deepEqual(ATTENTION_KEYS, ['focus', 'lowStimulation', 'timeAwareness', 'oneThing', 'momentum']);
  const state = createDefaultAttentionState(NOW);
  for (const key of ATTENTION_KEYS) assert.equal(state[key], false, `${key} should be off`);
  assert.equal(state.nextAction, '');
  assert.equal(state.lastMeaningfulChangeAt, NOW);
  assert.equal(state.momentumDismissedUntil, null);
  assert.equal(Object.isFrozen(state), true);
});

test('attention normalization bounds user data and preserves valid independent state', () => {
  const longAction = `  ${'x'.repeat(300)}  `;
  const normalized = normalizeAttentionState({
    focus: 1,
    lowStimulation: 0,
    timeAwareness: true,
    oneThing: true,
    momentum: true,
    nextAction: longAction,
    lastMeaningfulChangeAt: '2026-08-25T10:00:00-02:00',
    momentumDismissedUntil: '2026-08-25T13:00:00+01:00',
    ignored: true
  }, NOW);

  assert.equal(normalized.focus, true);
  assert.equal(normalized.lowStimulation, false);
  assert.equal(normalized.timeAwareness, true);
  assert.equal(normalized.oneThing, true);
  assert.equal(normalized.momentum, true);
  assert.equal(normalized.nextAction.length, 240);
  assert.equal(normalized.nextAction, 'x'.repeat(240));
  assert.equal(normalized.lastMeaningfulChangeAt, '2026-08-25T12:00:00.000Z');
  assert.equal(normalized.momentumDismissedUntil, '2026-08-25T12:00:00.000Z');
  assert.equal('ignored' in normalized, false);
  assert.equal(Object.isFrozen(normalized), true);
});

test('attention normalization fails safely to exact time defaults for invalid timestamps', () => {
  const normalized = normalizeAttentionState({
    lastMeaningfulChangeAt: 'not-a-date',
    momentumDismissedUntil: 'also-not-a-date'
  }, NOW);
  assert.equal(normalized.lastMeaningfulChangeAt, NOW);
  assert.equal(normalized.momentumDismissedUntil, null);
  assert.throws(() => createDefaultAttentionState('not-a-date'), /now must be a valid date or timestamp/);
});

test('derived focus and low-stimulation behavior never hides content and composes with reduced motion', () => {
  const behavior = deriveAttentionBehavior({ focus: true, lowStimulation: true }, {
    now: NOW,
    sessionStartedAt: SESSION_START,
    activeRegionId: 'growth-card',
    systemReducedMotion: false
  });
  assert.deepEqual(behavior.focus, {
    enabled: true,
    activeRegionId: 'growth-card',
    dimNonActive: true,
    hideNonActive: false
  });
  assert.deepEqual(behavior.lowStimulation, {
    enabled: true,
    reduceMotion: true,
    quietColors: true,
    suppressNonEssentialNotifications: true
  });

  const systemReduced = deriveAttentionBehavior({}, {
    now: NOW,
    sessionStartedAt: SESSION_START,
    systemReducedMotion: true
  });
  assert.equal(systemReduced.lowStimulation.enabled, false);
  assert.equal(systemReduced.lowStimulation.reduceMotion, true);
});

test('time awareness exposes exact elapsed facts without judgement or scoring', () => {
  const behavior = deriveAttentionBehavior({
    timeAwareness: true,
    lastMeaningfulChangeAt: '2026-08-25T11:42:15.250Z'
  }, {
    now: NOW,
    sessionStartedAt: SESSION_START
  });

  assert.deepEqual(behavior.timeAwareness, {
    enabled: true,
    sessionElapsedMs: 3600000,
    sessionElapsedSeconds: 3600,
    sinceMeaningfulChangeMs: 1064750,
    sinceMeaningfulChangeSeconds: 1064
  });
  assert.equal('score' in behavior.timeAwareness, false);
  assert.equal('streak' in behavior.timeAwareness, false);
});

test('one-thing-at-a-time behavior keeps the persisted user-entered next action', () => {
  const behavior = deriveAttentionBehavior({
    oneThing: true,
    nextAction: 'Measure crown length'
  }, {
    now: NOW,
    sessionStartedAt: SESSION_START
  });
  assert.deepEqual(behavior.oneThing, {
    enabled: true,
    nextAction: 'Measure crown length',
    hasNextAction: true
  });
});

test('momentum reports exact elapsed facts, respects the threshold, and honors dismiss-until', () => {
  assert.equal(DEFAULT_MOMENTUM_IDLE_MS, 40 * 60 * 1000);

  const beforeThreshold = deriveAttentionBehavior({
    momentum: true,
    lastMeaningfulChangeAt: '2026-08-25T11:20:00.001Z'
  }, {
    now: NOW,
    sessionStartedAt: SESSION_START
  });
  assert.equal(beforeThreshold.momentum.idleElapsedMs, DEFAULT_MOMENTUM_IDLE_MS - 1);
  assert.equal(beforeThreshold.momentum.promptDue, false);

  const atThreshold = deriveAttentionBehavior({
    momentum: true,
    lastMeaningfulChangeAt: '2026-08-25T11:20:00.000Z'
  }, {
    now: NOW,
    sessionStartedAt: SESSION_START
  });
  assert.equal(atThreshold.momentum.idleElapsedMs, DEFAULT_MOMENTUM_IDLE_MS);
  assert.equal(atThreshold.momentum.promptDue, true);

  const dismissed = deriveAttentionBehavior({
    momentum: true,
    lastMeaningfulChangeAt: '2026-08-25T11:00:00.000Z',
    momentumDismissedUntil: '2026-08-25T12:30:00.000Z'
  }, {
    now: NOW,
    sessionStartedAt: SESSION_START
  });
  assert.equal(dismissed.momentum.dismissed, true);
  assert.equal(dismissed.momentum.dismissedUntil, '2026-08-25T12:30:00.000Z');
  assert.equal(dismissed.momentum.dismissalRemainingMs, 1800000);
  assert.equal(dismissed.momentum.promptDue, false);
});

test('momentum dismissal and meaningful-change helpers preserve independent settings', () => {
  const base = normalizeAttentionState({
    focus: true,
    lowStimulation: true,
    timeAwareness: true,
    oneThing: true,
    momentum: true,
    nextAction: 'Record haircut',
    lastMeaningfulChangeAt: '2026-08-25T11:00:00.000Z'
  }, NOW);

  const dismissed = dismissMomentum(base, { now: NOW, durationMs: 45 * 60 * 1000 });
  assert.equal(dismissed.momentumDismissedUntil, '2026-08-25T12:45:00.000Z');
  for (const key of ATTENTION_KEYS) assert.equal(dismissed[key], true);
  assert.equal(dismissed.nextAction, 'Record haircut');

  const changed = markMeaningfulChange(dismissed, '2026-08-25T12:05:00.000Z');
  assert.equal(changed.lastMeaningfulChangeAt, '2026-08-25T12:05:00.000Z');
  assert.equal(changed.momentumDismissedUntil, null);
  for (const key of ATTENTION_KEYS) assert.equal(changed[key], true);
});

test('updating one attention accommodation never changes the other four', () => {
  let state = createDefaultAttentionState(NOW);
  for (const key of ATTENTION_KEYS) {
    const previous = state;
    state = updateAttentionSetting(state, key, true, NOW);
    assert.equal(state[key], true);
    for (const other of ATTENTION_KEYS.filter((candidate) => candidate !== key)) {
      assert.equal(state[other], previous[other], `${key} changed ${other}`);
    }
  }

  const withAction = updateAttentionSetting(state, 'nextAction', '  Open the estimator  ', NOW);
  assert.equal(withAction.nextAction, 'Open the estimator');
  for (const key of ATTENTION_KEYS) assert.equal(withAction[key], true);
  assert.throws(() => updateAttentionSetting(state, 'unknown', true, NOW), /Unsupported attention setting/);
});
