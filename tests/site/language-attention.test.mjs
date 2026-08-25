import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

async function sources() {
  const [app, contract, security, template, styles] = await Promise.all([
    readFile(join(root, 'site', 'app.js'), 'utf8'),
    readFile(join(root, 'site', 'presentation-contract.js'), 'utf8'),
    readFile(join(root, 'site', 'security-contract.js'), 'utf8'),
    readFile(join(root, 'site', 'index.template.html'), 'utf8'),
    readFile(join(root, 'site', 'styles.css'), 'utf8')
  ]);
  return { app, contract, security, template, styles };
}

function requireExact(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

function auditLanguageAndSchool({ app, contract, template }) {
  requireExact(template, '<script src="presentation-contract.js" defer></script>', 'The presentation contract is not loaded before the website runtime.');
  requireExact(app, 'const PresentationContract = globalThis.HairGrowthPresentationContract;', 'The website runtime does not require the presentation contract.');
  requireExact(contract, "const LANGUAGE_MODES = Object.freeze(['en', 'yue', 'both']);", 'The exact three language modes are missing.');
  requireExact(template, 'id="message-parity-preview"', 'The factual message preview is missing.');
  requireExact(app, "const SCHOOL_RECORD_KEY = 'hairGrowthEstimator.sharedSchoolPresentation.v1';", 'The shared School record key is missing.');
  requireExact(app, 'function writeSharedSchoolRecord(', 'The shared School record writer is missing.');
  requireExact(app, 'function handleSchoolStorageEvent(', 'The shared School storage-event reconciler is missing.');
  requireExact(app, 'function applySchoolPresentation(', 'The complete School presentation boundary is missing.');
  requireExact(template, 'id="school-mode-name"', 'The user-renamable School control is missing.');
  for (const id of ['language-mode', 'funny-en', 'funny-yue', 'vocabulary-file', 'voice-yue']) {
    assert.match(template, new RegExp(`[^>]+(?:id="${id}"|[\\s>]id="${id}")[^>]*`), `${id} must remain an explicit School-sensitive target`);
  }
}

function auditNarrator({ app, security, template }) {
  for (const id of ['narrator-language', 'narrator-enabled', 'voice-en', 'voice-yue', 'narrator-rate', 'narrator-pitch', 'assistive-tech-active']) {
    requireExact(template, `id="${id}"`, `Narrator control ${id} is missing.`);
  }
  requireExact(app, 'function scheduleVoiceEnumeration(', 'Delayed voice enumeration is missing.');
  requireExact(app, 'function queueNarrationTracks(', 'Serialized language-track narration is missing.');
  requireExact(app, "voice.voiceURI === selectedIdentity", 'Narrator voice selection is not bound to stable voice identities.');
  requireExact(app, 'assistiveTechnologyActive', 'The explicit assistive-technology yield state is missing.');
  requireExact(security, "['schemaVersion', 'enabled', 'language', 'voiceURIEn', 'voiceURIYue', 'rate', 'pitch', 'assistiveTechnologyActive', 'quietHours', 'reducedSound']", 'The complete narrator state schema is missing.');
}

function auditSchedules({ app, security, template }) {
  for (const id of ['schedule-start-date', 'schedule-end-date', 'schedule-every-day', 'schedule-priority', 'schedule-language', 'schedule-density', 'schedule-accent', 'schedule-font-scale', 'schedule-motion', 'schedule-source', 'schedule-source-url', 'schedule-entity-id', 'schedule-session-token']) {
    requireExact(template, `id="${id}"`, `Scheduled-settings control ${id} is missing.`);
  }
  requireExact(app, 'function refreshExternalSchedules(', 'Bounded external schedule refresh is missing.');
  requireExact(app, "redirect: 'error'", 'External schedule requests do not refuse redirects.');
  requireExact(app, 'MAX_EXTERNAL_SCHEDULE_BYTES', 'External schedule responses are not byte-bounded.');
  requireExact(app, 'scheduleSessionTokens', 'Home Assistant credentials are not session-only.');
  requireExact(security, "['id', 'label', 'enabled', 'priority', 'startDate', 'endDate', 'start', 'end', 'everyDay', 'days', 'settings', 'source', 'createdAt']", 'The complete scheduled-settings schema is missing.');
}

function auditSurpriseAndAttention({ app, contract, template, styles }) {
  requireExact(contract, 'draw < 0.10', 'The startup surprise is not an exact 10 percent draw.');
  requireExact(app, 'PresentationContract.shouldShowStartupSurprise({', 'The runtime does not use the startup-surprise contract.');
  requireExact(app, 'removeStartupSurprises()', 'School mode does not remove an already rendered startup surprise.');
  for (const id of ['adhd-focus', 'adhd-low-stim', 'adhd-time', 'adhd-one', 'adhd-momentum']) requireExact(template, `id="${id}"`, `Attention control ${id} is missing.`);
  requireExact(app, 'const ATTENTION_SETTING_IDS = Object.freeze({', 'The five attention controls do not have a hand-written runtime registry.');
  requireExact(styles, '.focus-mode .page-panel.active > *:not(:focus-within):not(.page-header)', 'Focus mode does not visibly de-emphasize inactive content.');
  requireExact(styles, '.low-stimulation', 'Low stimulation styling is missing.');
  requireExact(template, 'id="momentum-snooze"', 'The explicit momentum snooze control is missing.');
}

test('language modes, funny levels, and the shared School presentation are complete', async () => {
  auditLanguageAndSchool(await sources());
});

test('narrator language, stable voices, delayed enumeration, serialization, and yielding are complete', async () => {
  auditNarrator(await sources());
});

test('scheduled settings cover local, API, and Home Assistant sources with bounded browser safety', async () => {
  auditSchedules(await sources());
});

test('the exact startup surprise and five independent attention modes are wired', async () => {
  auditSurpriseAndAttention(await sources());
});

test('exact source boundaries turn red when deliberately removed, then restored sources are green', async () => {
  const current = await sources();
  const schoolRegression = { ...current, app: current.app.replace('function writeSharedSchoolRecord(', 'function writeSharedSchoolRecordRemoved(') };
  assert.notEqual(schoolRegression.app, current.app, 'the deliberate School regression must alter the exact writer boundary');
  assert.throws(() => auditLanguageAndSchool(schoolRegression), /shared School record writer is missing/);

  const narratorRegression = { ...current, app: current.app.replace('function queueNarrationTracks(', 'function queueNarrationTracksRemoved(') };
  assert.notEqual(narratorRegression.app, current.app, 'the deliberate narrator regression must alter the exact queue boundary');
  assert.throws(() => auditNarrator(narratorRegression), /Serialized language-track narration is missing/);

  const scheduleRegression = { ...current, app: current.app.replace("redirect: 'error'", "redirect: 'follow'") };
  assert.notEqual(scheduleRegression.app, current.app, 'the deliberate schedule regression must alter the redirect boundary');
  assert.throws(() => auditSchedules(scheduleRegression), /do not refuse redirects/);

  const surpriseRegression = { ...current, contract: current.contract.replace('draw < 0.10', 'draw <= 0.10') };
  assert.notEqual(surpriseRegression.contract, current.contract, 'the deliberate surprise regression must alter the exact probability boundary');
  assert.throws(() => auditSurpriseAndAttention(surpriseRegression), /not an exact 10 percent draw/);

  assert.doesNotThrow(() => auditLanguageAndSchool(current));
  assert.doesNotThrow(() => auditNarrator(current));
  assert.doesNotThrow(() => auditSchedules(current));
  assert.doesNotThrow(() => auditSurpriseAndAttention(current));
});
