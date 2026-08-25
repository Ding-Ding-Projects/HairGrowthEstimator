'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const html = read('app', 'renderer', 'index.html');
const renderer = read('app', 'renderer', 'app.js');
const styles = read('app', 'renderer', 'styles.css');
const main = read('app', 'main.js');
const preload = read('app', 'preload.js');
const state = read('app', 'core', 'state.js');
const State = require('../../app/core/state');

const L02_ARTICLE_IDS = [
  'language-presentation',
  'shared-presentation',
  'narrator',
  'scheduled-presentation',
  'attention-accommodations',
  'startup-surprise',
  'evidence-isolation'
];

test('renderer localization is catalog-driven for all three language modes and both funny levels', () => {
  assert.match(renderer, /presentation\.renderMessage\(/);
  assert.match(renderer, /presentation\.renderLiteral\(/);
  assert.match(renderer, /funnyEnglish/);
  assert.match(renderer, /funnyCantonese/);
  assert.match(renderer, /funnyEnglish: schoolRecord\?\.enabled \? 1 : effectiveSetting\('funnyEnglish'\)/);
  assert.match(renderer, /funnyCantonese: schoolRecord\?\.enabled \? 1 : effectiveSetting\('funnyCantonese'\)/);
  assert.match(renderer, /schoolRecord\?\.enabled \? 'en'/);
  assert.match(html, /id="setting-language"/);
});

test('the bundled presentation article inventory is hand-written, complete, and bilingual', () => {
  const inventoryStart = renderer.indexOf('const L02_ARTICLE_IDS = Object.freeze([');
  const docsStart = renderer.indexOf('const docs = [');
  assert.notEqual(inventoryStart, -1);
  assert.ok(docsStart > inventoryStart);
  const inventorySource = renderer.slice(inventoryStart, docsStart);

  for (const id of L02_ARTICLE_IDS) {
    assert.match(inventorySource, new RegExp(`'${id}'`), `missing ${id} from the explicit inventory`);
    const recordStart = renderer.indexOf(`id: '${id}'`, docsStart);
    assert.notEqual(recordStart, -1, `missing bundled article ${id}`);
    const nextRecord = renderer.indexOf('\n    {', recordStart + 1);
    const recordSource = renderer.slice(recordStart, nextRecord === -1 ? renderer.indexOf('\n  ];', recordStart) : nextRecord);
    assert.match(recordSource, /titleYue:/, `${id} needs a Cantonese title`);
    assert.match(recordSource, /bodyYue:/, `${id} needs a Cantonese body`);
  }

  assert.match(renderer, /for \(const articleId of L02_ARTICLE_IDS\)/);
  assert.match(renderer, /Required bundled article is missing:/);
});

test('the full hand-written presentation corpus is wired to visible and accessible renderer boundaries', () => {
  assert.match(preload, /const presentationCorpusCore = require\('\.\/core\/presentation-corpus'\)/);
  assert.match(preload, /resolveByEnglishSource: \(source, options, values\) => presentationCorpusCore\.resolvePresentationByEnglishSource\(source, options, values\)/);
  assert.match(preload, /resolveById: \(id, options, values\) => presentationCorpusCore\.resolvePresentationById\(id, options, values\)/);
  assert.match(renderer, /const PRESENTATION_ATTRIBUTES = Object\.freeze\(\[/);
  assert.match(renderer, /function applyPresentationCorpus\(/);
  assert.match(renderer, /presentation\.resolveByEnglishSource\(/);
  assert.match(renderer, /new MutationObserver\(/);
  assert.match(renderer, /applyPresentationCorpus\(document\.body\)/);
  assert.match(renderer, /parent\.hasAttribute\('data-vocabulary-owned'\) && parent\.childElementCount === 0/);
  assert.equal((renderer.match(/parent\.dataset\.presentationSourceText \|\|= record\.source;/g) || []).length, 1);
});

test('shared mode exposes credential setup and verified disable controls', () => {
  for (const id of ['school-credential-kind', 'school-credential', 'school-save', 'school-unlock']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(main, /ipcMain\.handle\('school:configure'/);
  assert.match(main, /ipcMain\.handle\('school:disable'/);
  assert.match(preload, /configure: \(value\) => ipcRenderer\.invoke\('school:configure'/);
  assert.match(preload, /disable: \(value\) => ipcRenderer\.invoke\('school:disable'/);
});

test('shared mode validates a requested display name before persisting a new credential', () => {
  const displayNameValidation = main.indexOf('const requestedDisplayName = SchoolMode.normalizeSchoolDisplayName(input?.displayName);');
  const credentialPersistence = main.indexOf('activeCredential = await writeSharedSchoolCredential(requestedKind, credential);');
  assert.notEqual(displayNameValidation, -1, 'the shared display name must be validated explicitly');
  assert.notEqual(credentialPersistence, -1, 'the shared credential persistence boundary must remain explicit');
  assert.ok(displayNameValidation < credentialPersistence, 'rejected display names must not leave a partial credential record');
});

test('shared mode suppression covers every prohibited destination and restores prior preferences', () => {
  assert.match(renderer, /applySchoolSuppression\(/);
  assert.match(renderer, /captureSchoolPreferences\(/);
  assert.match(renderer, /restoreSchoolPreferences\(/);
  for (const feature of ['language', 'funny', 'vocabulary', 'dim-sum']) {
    assert.match(html, new RegExp(`data-school-feature="${feature}"`), `missing ${feature} suppression marker`);
  }
  assert.match(renderer, /filterSchoolRestrictedContent\(/);
});

test('narrator exposes independent effective voice status and assistive-technology yielding', () => {
  for (const id of ['narrator-en-status', 'narrator-yue-status', 'narrator-yield-assistive', 'narrator-assistive-active', 'narrator-assistive-status']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(renderer, /voiceschanged/);
  assert.match(renderer, /narrator\.planUtterances\(/);
  assert.match(renderer, /narrator\.reconcileVoices\(/);
  assert.match(state, /yieldToAssistiveTechnology:/);
  assert.match(state, /assistiveTechnologyActive:/);
  assert.match(main, /ipcMain\.handle\('accessibility:status'/);
  assert.match(main, /app\.on\('accessibility-support-changed'/);
  assert.match(preload, /onChanged: \(callback\) => subscribe\('accessibility:changed'/);
  assert.match(renderer, /platformAccessibilityActive \|\| state\.settings\.narrator\.assistiveTechnologyActive/);
});

test('scheduled settings editor exposes date, weekday, timezone, priority, setting, and source controls', () => {
  const ids = [
    'schedule-start-date', 'schedule-end-date', 'schedule-timezone', 'schedule-priority',
    'schedule-every-day', 'schedule-setting', 'schedule-value', 'schedule-source',
    'schedule-api-url', 'schedule-ha-url', 'schedule-ha-entity', 'schedule-delete'
  ];
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  assert.match(html, /data-schedule-weekday="0"/);
  assert.match(html, /data-schedule-weekday="6"/);
});

test('external schedule resolution stays behind a trusted privileged boundary', () => {
  assert.match(main, /ipcMain\.handle\('schedule:resolve'/);
  assert.match(main, /assertTrustedIpcSender\(event\)/);
  assert.match(preload, /resolve: \(value\) => ipcRenderer\.invoke\('schedule:resolve'/);
  assert.match(renderer, /evaluateAndApplySchedules\(/);
  assert.match(renderer, /scheduleGeneration/);
  assert.match(renderer, /rule\.source\.refreshIntervalMs/);
  assert.match(renderer, /setTimeout\(\(\) => \{[\s\S]*?evaluateAndApplySchedules\(\)[\s\S]*?finally\(queueScheduleRefresh\)/);
});

test('startup delight is a single nonblocking status surface with exact public catalog provenance', () => {
  assert.match(html, /id="startup-surprise"[^>]*role="status"[^>]*hidden/);
  assert.match(html, /id="startup-surprise-image"/);
  assert.match(html, /id="dismiss-startup-surprise"/);
  assert.match(renderer, /showStartupSurprise\(/);
  assert.match(renderer, /hk-dish-0001-classic-har-gow\.png/);
  assert.match(state, /firstRunCompleted:/);
});

test('all five attention accommodations expose persisted state and live factual surfaces', () => {
  for (const key of ['focus', 'lowStimulation', 'timeAwareness', 'oneThing', 'momentum']) {
    assert.match(state, new RegExp(`${key}: false`), `missing default for ${key}`);
    assert.match(html, new RegExp(`data-adhd="${key}"`), `missing control for ${key}`);
  }
  for (const id of ['time-awareness-banner', 'time-awareness-session', 'time-awareness-change', 'one-thing-banner', 'momentum-banner']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(renderer, /attention\.deriveAttentionView\(/);
  assert.match(styles, /body\.focus-mode/);
  assert.match(styles, /body\.low-stimulation/);
});

test('presentation surfaces retain accessible live regions and 44 pixel interaction targets', () => {
  for (const id of ['school-status', 'narrator-en-status', 'narrator-yue-status', 'schedule-status', 'startup-surprise']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*aria-live="polite"|aria-live="polite"[^>]*id="${id}"`), `missing live region for ${id}`);
  }
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test('evidence mode redirects both data roots and writes hash-only receipts before ready', () => {
  assert.match(main, /validateEvidencePathArguments\(process\.argv\)/);
  assert.match(main, /app\.setPath\('appData', activatedValidation\.paths\.appData\)/);
  assert.match(main, /app\.setPath\('userData', activatedValidation\.paths\.userData\)/);
  assert.match(main, /evidence-isolation\.json/);
  assert.match(main, /evidence-app-data-active\.json/);
  assert.ok(main.indexOf('fsSync.mkdirSync(validation.paths.appData') < main.indexOf('const activatedValidation = EvidencePaths.validateEvidencePathArguments(process.argv);'), 'a validated missing app-data root must be created before the reparse recheck');
  assert.ok(main.indexOf('fsSync.mkdirSync(validation.paths.userData') < main.indexOf('const activatedValidation = EvidencePaths.validateEvidencePathArguments(process.argv);'), 'a validated missing user-data root must be created before the reparse recheck');
  assert.ok(main.indexOf('const activatedValidation = EvidencePaths.validateEvidencePathArguments(process.argv);') < main.indexOf("app.setPath('appData'"), 'created evidence roots must be revalidated before Electron activates them');
  assert.ok(main.indexOf('initializeEvidencePathIsolation();') < main.indexOf('app.whenReady()'), 'evidence path initialization must precede app readiness');
  assert.doesNotMatch(preload, /evidence-isolation|appDataPathSha256|userDataPathSha256/);
});

test('state validation migrates legacy schedules into the bounded current schema', () => {
  const input = State.createDefaultState('2026-08-25');
  input.schedules = [{
    id: 'legacy-workday',
    label: 'Legacy workday',
    enabled: true,
    weekdays: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '17:00',
    theme: 'light',
    language: 'en'
  }];
  const validated = State.validateState(input, '2026-08-25');
  assert.deepEqual(validated.schedules[0].source.settings, { theme: 'light', language: 'en' });
  assert.equal(validated.schedules[0].dayMode, 'weekdays');
  assert.equal(validated.schedules[0].timezone, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
});

test('state validation refuses an unsafe external schedule instead of persisting it', () => {
  const input = State.createDefaultState('2026-08-25');
  input.schedules = [{
    id: 'unsafe-api',
    label: 'Unsafe API',
    enabled: true,
    priority: 0,
    startDate: null,
    endDate: null,
    startTime: '00:00',
    endTime: '00:00',
    dayMode: 'every-day',
    weekdays: [],
    timezone: 'UTC',
    source: { type: 'api', url: 'http://192.0.2.10/settings', timeoutMs: 8000, refreshIntervalMs: 60000, maxResponseBytes: 65536, redirectPolicy: 'error' }
  }];
  assert.throws(() => State.validateState(input, '2026-08-25'), /HTTPS/);
});
