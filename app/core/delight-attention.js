'use strict';

const SURPRISE_PROBABILITY = 0.1;
const DEFAULT_SURPRISE_DISMISS_MS = 8000;
const DEFAULT_MOMENTUM_IDLE_MS = 40 * 60 * 1000;
const MIN_MOMENTUM_DISMISS_MS = 60 * 1000;
const MAX_MOMENTUM_DISMISS_MS = 24 * 60 * 60 * 1000;
const MAX_NEXT_ACTION_LENGTH = 240;

const ATTENTION_KEYS = Object.freeze([
  'focus',
  'lowStimulation',
  'timeAwareness',
  'oneThing',
  'momentum'
]);

const DIM_SUM_CATALOG_URL = 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const DIM_SUM_RECORD = deepFreeze({
  id: 'hk-dish-0001',
  name: {
    en: 'Classic Har Gow',
    zhHant: '蝦餃'
  },
  alt: {
    en: 'Classic Har Gow shrimp dumpling',
    zhHant: '經典蝦餃'
  },
  catalogUrl: DIM_SUM_CATALOG_URL,
  catalogRelease: 'catalog-v1',
  photoFileName: 'hk-dish-0001-classic-har-gow.png',
  photoUrl: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png'
});

function toInstant(value, label) {
  const instant = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new TypeError(`${label} must be a valid date or timestamp.`);
  return instant;
}

function toIso(value, label) {
  return toInstant(value, label).toISOString();
}

function normalizeOptionalIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const instant = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

function boundedText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function createLaunchState() {
  return Object.freeze({ decided: false });
}

function normalizeLaunchState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createLaunchState();
  if (value.decided === true && Object.isFrozen(value) && Object.keys(value).length === 1) return value;
  return Object.freeze({ decided: value.decided === true });
}

function validateDraw(draw) {
  if (typeof draw !== 'number' || !Number.isFinite(draw) || draw < 0 || draw >= 1) {
    throw new RangeError('draw must be a finite number greater than or equal to 0 and less than 1.');
  }
  return draw;
}

function startupSuppressionReason(context) {
  if (context.firstRun === true) return 'first-run';
  if (context.schoolMode === true) return 'school-mode';
  if (context.errorActive === true) return 'error-path';
  if (context.updateActive === true) return 'update-flow';
  if (context.midTask === true) return 'mid-task';
  return null;
}

function decideStartupSurprise(launchState, context = {}) {
  const normalizedLaunchState = normalizeLaunchState(launchState);
  if (normalizedLaunchState.decided) {
    return deepFreeze({
      selected: false,
      reason: 'already-decided',
      probability: SURPRISE_PROBABILITY,
      draw: null,
      launchState: normalizedLaunchState
    });
  }

  const draw = validateDraw(context.draw);
  const nextLaunchState = Object.freeze({ decided: true });
  const suppression = startupSuppressionReason(context);
  if (suppression) {
    return deepFreeze({
      selected: false,
      reason: suppression,
      probability: SURPRISE_PROBABILITY,
      draw,
      launchState: nextLaunchState
    });
  }

  const selected = draw >= 0 && draw < SURPRISE_PROBABILITY;
  return deepFreeze({
    selected,
    reason: selected ? 'selected' : 'not-selected',
    probability: SURPRISE_PROBABILITY,
    draw,
    launchState: nextLaunchState
  });
}

function shouldShowStartupSurprise(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Startup surprise options must be an object.');
  }
  const { launchState = createLaunchState(), exclusions = {}, draw } = options;
  if (!exclusions || typeof exclusions !== 'object' || Array.isArray(exclusions)) {
    throw new TypeError('Startup surprise exclusions must be an object.');
  }
  return decideStartupSurprise(launchState, {
    draw,
    firstRun: exclusions.firstRun === true || options.firstRun === true,
    schoolMode: exclusions.schoolMode === true || options.schoolMode === true,
    errorActive: exclusions.errorActive === true || options.errorActive === true,
    updateActive: exclusions.updateActive === true || options.updateActive === true,
    midTask: exclusions.midTask === true || options.midTask === true
  });
}

function startupSurprisePresentationPolicy(options = {}) {
  const selected = options.selected === true;
  const quietMode = options.quietMode === true;
  const reducedMotion = options.reducedMotion === true;
  const visible = selected && !quietMode;
  return Object.freeze({
    visible,
    animation: visible && !reducedMotion ? 'gentle' : 'none',
    ariaLive: visible ? 'polite' : 'off',
    autoDismissMs: visible ? DEFAULT_SURPRISE_DISMISS_MS : 0,
    sound: false,
    blocksStartup: false,
    stealsFocus: false,
    suppressedByQuietMode: selected && quietMode
  });
}

function createDefaultAttentionState(now = Date.now()) {
  const nowIso = toIso(now, 'now');
  return Object.freeze({
    focus: false,
    lowStimulation: false,
    timeAwareness: false,
    oneThing: false,
    momentum: false,
    nextAction: '',
    lastMeaningfulChangeAt: nowIso,
    momentumDismissedUntil: null
  });
}

function normalizeAttentionSettings(input = {}, now = Date.now()) {
  const nowIso = toIso(now, 'now');
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const lastMeaningfulChangeAt = normalizeOptionalIso(source.lastMeaningfulChangeAt) || nowIso;
  const momentumDismissedUntil = normalizeOptionalIso(source.momentumDismissedUntil);
  return Object.freeze({
    focus: Boolean(source.focus),
    lowStimulation: Boolean(source.lowStimulation),
    timeAwareness: Boolean(source.timeAwareness),
    oneThing: Boolean(source.oneThing),
    momentum: Boolean(source.momentum),
    nextAction: boundedText(source.nextAction, MAX_NEXT_ACTION_LENGTH),
    lastMeaningfulChangeAt,
    momentumDismissedUntil
  });
}

function elapsedMs(nowMs, earlierMs) {
  return Math.max(0, nowMs - earlierMs);
}

function normalizeMomentumIdleMs(value) {
  if (value === undefined) return DEFAULT_MOMENTUM_IDLE_MS;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_MOMENTUM_DISMISS_MS) {
    throw new RangeError('momentumIdleMs must be greater than 0 and no more than 24 hours.');
  }
  return Math.floor(value);
}

function deriveAttentionView(input = {}, context = {}) {
  const now = toInstant(context.now === undefined ? Date.now() : context.now, 'now');
  const nowIso = now.toISOString();
  const state = normalizeAttentionSettings(input, nowIso);
  const sessionStartedAt = toInstant(
    context.sessionStartedAt === undefined ? nowIso : context.sessionStartedAt,
    'sessionStartedAt'
  );
  const lastMeaningfulChangeAt = toInstant(state.lastMeaningfulChangeAt, 'lastMeaningfulChangeAt');
  const sessionElapsedMs = elapsedMs(now.getTime(), sessionStartedAt.getTime());
  const sinceMeaningfulChangeMs = elapsedMs(now.getTime(), lastMeaningfulChangeAt.getTime());
  const dismissedUntilMs = state.momentumDismissedUntil === null
    ? null
    : toInstant(state.momentumDismissedUntil, 'momentumDismissedUntil').getTime();
  const dismissed = dismissedUntilMs !== null && dismissedUntilMs > now.getTime();
  const momentumIdleMs = normalizeMomentumIdleMs(context.momentumIdleMs);
  const activeRegionId = boundedText(context.activeRegionId, 128) || null;

  return deepFreeze({
    focus: {
      enabled: state.focus,
      activeRegionId,
      dimNonActive: state.focus,
      hideNonActive: false
    },
    lowStimulation: {
      enabled: state.lowStimulation,
      reduceMotion: state.lowStimulation || context.systemReducedMotion === true,
      quietColors: state.lowStimulation,
      suppressNonEssentialNotifications: state.lowStimulation
    },
    timeAwareness: {
      enabled: state.timeAwareness,
      sessionElapsedMs,
      sessionElapsedSeconds: Math.floor(sessionElapsedMs / 1000),
      sinceMeaningfulChangeMs,
      sinceMeaningfulChangeSeconds: Math.floor(sinceMeaningfulChangeMs / 1000)
    },
    oneThing: {
      enabled: state.oneThing,
      nextAction: state.nextAction,
      hasNextAction: state.nextAction.length > 0
    },
    momentum: {
      enabled: state.momentum,
      idleElapsedMs: sinceMeaningfulChangeMs,
      idleElapsedSeconds: Math.floor(sinceMeaningfulChangeMs / 1000),
      idleThresholdMs: momentumIdleMs,
      dismissed,
      dismissedUntil: state.momentumDismissedUntil,
      dismissalRemainingMs: dismissed ? dismissedUntilMs - now.getTime() : 0,
      promptDue: state.momentum && sinceMeaningfulChangeMs >= momentumIdleMs && !dismissed
    }
  });
}

function updateAttentionSetting(input, key, value, now = Date.now()) {
  const state = normalizeAttentionSettings(input, now);
  if (ATTENTION_KEYS.includes(key)) {
    return normalizeAttentionSettings({ ...state, [key]: Boolean(value) }, now);
  }
  if (key === 'nextAction') {
    return normalizeAttentionSettings({ ...state, nextAction: value }, now);
  }
  throw new RangeError(`Unsupported attention setting: ${String(key)}.`);
}

function dismissMomentum(input, options = {}) {
  const now = toInstant(options.now === undefined ? Date.now() : options.now, 'now');
  const durationMs = options.durationMs;
  if (!Number.isFinite(durationMs) || durationMs < MIN_MOMENTUM_DISMISS_MS || durationMs > MAX_MOMENTUM_DISMISS_MS) {
    throw new RangeError('durationMs must be from 1 minute through 24 hours.');
  }
  const state = normalizeAttentionSettings(input, now);
  return Object.freeze({
    ...state,
    momentumDismissedUntil: new Date(now.getTime() + Math.floor(durationMs)).toISOString()
  });
}

function markMeaningfulChange(input, now = Date.now()) {
  const nowIso = toIso(now, 'now');
  const state = normalizeAttentionSettings(input, nowIso);
  return Object.freeze({
    ...state,
    lastMeaningfulChangeAt: nowIso,
    momentumDismissedUntil: null
  });
}

module.exports = {
  ATTENTION_KEYS,
  DEFAULT_MOMENTUM_IDLE_MS,
  DEFAULT_SURPRISE_DISMISS_MS,
  DIM_SUM_CATALOG_URL,
  DIM_SUM_DISH: DIM_SUM_RECORD,
  DIM_SUM_RECORD,
  MAX_MOMENTUM_DISMISS_MS,
  MIN_MOMENTUM_DISMISS_MS,
  SURPRISE_PROBABILITY,
  createDefaultAttentionState,
  createLaunchState,
  decideStartupSurprise,
  deriveAttentionBehavior: deriveAttentionView,
  deriveAttentionView,
  dismissMomentum,
  markMeaningfulChange,
  normalizeAttentionSettings,
  normalizeAttentionState: normalizeAttentionSettings,
  shouldShowStartupSurprise,
  startupSurprisePresentationPolicy,
  updateAttentionSetting
};
