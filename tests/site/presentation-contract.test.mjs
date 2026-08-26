import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const contractSource = readFileSync(new URL('../../site/presentation-contract.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../site/app.js', import.meta.url), 'utf8');

function loadContract(source = contractSource) {
  const context = vm.createContext({ Intl, URL });
  vm.runInContext(source, context, { filename: 'site/presentation-contract.js' });
  return context.HairGrowthPresentationContract;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function fill(template, facts) {
  return template.replace(/\{([a-z][a-zA-Z0-9]*)\}/g, (_match, name) => String(facts[name]));
}

function scheduleRule(overrides = {}) {
  const base = {
    id: 'weekday-default',
    label: 'Weekday default',
    enabled: true,
    priority: 0,
    startDate: '',
    endDate: '',
    start: '09:00',
    end: '17:00',
    everyDay: true,
    days: [],
    settings: {
      language: 'unchanged',
      theme: 'dark',
      density: 'comfortable',
      accent: '#123456',
      fontScale: 1,
      motion: 'full'
    },
    source: { kind: 'local', url: '', entityId: '' },
    createdAt: '2026-08-25T12:00:00Z'
  };
  return {
    ...base,
    ...overrides,
    days: overrides.days ? [...overrides.days] : [...base.days],
    settings: overrides.settings ? { ...overrides.settings } : { ...base.settings },
    source: overrides.source ? { ...overrides.source } : { ...base.source }
  };
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function assertRuntimeBindings(source) {
  const initializationStart = source.indexOf('function initialize() {');
  const initializationCall = source.lastIndexOf('\ninitialize();');
  assert.notEqual(initializationStart, -1, 'initialize must remain defined');
  assert.ok(initializationCall > initializationStart, 'initialize must remain called after its definition');
  const initialization = source.slice(initializationStart, initializationCall);
  const requiredInitializationCalls = [
    "window.addEventListener('storage', handleSchoolStorageEvent);",
    "window.removeEventListener('storage', handleSchoolStorageEvent);",
    "speechSynthesis.addEventListener?.('voiceschanged', scheduleVoiceEnumeration);",
    "speechSynthesis.removeEventListener?.('voiceschanged', scheduleVoiceEnumeration);",
    'scheduleVoiceEnumeration();'
  ];
  for (const call of requiredInitializationCalls) {
    assert.equal(countOccurrences(initialization, call), 1, `runtime call boundary must occur once: ${call}`);
  }
  assert.equal(countOccurrences(source, 'quietMode: state.settings.attention.lowStim'), 1, 'low stimulation must use the startup predicate quietMode field');

  const queueStart = source.indexOf('function queueNarrationTracks(');
  const queueEnd = source.indexOf('\nfunction narrate(', queueStart);
  assert.notEqual(queueStart, -1, 'the narration queue caller must remain defined');
  assert.ok(queueEnd > queueStart, 'the narration queue caller boundary must remain complete');
  const queueCaller = source.slice(queueStart, queueEnd);
  for (const call of [
    'const admission = PresentationContract.evaluateNarrationAdmission({',
    'lastAcceptedAt: lastNarrationAcceptedAt,',
    'lastAcceptedAtByCategory',
    'if (!admission.allowed) return;',
    'lastNarrationAcceptedAt = now;',
    'lastNarrationAcceptedAtByCategory[presentationCategory] = now;'
  ]) {
    assert.equal(countOccurrences(queueCaller, call), 1, `narration admission boundary must occur once: ${call}`);
  }

  const scheduleStart = source.indexOf('function updateScheduledOverrides(');
  const scheduleEnd = source.indexOf('\nfunction applySchedules(', scheduleStart);
  assert.notEqual(scheduleStart, -1, 'the schedule evaluation caller must remain defined');
  assert.ok(scheduleEnd > scheduleStart, 'the schedule evaluation caller boundary must remain complete');
  const scheduleCaller = source.slice(scheduleStart, scheduleEnd);
  for (const call of [
    'active: value.active === true,',
    'settings: value.settings',
    'PresentationContract.evaluateScheduleRules(state.schedules, { now, timeZone: browserTimezone(), sourceStates })',
    'scheduledOverrides = winner ? { ...evaluation.settings } : {};'
  ]) {
    assert.equal(countOccurrences(scheduleCaller, call), 1, `schedule source boundary must occur once: ${call}`);
  }
  assert.doesNotMatch(scheduleCaller, /scheduleSourceStates\.get\(winner\.id\)\?\.settings/, 'the runtime must not bypass evaluated API settings');
}

const contract = loadContract();

test('installs the complete frozen browser presentation contract with exact defaults', () => {
  assert.ok(contract);
  assert.ok(Object.isFrozen(contract));
  assert.match(contractSource, /^  const LANGUAGE_MODES = Object\.freeze\(\['en', 'yue', 'both'\]\);$/m);
  assert.deepEqual([...contract.LANGUAGE_MODES], ['en', 'yue', 'both']);
  assert.deepEqual([...contract.FUNNY_LEVELS], [1, 2, 3, 4, 5]);
  assert.deepEqual([...contract.MESSAGE_CATEGORIES], [
    'informational',
    'success',
    'progress',
    'warning',
    'error',
    'destructive',
    'security',
    'accessibility'
  ]);
  assert.equal(contract.SCHEDULE_SCHEMA_VERSION, 1);
  assert.equal(contract.NARRATION_DEBOUNCE_MS, 250);
  assert.deepEqual(plain(contract.NARRATION_COOLDOWNS_MS), {
    informational: 5000,
    success: 3000,
    progress: 5000,
    warning: 5000,
    error: 0,
    destructive: 1000,
    security: 1000,
    accessibility: 2000
  });
  assert.deepEqual([...contract.ATTENTION_MODE_KEYS], ['focus', 'lowStim', 'time', 'one', 'momentum']);
  assert.deepEqual(plain(contract.ATTENTION_DEFAULTS), {
    focus: false,
    lowStim: false,
    time: false,
    one: false,
    momentum: false,
    nextAction: '',
    snoozedUntil: 0
  });
});

test('normalizes exact language modes and independent funny levels with School forcing English', () => {
  assert.equal(contract.normalizeLanguageMode('en'), 'en');
  assert.equal(contract.normalizeLanguageMode('yue'), 'yue');
  assert.equal(contract.normalizeLanguageMode('both'), 'both');
  assert.equal(contract.normalizeLanguageMode('YUE'), 'en');
  assert.equal(contract.normalizeLanguageMode('both', { schoolActive: true }), 'en');

  assert.equal(contract.normalizeFunnyLevel(1), 1);
  assert.equal(contract.normalizeFunnyLevel(5), 5);
  assert.equal(contract.normalizeFunnyLevel(0), 1);
  assert.equal(contract.normalizeFunnyLevel(6), 5);
  assert.equal(contract.normalizeFunnyLevel(2.5), 3);
  assert.equal(contract.normalizeFunnyLevel('4'), 4);
  assert.equal(contract.normalizeFunnyLevel('not-a-number', 2), 2);

  const independent = plain(contract.resolveMessage('warning.review', {
    language: 'both',
    funnyEn: 1,
    funnyYue: 5,
    facts: { item: 'growth estimate', reason: 'the input changed' }
  }));
  assert.equal(independent.tracks[0].text, 'Review growth estimate. Reason: the input changed.');
  assert.equal(independent.tracks[1].text, 'growth estimate 舉緊一面細細黃旗，請檢查，因為 the input changed。');

  const school = plain(contract.resolveMessage('informational.saved', {
    language: 'both',
    funnyEn: 2,
    funnyYue: 5,
    facts: { item: 'haircut date' },
    schoolActive: true
  }));
  assert.equal(school.language, 'en');
  assert.deepEqual(school.tracks, [{ language: 'en', text: 'haircut date was saved and is ready.' }]);
});

test('keeps every message category complete across both languages and all five levels', () => {
  const expectedIds = [
    'informational.saved',
    'success.applied',
    'progress.working',
    'warning.review',
    'error.failed',
    'destructive.confirm',
    'security.blocked',
    'accessibility.status'
  ];
  assert.deepEqual(Object.keys(contract.MESSAGE_REGISTRY), expectedIds);
  assert.equal(contract.validateMessageRegistry(), true);

  const representedCategories = new Set();
  for (const id of expectedIds) {
    const entry = contract.MESSAGE_REGISTRY[id];
    representedCategories.add(entry.category);
    assert.equal(entry.templates.en.length, 5);
    assert.equal(entry.templates.yue.length, 5);
    const expectedPlaceholders = [...entry.placeholders].sort();
    const facts = Object.fromEntries(entry.placeholders.map((name) => [name, `[${name}]`]));
    for (const language of ['en', 'yue']) {
      for (let level = 1; level <= 5; level += 1) {
        assert.deepEqual(plain(contract.extractPlaceholders(entry.templates[language][level - 1])), expectedPlaceholders);
        const resolved = plain(contract.resolveMessage(id, {
          language,
          funnyEn: level,
          funnyYue: level,
          facts
        }));
        assert.equal(resolved.category, entry.category);
        assert.equal(resolved.text, fill(entry.templates[language][level - 1], facts));
      }
    }
  }
  assert.deepEqual([...representedCategories].sort(), [...contract.MESSAGE_CATEGORIES].sort());
});

test('proves exact message and probability boundaries turn red in memory and green when restored', () => {
  const placeholderDrift = plain(contract.MESSAGE_REGISTRY);
  placeholderDrift['error.failed'].templates.yue[4] = placeholderDrift['error.failed'].templates.yue[4].replace('下一步：{action}。', '請再試。');
  assert.throws(() => contract.validateMessageRegistry(placeholderDrift), /changes factual placeholders/);

  const missingMessage = plain(contract.MESSAGE_REGISTRY);
  delete missingMessage['security.blocked'];
  assert.throws(() => contract.validateMessageRegistry(missingMessage), /hand-written inventory/);
  assert.equal(contract.validateMessageRegistry(contract.MESSAGE_REGISTRY), true);

  function assertExactProbabilityBoundary(candidate) {
    assert.equal(candidate.shouldShowStartupSurprise({ draw: 0.099999999 }), true);
    assert.equal(candidate.shouldShowStartupSurprise({ draw: 0.10 }), false);
  }

  const widenedSource = contractSource.replace('draw < 0.10', 'draw <= 0.10');
  assert.notEqual(widenedSource, contractSource);
  assert.throws(() => assertExactProbabilityBoundary(loadContract(widenedSource)));
  assert.doesNotThrow(() => assertExactProbabilityBoundary(contract));
});

test('normalizes the shared renameable School record and all suppression decisions', () => {
  assert.deepEqual(plain(contract.normalizeSchoolRecord()), {
    schemaVersion: 1,
    enabled: false,
    displayName: 'School mode',
    revision: 0,
    updatedAt: null
  });

  const renamed = plain(contract.normalizeSchoolRecord({
    schemaVersion: 1,
    enabled: true,
    displayName: '  Study mode  ',
    revision: 12,
    updatedAt: '2026-08-25T12:34:56Z'
  }));
  assert.deepEqual(renamed, {
    schemaVersion: 1,
    enabled: true,
    displayName: 'Study mode',
    revision: 12,
    updatedAt: '2026-08-25T12:34:56Z'
  });

  assert.deepEqual(plain(contract.getSchoolSuppression(renamed)), {
    active: true,
    forceLanguage: 'en',
    suppressCantonese: true,
    suppressBilingual: true,
    suppressFunnyLevels: true,
    suppressPersonalVocabulary: true,
    suppressDimSum: true,
    suppressPrivateVocabulary: true
  });
  assert.deepEqual(plain(contract.getSchoolSuppression({ schemaVersion: 1, enabled: false })), {
    active: false,
    forceLanguage: null,
    suppressCantonese: false,
    suppressBilingual: false,
    suppressFunnyLevels: false,
    suppressPersonalVocabulary: false,
    suppressDimSum: false,
    suppressPrivateVocabulary: false
  });
  assert.equal(contract.normalizeSchoolRecord({ schemaVersion: 1, displayName: 'bad\u0000name' }).displayName, 'School mode');
  assert.equal(contract.normalizeSchoolRecord({ schemaVersion: 2, enabled: true, displayName: 'Hidden' }).enabled, false);
});

test('normalizes narrator choices, yields explicitly, serializes tracks, and replaces queued categories', () => {
  assert.deepEqual(plain(contract.normalizeNarratorSettings()), {
    schemaVersion: 1,
    enabled: false,
    language: 'en',
    voiceURIEn: 'auto',
    voiceURIYue: 'auto',
    rate: 1,
    pitch: 1,
    assistiveTechnologyActive: false,
    quietHours: false,
    reducedSound: false
  });

  const voiceURIEn = 'urn:voice:engine:english-primary';
  const voiceURIYue = 'urn:voice:engine:cantonese-primary';
  const normalized = plain(contract.normalizeNarratorSettings({
    schemaVersion: 1,
    enabled: true,
    language: 'both',
    voiceURIEn,
    voiceURIYue,
    rate: 20,
    pitch: -1,
    assistiveTechnologyActive: false,
    quietHours: false,
    reducedSound: false
  }));
  assert.equal(normalized.voiceURIEn, voiceURIEn);
  assert.equal(normalized.voiceURIYue, voiceURIYue);
  assert.equal(normalized.rate, 10);
  assert.equal(normalized.pitch, 0);
  assert.equal(contract.shouldYieldNarration(normalized), false);
  assert.equal(contract.shouldYieldNarration({ ...normalized, enabled: false }), true);
  assert.equal(contract.shouldYieldNarration({ ...normalized, assistiveTechnologyActive: true }), true);
  assert.equal(contract.shouldYieldNarration({ ...normalized, quietHours: true }), true);
  assert.equal(contract.shouldYieldNarration({ ...normalized, reducedSound: true }), true);
  assert.equal(contract.normalizeNarratorSettings({ schemaVersion: 2, enabled: true }).enabled, false);
  assert.equal(contract.normalizeNarratorSettings({ voiceURIEn: 'bad\u0000voice' }).voiceURIEn, 'auto');

  assert.deepEqual(plain(contract.buildNarrationTracks({
    language: 'both',
    englishText: ' English first. ',
    cantoneseText: ' 廣東話第二。 '
  })), [
    { language: 'en', text: 'English first.' },
    { language: 'yue', text: '廣東話第二。' }
  ]);
  assert.deepEqual(plain(contract.buildNarrationTracks({
    language: 'both',
    englishText: 'English only at school.',
    cantoneseText: '唔會讀出。',
    schoolActive: true
  })), [{ language: 'en', text: 'English only at school.' }]);

  assert.deepEqual(plain(contract.evaluateNarrationAdmission({
    category: 'informational',
    now: 10000,
    lastAcceptedAt: 9900
  })), { allowed: false, reason: 'debounce', retryAt: 10150 });
  assert.deepEqual(plain(contract.evaluateNarrationAdmission({
    category: 'informational',
    now: 10000,
    lastAcceptedAt: 9000,
    lastAcceptedAtByCategory: { informational: 8000 }
  })), { allowed: false, reason: 'cooldown', retryAt: 13000 });
  assert.deepEqual(plain(contract.evaluateNarrationAdmission({
    category: 'informational',
    now: 10000,
    lastAcceptedAt: 9750,
    lastAcceptedAtByCategory: { informational: 5000 }
  })), { allowed: true, reason: 'ready', retryAt: 10000 });
  assert.deepEqual(plain(contract.evaluateNarrationAdmission({
    category: 'error',
    now: 10000,
    lastAcceptedAt: 9999,
    lastAcceptedAtByCategory: { error: 9999 }
  })), { allowed: true, reason: 'urgent', retryAt: 10000 });
  assert.throws(() => contract.evaluateNarrationAdmission({ category: 'info', now: 10000 }), /supported category/);
  assert.throws(() => contract.evaluateNarrationAdmission({ category: 'success', now: 10000, lastAcceptedAt: 10001 }), /last narration admission time/);

  const queue = contract.replaceQueuedNarration([
    { category: 'informational', tracks: [{ language: 'en', text: 'old information' }] },
    { category: 'error', tracks: [{ language: 'en', text: 'old error' }] },
    { category: 'informational', tracks: [{ language: 'en', text: 'newer information' }] }
  ], {
    category: 'error',
    tracks: [{ language: 'en', text: 'current error' }, { language: 'yue', text: '目前錯誤' }]
  });
  assert.deepEqual(plain(queue), [
    { category: 'informational', tracks: [{ language: 'en', text: 'newer information' }] },
    { category: 'error', tracks: [{ language: 'en', text: 'current error' }, { language: 'yue', text: '目前錯誤' }] }
  ]);
  assert.ok(Object.isFrozen(queue));
  assert.ok(Object.isFrozen(queue[0].tracks));
  assert.deepEqual(plain(contract.replaceQueuedNarration(queue, {
    category: 'success',
    tracks: [{ language: 'en', text: 'done' }]
  }, { maxEntries: 1 })), [{ category: 'success', tracks: [{ language: 'en', text: 'done' }] }]);
  assert.throws(() => contract.replaceQueuedNarration([], { category: 'success', tracks: [] }), /one or two tracks/);
  assert.throws(() => contract.replaceQueuedNarration([], { category: 'success', tracks: [{ language: 'en', text: 'done' }] }, { maxEntries: 65 }), /1 to 64/);
});

test('validates bounded scheduled rules, source fields, URLs, dates, times, and entity identifiers', () => {
  const local = scheduleRule();
  assert.deepEqual(plain(contract.validateScheduleRule(local)), local);
  assert.deepEqual(plain(contract.validateScheduleRule(scheduleRule({ priority: -1000 }))).priority, -1000);
  assert.deepEqual(plain(contract.validateScheduleRule(scheduleRule({ priority: 1000 }))).priority, 1000);

  assert.equal(contract.isSafeExternalSettingsUrl('https://settings.example.test/v1'), true);
  assert.equal(contract.isSafeExternalSettingsUrl('http://localhost:3000/v1'), true);
  assert.equal(contract.isSafeExternalSettingsUrl('http://127.0.0.1:8123/api'), true);
  assert.equal(contract.isSafeExternalSettingsUrl('http://[::1]:8123/api'), true);
  assert.equal(contract.isSafeExternalSettingsUrl('http://settings.example.test/v1'), false);
  assert.equal(contract.isSafeExternalSettingsUrl('http://localhost.example.test/v1'), false);
  assert.equal(contract.isSafeExternalSettingsUrl('https://user:password@settings.example.test/v1'), false);
  assert.equal(contract.isSafeExternalSettingsUrl('https://settings.example.test/v1#private'), false);
  assert.equal(contract.isSafeExternalSettingsUrl('file:///settings.json'), false);

  const api = scheduleRule({
    id: 'api-source',
    source: { kind: 'api', url: 'https://settings.example.test/v1', entityId: '' }
  });
  assert.equal(contract.validateScheduleRule(api).source.kind, 'api');
  const homeAssistant = scheduleRule({
    id: 'home-source',
    source: { kind: 'homeAssistant', url: 'http://127.0.0.1:8123/api', entityId: 'input_boolean.hair_display' }
  });
  assert.equal(contract.validateScheduleRule(homeAssistant).source.entityId, 'input_boolean.hair_display');

  assert.throws(() => contract.validateScheduleRule(scheduleRule({ priority: 1001 })), /priority/);
  assert.throws(() => contract.validateScheduleRule(scheduleRule({ startDate: '2026-02-30' })), /real calendar date/);
  assert.throws(() => contract.validateScheduleRule(scheduleRule({ start: '24:00' })), /real clock time/);
  assert.throws(() => contract.validateScheduleRule(scheduleRule({ everyDay: false, days: [] })), /needs a weekday/);
  assert.throws(() => contract.validateScheduleRule(scheduleRule({ everyDay: false, days: [1, 1] })), /unique integers/);
  assert.throws(() => contract.validateScheduleRule(scheduleRule({ source: { kind: 'api', url: 'http://192.168.1.2/api', entityId: '' } })), /unsafe/);
  assert.throws(() => contract.validateScheduleRule(scheduleRule({ source: { kind: 'api', url: 'https://user:password@example.test/api', entityId: '' } })), /unsafe/);
  assert.throws(() => contract.validateScheduleRule(scheduleRule({ source: { kind: 'homeAssistant', url: 'https://home.example.test/api', entityId: 'sensor.hair' } })), /supported boolean entity/);
  assert.throws(() => contract.validateScheduleRule(scheduleRule({ settings: { ...local.settings, fontScale: 2.01 } })), /font scale/);
  const missingField = scheduleRule();
  delete missingField.settings.motion;
  assert.throws(() => contract.validateScheduleRule(missingField), /missing or unexpected fields/);
});

test('evaluates timezone windows, optional dates, weekdays, cross-midnight rules, and stable precedence', () => {
  const ordinary = scheduleRule({ id: 'ordinary', priority: 5 });
  const laterSamePriority = scheduleRule({
    id: 'later-same-priority',
    priority: 5,
    settings: { ...ordinary.settings, theme: 'light' }
  });
  const externalHigherPriority = scheduleRule({
    id: 'external-higher-priority',
    priority: 10,
    source: { kind: 'api', url: 'https://settings.example.test/v1', entityId: '' },
    settings: { ...ordinary.settings, theme: 'dark' }
  });

  const withoutExternal = plain(contract.evaluateScheduleRules([
    ordinary,
    laterSamePriority,
    externalHigherPriority
  ], {
    now: new Date('2026-08-25T10:00:00Z'),
    timeZone: 'UTC',
    sourceStates: { 'external-higher-priority': false }
  }));
  assert.deepEqual(withoutExternal.matchedRuleIds, ['ordinary', 'later-same-priority']);
  assert.equal(withoutExternal.activeRule.id, 'later-same-priority');
  assert.equal(withoutExternal.settings.theme, 'light');

  const withExternal = plain(contract.evaluateScheduleRules([
    ordinary,
    laterSamePriority,
    externalHigherPriority
  ], {
    now: new Date('2026-08-25T10:00:00Z'),
    timeZone: 'UTC',
    sourceStates: { 'external-higher-priority': { active: true, settings: { theme: 'contrast', language: 'yue' } } }
  }));
  assert.equal(withExternal.activeRule.id, 'external-higher-priority');
  assert.equal(withExternal.settings.theme, 'contrast');
  assert.equal(withExternal.settings.language, 'yue');
  assert.equal(withExternal.activeRule.settings.theme, 'dark');

  assert.throws(() => contract.evaluateScheduleRules([externalHigherPriority], {
    now: new Date('2026-08-25T10:00:00Z'),
    timeZone: 'UTC',
    sourceStates: { 'external-higher-priority': { active: true, settings: { unknown: true } } }
  }), /unsupported field/);

  const homeAssistant = scheduleRule({
    id: 'home-assistant-boolean',
    priority: 20,
    source: { kind: 'homeAssistant', url: 'https://home.example.test', entityId: 'binary_sensor.hair_display' },
    settings: { ...ordinary.settings, theme: 'light' }
  });
  const homeAssistantResult = plain(contract.evaluateScheduleRules([homeAssistant], {
    now: new Date('2026-08-25T10:00:00Z'),
    timeZone: 'UTC',
    sourceStates: { 'home-assistant-boolean': { active: true, settings: { theme: 'contrast' } } }
  }));
  assert.equal(homeAssistantResult.settings.theme, 'light');

  const crossMidnight = scheduleRule({
    id: 'sunday-night',
    startDate: '2026-08-23',
    endDate: '2026-08-23',
    start: '22:00',
    end: '06:00',
    everyDay: false,
    days: [0]
  });
  assert.equal(plain(contract.evaluateScheduleRules([crossMidnight], {
    now: new Date('2026-08-24T01:00:00Z'),
    timeZone: 'UTC'
  })).activeRule.id, 'sunday-night');
  assert.equal(plain(contract.evaluateScheduleRules([crossMidnight], {
    now: new Date('2026-08-24T06:00:00Z'),
    timeZone: 'UTC'
  })).activeRule, null);

  const equalTimes = scheduleRule({
    id: 'all-day-tuesday',
    start: '08:00',
    end: '08:00',
    everyDay: false,
    days: [2]
  });
  assert.equal(plain(contract.evaluateScheduleRules([equalTimes], {
    now: new Date('2026-08-25T23:59:00Z'),
    timeZone: 'UTC'
  })).activeRule.id, 'all-day-tuesday');

  assert.deepEqual(plain(contract.evaluateScheduleRules([], {
    now: new Date('2026-08-25T10:00:00Z'),
    timeZone: 'UTC'
  })), { timeZone: 'UTC', matchedRuleIds: [], activeRule: null, settings: null });
  assert.throws(() => contract.evaluateScheduleRules([], { now: new Date('invalid'), timeZone: 'UTC' }), /valid date and time/);
  assert.throws(() => contract.evaluateScheduleRules([], { now: new Date(), timeZone: 'Not/A_Timezone' }), /valid IANA timezone/);
  assert.throws(() => contract.evaluateScheduleRules(Array.from({ length: 257 }, () => ordinary), { now: new Date(), timeZone: 'UTC' }), /at most 256/);
});

test('validates versioned API and Home Assistant response envelopes without persisting remote values', () => {
  assert.deepEqual(plain(contract.validateExternalSettingsResponse({
    schemaVersion: 1,
    active: true,
    settings: { language: 'both', density: 'compact', fontScale: 1.25 }
  })), {
    schemaVersion: 1,
    active: true,
    settings: { language: 'both', density: 'compact', fontScale: 1.25 }
  });
  assert.deepEqual(plain(contract.validateExternalSettingsResponse({ state: 'on', attributes: { friendly_name: 'Hair display' } }, { kind: 'homeAssistant' })), {
    schemaVersion: 1,
    active: true,
    settings: {}
  });
  assert.deepEqual(plain(contract.validateExternalSettingsResponse({ state: 'off' }, { kind: 'homeAssistant' })), {
    schemaVersion: 1,
    active: false,
    settings: {}
  });
  assert.throws(() => contract.validateExternalSettingsResponse({ schemaVersion: 2, active: true, settings: {} }), /schema version/);
  assert.throws(() => contract.validateExternalSettingsResponse({ schemaVersion: 1, active: true, settings: {}, extra: true }), /unexpected fields/);
  assert.throws(() => contract.validateExternalSettingsResponse({ schemaVersion: 1, active: true, settings: { unknown: true } }), /unsupported field/);
  assert.throws(() => contract.validateExternalSettingsResponse({ state: 'unknown' }, { kind: 'homeAssistant' }), /on or off/);
  assert.throws(() => contract.validateExternalSettingsResponse({}, { kind: 'other' }), /unsupported/);
});

test('uses an exact startup draw below ten percent and applies every suppression condition', () => {
  assert.match(contractSource, /^      && draw < 0\.10$/m);
  assert.equal(contract.shouldShowStartupSurprise({ draw: 0 }), true);
  assert.equal(contract.shouldShowStartupSurprise({ draw: 0.099999999 }), true);
  assert.equal(contract.shouldShowStartupSurprise({ draw: 0.10 }), false);
  assert.equal(contract.shouldShowStartupSurprise({ draw: -0.001 }), false);
  assert.equal(contract.shouldShowStartupSurprise({ draw: Number.NaN }), false);
  for (const suppression of [
    'firstRun',
    'errorPath',
    'updatePath',
    'midTask',
    'schoolActive',
    'alreadyShown',
    'quietMode'
  ]) {
    assert.equal(contract.shouldShowStartupSurprise({ draw: 0.05, [suppression]: true }), false, suppression);
  }
});

test('keeps all five attention accommodations independent and off by default with bounded state', () => {
  assert.deepEqual(plain(contract.normalizeAttentionSettings()), plain(contract.ATTENTION_DEFAULTS));
  for (const enabledKey of contract.ATTENTION_MODE_KEYS) {
    const normalized = plain(contract.normalizeAttentionSettings({ [enabledKey]: true }));
    for (const key of contract.ATTENTION_MODE_KEYS) {
      assert.equal(normalized[key], key === enabledKey, `${enabledKey} must not enable ${key}`);
    }
  }
  assert.equal(contract.normalizeAttentionSettings({ focus: 1 }).focus, false);
  assert.equal(contract.normalizeAttentionSettings({ nextAction: '  Measure hair length  ' }).nextAction, 'Measure hair length');
  assert.equal(contract.normalizeAttentionSettings({ nextAction: 'x'.repeat(161) }).nextAction, '');
  assert.equal(contract.normalizeAttentionSettings({ nextAction: 'bad\u0000value' }).nextAction, '');
  assert.equal(contract.normalizeAttentionSettings({ snoozedUntil: Number.MAX_SAFE_INTEGER }).snoozedUntil, Number.MAX_SAFE_INTEGER);
  assert.equal(contract.normalizeAttentionSettings({ snoozedUntil: -1 }).snoozedUntil, 0);
  assert.equal(contract.normalizeAttentionSettings({ snoozedUntil: 1.5 }).snoozedUntil, 0);
});

test('pins School storage, narrator admission, scheduled API values, voice retry, and startup quiet mode with red-to-green source proof', () => {
  assert.doesNotThrow(() => assertRuntimeBindings(appSource));
  const mutations = [
    ["window.addEventListener('storage', handleSchoolStorageEvent);", "window.addEventListener('storage', handleStateStorageEvent);"],
    ["window.removeEventListener('storage', handleSchoolStorageEvent);", "window.removeEventListener('storage', handleStateStorageEvent);"],
    ["speechSynthesis.addEventListener?.('voiceschanged', scheduleVoiceEnumeration);", "speechSynthesis.addEventListener?.('voiceschanged', populateVoices);"],
    ["speechSynthesis.removeEventListener?.('voiceschanged', scheduleVoiceEnumeration);", "speechSynthesis.removeEventListener?.('voiceschanged', populateVoices);"],
    ['  scheduleVoiceEnumeration();', '  populateVoices();'],
    ['quietMode: state.settings.attention.lowStim', 'quiet: state.settings.attention.lowStim'],
    ['const admission = PresentationContract.evaluateNarrationAdmission({', 'const admission = PresentationContract.replaceQueuedNarration({'],
    ['lastAcceptedAt: lastNarrationAcceptedAt,', 'lastAcceptedAt: null,'],
    ['lastNarrationAcceptedAt = now;', 'lastNarrationAcceptedAt = null;'],
    ['lastNarrationAcceptedAtByCategory[presentationCategory] = now;', 'delete lastNarrationAcceptedAtByCategory[presentationCategory];'],
    ['settings: value.settings', 'settings: {}'],
    ['scheduledOverrides = winner ? { ...evaluation.settings } : {};', 'scheduledOverrides = winner ? { ...winner.settings } : {};']
  ];
  for (const [current, broken] of mutations) {
    const mutated = appSource.replace(current, broken);
    assert.notEqual(mutated, appSource, `deliberate mutation must change ${current}`);
    assert.throws(() => assertRuntimeBindings(mutated), undefined, `deliberate mutation must fail ${current}`);
  }
  assert.doesNotThrow(() => assertRuntimeBindings(appSource));
});
