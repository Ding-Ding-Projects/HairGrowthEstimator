'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function scheduleCore() {
  return require('../../app/core/scheduled-settings');
}

function localRule(overrides = {}) {
  return {
    id: 'work-hours',
    label: 'Work hours',
    enabled: true,
    priority: 10,
    startDate: null,
    endDate: null,
    startTime: '09:00',
    endTime: '17:00',
    dayMode: 'weekdays',
    weekdays: [1, 2, 3, 4, 5],
    timezone: 'UTC',
    source: {
      type: 'local',
      settings: { theme: 'light', language: 'en' }
    },
    ...overrides
  };
}

function scheduleDocument(rules, overrides = {}) {
  return {
    schemaVersion: 1,
    rules,
    ...overrides
  };
}

function apiSource(overrides = {}) {
  return {
    type: 'api',
    url: 'https://settings.example.test/v1/current?profile=work',
    timeoutMs: 8000,
    refreshIntervalMs: 60000,
    maxResponseBytes: 32768,
    redirectPolicy: 'error',
    ...overrides
  };
}

function homeAssistantSource(overrides = {}) {
  return {
    type: 'home-assistant',
    baseUrl: 'https://home.example.test/',
    entityId: 'input_boolean.hair_work_mode',
    credentialRef: 'home-assistant:primary',
    settings: { theme: 'contrast' },
    timeoutMs: 8000,
    refreshIntervalMs: 60000,
    maxResponseBytes: 32768,
    redirectPolicy: 'error',
    ...overrides
  };
}

test('exports the versioned schedule contract and explicit time-window semantics', () => {
  const core = scheduleCore();
  assert.equal(core.SCHEDULE_SCHEMA_VERSION, 1);
  assert.deepEqual(core.SCHEDULE_SOURCE_TYPES, ['local', 'api', 'home-assistant']);
  assert.equal(core.ALLOWED_SOURCE_TYPES, core.SCHEDULE_SOURCE_TYPES);
  assert.equal(core.SOURCE_TYPES, core.SCHEDULE_SOURCE_TYPES);
  assert.equal(core.ALLOWED_SETTING_FIELDS.includes('language'), true);
  assert.equal(core.ALLOWED_SETTING_FIELDS.includes('theme'), true);
  for (const name of [
    'normalizeScheduleRule',
    'isRuleActive',
    'chooseWinningRules',
    'validateSourceResult',
    'canonicalSourceScope'
  ]) {
    assert.equal(typeof core[name], 'function', `${name} must be exported`);
  }
  assert.equal(core.SCHEDULE_SEMANTICS.equalTimes, 'full-day');
  assert.equal(core.SCHEDULE_SEMANTICS.endBoundary, 'exclusive');
  assert.equal(core.SCHEDULE_SEMANTICS.crossMidnightWeekday, 'start-day');
  assert.equal(core.SCHEDULE_SEMANTICS.precedence, 'higher-priority-then-later-rule');

  const normalized = core.normalizeScheduleRule({
    id: 'defaults',
    label: 'Defaults',
    timezone: 'UTC',
    source: { type: 'local', settings: {} }
  });
  assert.deepEqual(
    {
      enabled: normalized.enabled,
      priority: normalized.priority,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      dayMode: normalized.dayMode,
      weekdays: normalized.weekdays
    },
    {
      enabled: true,
      priority: 0,
      startDate: null,
      endDate: null,
      startTime: '00:00',
      endTime: '00:00',
      dayMode: 'every-day',
      weekdays: []
    }
  );
});

test('validates a bounded document without changing stable identifiers or source values', () => {
  const { validateScheduleDocument } = scheduleCore();
  const input = scheduleDocument([localRule()]);
  const validated = validateScheduleDocument(input);
  assert.deepEqual(validated, input);
  assert.notEqual(validated, input);
  assert.notEqual(validated.rules[0], input.rules[0]);
  assert.equal(Object.isFrozen(validated), true);
  assert.equal(Object.isFrozen(validated.rules[0].source.settings), true);
});

test('rejects unsupported versions, oversized documents, duplicate IDs, and unknown fields', () => {
  const { validateScheduleDocument } = scheduleCore();
  assert.throws(() => validateScheduleDocument(scheduleDocument([], { schemaVersion: 2 })), /schema version/i);
  assert.throws(() => validateScheduleDocument({ ...scheduleDocument([]), extra: true }), /unknown field/i);
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule(), localRule({ label: 'Duplicate' })])),
    /duplicate schedule rule ID/i
  );
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ label: 'x'.repeat(121) })])),
    /at most 120/i
  );
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ label: 'x'.repeat(70000) })])),
    /65536 bytes/i
  );
  assert.throws(
    () => validateScheduleDocument(scheduleDocument(Array.from({ length: 129 }, (_, index) => localRule({ id: `rule-${index}` })))),
    /at most 128 rules/i
  );
});

test('rejects an entire document when any rule is only partially valid', () => {
  const { validateScheduleDocument } = scheduleCore();
  const valid = localRule();
  const partial = localRule({ id: 'partial', source: { type: 'local' } });
  assert.throws(() => validateScheduleDocument(scheduleDocument([valid, partial])), /settings/i);
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([valid, localRule({ id: 'empty-date', startDate: '' })])),
    /calendar date/i
  );
});

test('validates calendar dates, clock times, date order, and explicit IANA timezones', () => {
  const { isRuleActive, validateScheduleDocument } = scheduleCore();
  assert.throws(() => validateScheduleDocument(scheduleDocument([localRule({ startDate: '2026-02-30' })])), /calendar date/i);
  assert.throws(() => validateScheduleDocument(scheduleDocument([localRule({ startTime: '24:00' })])), /HH:mm/i);
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ startDate: '2026-08-26', endDate: '2026-08-25' })])),
    /start date.*end date/i
  );
  assert.throws(() => validateScheduleDocument(scheduleDocument([localRule({ timezone: 'Moon/Sea' })])), /IANA timezone/i);
  assert.equal(validateScheduleDocument(scheduleDocument([localRule({ timezone: 'America/Toronto' })])).rules[0].timezone, 'America/Toronto');
  const torontoMorning = localRule({
    timezone: 'America/Toronto',
    dayMode: 'every-day',
    weekdays: [],
    startTime: '09:00',
    endTime: '10:00'
  });
  assert.equal(isRuleActive(torontoMorning, new Date('2026-08-24T12:59:59.000Z')), false);
  assert.equal(isRuleActive(torontoMorning, new Date('2026-08-24T13:00:00.000Z')), true);
  assert.equal(isRuleActive(torontoMorning, new Date('2026-01-05T14:00:00.000Z')), true);
});

test('distinguishes every day from an explicit weekday set and gives empty sets no matches', () => {
  const { matchesScheduleRule, validateScheduleDocument } = scheduleCore();
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ dayMode: 'every-day', weekdays: [1] })])),
    /must be empty/i
  );
  const everyDay = localRule({ dayMode: 'every-day', weekdays: [], startTime: '00:00', endTime: '23:59' });
  const empty = localRule({ dayMode: 'weekdays', weekdays: [] });
  assert.equal(matchesScheduleRule(everyDay, new Date('2026-08-23T12:00:00.000Z')), true);
  assert.equal(matchesScheduleRule(empty, new Date('2026-08-24T12:00:00.000Z')), false);
});

test('treats equal start and end times as a full day with inclusive date bounds', () => {
  const { matchesScheduleRule } = scheduleCore();
  const rule = localRule({
    startDate: '2026-08-24',
    endDate: '2026-08-24',
    startTime: '09:00',
    endTime: '09:00',
    weekdays: [1]
  });
  assert.equal(matchesScheduleRule(rule, new Date('2026-08-24T00:00:00.000Z')), true);
  assert.equal(matchesScheduleRule(rule, new Date('2026-08-24T23:59:59.000Z')), true);
  assert.equal(matchesScheduleRule(rule, new Date('2026-08-25T00:00:00.000Z')), false);
});

test('cross-midnight windows use the start day and keep their final boundary exclusive', () => {
  const { matchesScheduleRule } = scheduleCore();
  const rule = localRule({
    startDate: '2026-08-24',
    endDate: '2026-08-24',
    startTime: '22:00',
    endTime: '02:00',
    weekdays: [1]
  });
  assert.equal(matchesScheduleRule(rule, new Date('2026-08-24T21:59:59.000Z')), false);
  assert.equal(matchesScheduleRule(rule, new Date('2026-08-24T22:00:00.000Z')), true);
  assert.equal(matchesScheduleRule(rule, new Date('2026-08-25T01:59:59.000Z')), true);
  assert.equal(matchesScheduleRule(rule, new Date('2026-08-25T02:00:00.000Z')), false);
});

test('resolves deterministic precedence while retaining an unchanged base fallback', () => {
  const { resolveScheduledSettings } = scheduleCore();
  const base = { theme: 'dark', language: 'yue', density: 'comfortable' };
  const rules = [
    localRule({ id: 'high', priority: 20, source: { type: 'local', settings: { theme: 'contrast' } } }),
    localRule({ id: 'low-later', priority: 10, source: { type: 'local', settings: { theme: 'light', language: 'en' } } }),
    localRule({ id: 'high-later', priority: 20, source: { type: 'local', settings: { language: 'bilingual' } } }),
    localRule({ id: 'disabled', enabled: false, priority: 100, source: { type: 'local', settings: { density: 'compact' } } })
  ];
  const result = resolveScheduledSettings(scheduleDocument(rules), new Date('2026-08-24T12:00:00.000Z'), base);
  assert.deepEqual(result.settings, { theme: 'contrast', language: 'bilingual', density: 'comfortable' });
  assert.deepEqual(result.matchedRuleIds, ['low-later', 'high', 'high-later']);
  assert.deepEqual(result.appliedRuleIds, ['low-later', 'high', 'high-later']);
  assert.deepEqual(base, { theme: 'dark', language: 'yue', density: 'comfortable' });

  const fallback = resolveScheduledSettings(scheduleDocument([]), new Date('2026-08-24T12:00:00.000Z'), base);
  assert.deepEqual(fallback.settings, base);
  assert.deepEqual(fallback.appliedRuleIds, []);
});

test('rejects unknown setting fields and validates every supported value', () => {
  const { validateScheduleDocument } = scheduleCore();
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ source: { type: 'local', settings: { secretSetting: true } } })])),
    /unknown setting field/i
  );
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ source: { type: 'local', settings: { accent: 'green' } } })])),
    /accent/i
  );
  const settings = {
    displayName: 'Hair Length',
    language: 'bilingual',
    theme: 'contrast',
    density: 'spacious',
    accent: '#12aBcD',
    tabDock: 'right',
    funnyEnglish: 1,
    funnyCantonese: 5,
    showDialogEmoji: false,
    reducedMotion: true,
    fontFamily: 'Noto Sans',
    fontScale: 1.25,
    fontWeight: 600,
    rainbowSpeedLevel: 4
  };
  assert.deepEqual(validateScheduleDocument(scheduleDocument([localRule({ source: { type: 'local', settings } })])).rules[0].source.settings, settings);
});

test('allows HTTPS and exact loopback HTTP URLs while rejecting unsafe URL forms', () => {
  const { validateExternalUrl } = scheduleCore();
  assert.equal(validateExternalUrl('https://settings.example.test/path?profile=work'), 'https://settings.example.test/path?profile=work');
  assert.equal(validateExternalUrl('http://localhost:8123/'), 'http://localhost:8123/');
  assert.equal(validateExternalUrl('http://127.9.8.7:8123/'), 'http://127.9.8.7:8123/');
  assert.equal(validateExternalUrl('http://[::1]:8123/'), 'http://[::1]:8123/');
  assert.throws(() => validateExternalUrl(' https://settings.example.test/'), /whitespace/i);
  assert.throws(() => validateExternalUrl('http://localhost.example.test/'), /HTTPS.*loopback/i);
  assert.throws(() => validateExternalUrl('http://192.168.1.4/'), /HTTPS.*loopback/i);
  assert.throws(() => validateExternalUrl('https://owner:secret@settings.example.test/'), /embedded credentials/i);
  assert.throws(() => validateExternalUrl('https://settings.example.test/#private'), /fragment/i);
  assert.throws(() => validateExternalUrl('file:///tmp/settings.json'), /HTTPS.*loopback/i);
});

test('declares bounded no-redirect request descriptors for API and Home Assistant sources', () => {
  const { canonicalSourceScope, createExternalRequestDescriptor, validateScheduleDocument } = scheduleCore();
  const api = validateScheduleDocument(scheduleDocument([localRule({ source: apiSource() })])).rules[0];
  assert.equal(canonicalSourceScope(api), 'api:https://settings.example.test/v1/current?profile=work');
  assert.deepEqual(createExternalRequestDescriptor(api), {
    url: 'https://settings.example.test/v1/current?profile=work',
    method: 'GET',
    redirect: 'error',
    credentials: 'omit',
    timeoutMs: 8000,
    maxResponseBytes: 32768,
    headers: { accept: 'application/json' }
  });

  const home = validateScheduleDocument(scheduleDocument([localRule({ source: homeAssistantSource() })])).rules[0];
  assert.equal(
    canonicalSourceScope(home),
    'home-assistant:https://home.example.test/|input_boolean.hair_work_mode|home-assistant:primary'
  );
  assert.deepEqual(createExternalRequestDescriptor(home), {
    url: 'https://home.example.test/api/states/input_boolean.hair_work_mode',
    method: 'GET',
    redirect: 'error',
    credentials: 'omit',
    timeoutMs: 8000,
    maxResponseBytes: 32768,
    headers: { accept: 'application/json' },
    credentialRef: 'home-assistant:primary'
  });
});

test('rejects unsafe redirects, unbounded source configuration, and unsafe Home Assistant identities', () => {
  const { validateScheduleDocument } = scheduleCore();
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ source: apiSource({ redirectPolicy: 'follow' }) })])),
    /redirect policy.*error/i
  );
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ source: apiSource({ timeoutMs: 0 }) })])),
    /timeout/i
  );
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ source: { ...apiSource(), headers: { authorization: 'x' } } })])),
    /unknown field/i
  );
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ source: apiSource({ maxResponseBytes: 1000000 }) })])),
    /response.*bytes/i
  );
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ source: homeAssistantSource({ entityId: 'sensor.front_door' }) })])),
    /binary_sensor or input_boolean/i
  );
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ source: homeAssistantSource({ entityId: 'input_boolean.good/path' }) })])),
    /entity ID/i
  );
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ source: homeAssistantSource({ baseUrl: 'https://home.example.test/?access_token=x' }) })])),
    /base URL.*query string/i
  );
  assert.throws(
    () => validateScheduleDocument(scheduleDocument([localRule({ source: { ...homeAssistantSource(), accessToken: 'not-allowed' } })])),
    /unknown field/i
  );
});

test('validates versioned API and Home Assistant payloads without partial application', () => {
  const { validateScheduleDocument, validateSourceResult } = scheduleCore();
  const apiRule = validateScheduleDocument(scheduleDocument([localRule({ id: 'api', source: apiSource() })])).rules[0];
  const apiResult = validateSourceResult(
    apiRule,
    { schemaVersion: 1, settings: { theme: 'contrast', accent: '#112233' } },
    { generation: 4, receivedAt: '2026-08-25T01:02:03.000Z' }
  );
  assert.deepEqual(apiResult, {
    schemaVersion: 1,
    ruleId: 'api',
    sourceScope: 'api:https://settings.example.test/v1/current?profile=work',
    generation: 4,
    active: true,
    settings: { theme: 'contrast', accent: '#112233' },
    receivedAt: '2026-08-25T01:02:03.000Z'
  });
  assert.throws(
    () => validateSourceResult(apiRule, { schemaVersion: 2, settings: { theme: 'light' } }, { generation: 5 }),
    /schema version/i
  );
  assert.throws(
    () => validateSourceResult(apiRule, { schemaVersion: 1, settings: { unknown: true } }, { generation: 5 }),
    /unknown setting field/i
  );
  assert.throws(
    () => validateSourceResult(apiRule, { schemaVersion: 1, settings: { theme: 'light' }, partial: true }, { generation: 5 }),
    /unknown field/i
  );

  const homeRule = validateScheduleDocument(scheduleDocument([localRule({ id: 'home', source: homeAssistantSource() })])).rules[0];
  assert.equal(
    validateSourceResult(homeRule, { entity_id: 'input_boolean.hair_work_mode', state: 'on', attributes: {} }, { generation: 2 }).active,
    true
  );
  const inactive = validateSourceResult(
    homeRule,
    { entity_id: 'input_boolean.hair_work_mode', state: 'off', attributes: {} },
    { generation: 3 }
  );
  assert.equal(inactive.active, false);
  assert.deepEqual(inactive.settings, {});
  assert.throws(
    () => validateSourceResult(homeRule, { entity_id: 'input_boolean.other', state: 'on', attributes: {} }, { generation: 4 }),
    /does not match/i
  );
});

test('bounds external payload bytes before parsing their settings', () => {
  const { validateScheduleDocument, validateSourceResult } = scheduleCore();
  const rule = validateScheduleDocument(scheduleDocument([
    localRule({ id: 'small-api', source: apiSource({ maxResponseBytes: 256 }) })
  ])).rules[0];
  assert.throws(
    () => validateSourceResult(rule, { schemaVersion: 1, settings: { displayName: 'x'.repeat(300) } }, { generation: 1 }),
    /response.*256 bytes/i
  );
});

test('monotonic generations keep stale external responses from winning', () => {
  const { nextSourceGeneration, selectNewestSourceResult } = scheduleCore();
  assert.equal(nextSourceGeneration(0), 1);
  assert.equal(nextSourceGeneration(41), 42);
  assert.throws(() => nextSourceGeneration(Number.MAX_SAFE_INTEGER), /generation/i);

  const scope = 'api:https://settings.example.test/v1/current?profile=work';
  const older = Object.freeze({ schemaVersion: 1, ruleId: 'api', sourceScope: scope, generation: 3, active: true, settings: { theme: 'light' }, receivedAt: '2026-08-25T01:00:00.000Z' });
  const newer = Object.freeze({ schemaVersion: 1, ruleId: 'api', sourceScope: scope, generation: 4, active: true, settings: { theme: 'contrast' }, receivedAt: '2026-08-25T01:00:01.000Z' });
  assert.equal(selectNewestSourceResult(newer, older), newer);
  assert.equal(selectNewestSourceResult(older, newer), newer);
  assert.equal(selectNewestSourceResult(newer, { ...newer, settings: { theme: 'dark' } }), newer);
  assert.throws(() => selectNewestSourceResult(newer, { ...newer, ruleId: 'other', generation: 5 }), /same rule/i);
  assert.throws(
    () => selectNewestSourceResult(newer, { ...newer, sourceScope: 'api:https://old.example.test/', generation: 5 }),
    /same canonical source scope/i
  );
});

test('external rules apply only a current active result and otherwise preserve base settings', () => {
  const { resolveScheduledSettings, validateScheduleDocument, validateSourceResult } = scheduleCore();
  const document = validateScheduleDocument(scheduleDocument([
    localRule({ id: 'api', source: apiSource(), priority: 10 }),
    localRule({ id: 'home', source: homeAssistantSource(), priority: 20 })
  ]));
  const base = { theme: 'dark', language: 'en' };
  const noResults = resolveScheduledSettings(document, new Date('2026-08-24T12:00:00.000Z'), base);
  assert.deepEqual(noResults.settings, base);
  assert.deepEqual(noResults.appliedRuleIds, []);

  const api = validateSourceResult(document.rules[0], { schemaVersion: 1, settings: { theme: 'light' } }, { generation: 2 });
  const homeOff = validateSourceResult(
    document.rules[1],
    { entity_id: 'input_boolean.hair_work_mode', state: 'off', attributes: {} },
    { generation: 7 }
  );
  const staleScope = resolveScheduledSettings(document, new Date('2026-08-24T12:00:00.000Z'), base, {
    api: { ...api, sourceScope: 'api:https://old.example.test/', generation: 99 },
    home: homeOff
  });
  assert.deepEqual(staleScope.settings, base);
  assert.deepEqual(staleScope.appliedRuleIds, []);

  const resolved = resolveScheduledSettings(document, new Date('2026-08-24T12:00:00.000Z'), base, { api, home: homeOff });
  assert.deepEqual(resolved.settings, { theme: 'light', language: 'en' });
  assert.deepEqual(resolved.appliedRuleIds, ['api']);
});
