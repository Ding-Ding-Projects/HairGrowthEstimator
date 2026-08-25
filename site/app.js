'use strict';

const STATE_KEY = 'hairGrowthEstimator.websiteState.v1';
const STATE_LOCK_NAME = 'hairGrowthEstimator.websiteState.transaction.v1';
const WRITER_SESSION_KEY = 'hairGrowthEstimator.websiteState.writer.v1';
const STATE_QUARANTINE_KEY = 'hairGrowthEstimator.websiteState.quarantine.v1';
const PRIVATE_KEYS = new Set(['totpSecret', 'lockHash', 'pinHash', 'passwordHash', 'vocabularyMappings', 'customLogoData']);
const INCHES_PER_CM = 1 / 2.54;
const CM_PER_INCH = 2.54;
const MAX_HISTORY = 500;
const MAX_NOTIFICATIONS = 200;
const MAX_FILE_BYTES = 1024 * 1024;
const StateContract = globalThis.HairGrowthStateContract;
const SecurityContract = globalThis.HairGrowthSecurityContract;
const RegexClientContract = globalThis.HairGrowthRegexClient;
if (!StateContract) throw new Error('The browser state contract did not load.');
if (!SecurityContract) throw new Error('The browser security contract did not load.');
if (!RegexClientContract) throw new Error('The disposable regex client did not load.');
const { createStateCoordinator, decodeStateEnvelope, reconcileBaseline, serializeDelimitedExport, todayDateString, validateDateNotFuture } = StateContract;
const { MAX_VOCABULARY_BYTES, buildRedactedExportState, parseJsonStrict, sanitizeImportedState, validateAppearanceMap, validateBrowserState, validatePersonalVocabularyCache, validatePersonalVocabularyText, validateStoredStateEnvelopeText } = SecurityContract;
const { createRegexWorkerClient } = RegexClientContract;
const DIM_SUM = Object.freeze({
  nameEn: 'Classic Har Gow',
  nameYue: '蝦餃',
  image: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png',
  catalog: 'https://github.com/Ding-Ding-Projects/dim-sum-photos'
});

const TAB_DEFINITIONS = Object.freeze([
  { id: 'home', label: 'Home', icon: '⌂', group: 'Start' },
  { id: 'estimator', label: 'Estimator', icon: '↗', group: 'Track' },
  { id: 'haircuts', label: 'Haircuts', icon: '✂', group: 'Track' },
  { id: 'service', label: 'Service', icon: '⌁', group: 'Connect' },
  { id: 'downloads', label: 'Downloads', icon: '⇩', group: 'Connect' },
  { id: 'docs', label: 'Documentation', icon: '▤', group: 'Learn' },
  { id: 'tools', label: 'Tools', icon: '◫', group: 'Learn' },
  { id: 'status', label: 'Status', icon: '●', group: 'Learn' },
  { id: 'history', label: 'History', icon: '↶', group: 'Manage' },
  { id: 'changelog', label: 'Changelog', icon: '≡', group: 'Manage' },
  { id: 'settings', label: 'Settings', icon: '⚙', group: 'Manage' }
]);

const FEATURE_COMMANDS = Object.freeze([
  ['Open the growth estimator', 'estimator'],
  ['Record a haircut reset', 'haircuts'],
  ['Read local service guidance', 'service'],
  ['Check installer availability', 'downloads'],
  ['Browse offline documentation', 'docs'],
  ['Open the regex workbench', 'tools', 'regex'],
  ['Open the local file converter', 'tools', 'converter'],
  ['Open local Ollama mediation', 'tools', 'ollama'],
  ['Open the browser-local authenticator', 'tools', 'authenticator'],
  ['Export browser state', 'tools', 'exports'],
  ['Review local history', 'history'],
  ['Review notifications', 'history'],
  ['Search the changelog', 'changelog'],
  ['Change language mode', 'settings', 'language-mode'],
  ['Change theme', 'settings', 'theme-select'],
  ['Customize the logo', 'settings', 'custom-logo'],
  ['Upload local personal-vocabulary JSON', 'settings', 'vocabulary-file'],
  ['Review local personal-vocabulary status', 'settings', 'vocabulary-status'],
  ['Replace local personal-vocabulary JSON', 'settings', 'replace-vocabulary'],
  ['Clear local personal-vocabulary cache', 'settings', 'clear-vocabulary'],
  ['Configure scheduled settings', 'settings', 'schedule-label'],
  ['Configure attention modes', 'settings', 'adhd-focus'],
  ['Open Support Tickets', 'settings', 'support']
]);

const TRANSLATIONS = Object.freeze({
  'Home': '主頁',
  'Estimator': '估算器',
  'Haircuts': '剪髮紀錄',
  'Service': '服務',
  'Downloads': '下載',
  'Documentation': '文件',
  'Tools': '工具',
  'Status': '狀態',
  'History': '歷史',
  'Changelog': '更新紀錄',
  'Settings': '設定'
});

const VOCABULARY_STATUS_COPY = Object.freeze({
  empty: { en: 'No local cache is active.', yue: '未有本機詞彙快取，原裝字句照常返工。' },
  loading: { en: 'Validating the selected local file.', yue: '正在驗證本機檔案，逐個欄位驗明正身。' },
  loaded: { en: 'A validated local cache is active. Source details and mappings are not exposed.', yue: '已啟用通過驗證的本機快取，來源資料同對照內容唔會顯示。' },
  replaced: { en: 'The validated local cache was replaced. Source details and mappings are not exposed.', yue: '已更換通過驗證的本機快取，來源資料同對照內容繼續收好。' },
  'invalid-preserved': { en: 'The selected file was rejected. The last valid local cache remains active.', yue: '所選檔案唔合格，上次有效的本機快取繼續當值。' },
  invalid: { en: 'The selected file was rejected. Original wording remains active.', yue: '所選檔案唔合格，畫面繼續用原裝字句。' },
  cleared: { en: 'The local cache was cleared. Original wording is active.', yue: '本機快取已清除，原裝字句重新上場。' }
});

const VOCABULARY_ACTION_COPY = Object.freeze({
  choose: { en: 'Choose local file', yue: '選擇本機檔案' },
  replace: { en: 'Replace local file', yue: '更換本機檔案' }
});

const SETTING_CONTROL_NAMES = Object.freeze({
  'settings-search': 'Search settings',
  'language-mode': 'Language mode',
  'funny-en': 'English funny level',
  'funny-yue': 'Cantonese funny level',
  'dialog-emoji': 'Show emojis in dialogs and message boxes',
  'school-mode': 'Presentation mode',
  'theme-select': 'Theme',
  'density-select': 'Density',
  'accent-color': 'Accent color',
  'accent-rainbow': 'Use animated rainbow accent',
  'rainbow-speed': 'Rainbow speed',
  'font-family': 'Interface font family',
  'font-scale': 'Interface font size scale',
  'dock-select': 'Tab-strip docking',
  'logo-preset': 'Logo preset',
  'custom-logo': 'Custom logo image',
  'logo-fit': 'Custom logo fit',
  'logo-background': 'Custom logo background color',
  'reset-logo': 'Reset logo',
  'display-name-input': 'Display name',
  'reset-display-name': 'Reset display name',
  'narrator-enabled': 'Narrator enabled',
  'voice-en': 'English narrator voice',
  'voice-yue': 'Cantonese narrator voice',
  'narrator-rate': 'Narrator rate',
  'narrator-pitch': 'Narrator pitch',
  'reduced-motion': 'Reduced motion',
  'vocabulary-file': 'Choose local personal vocabulary JSON',
  'replace-vocabulary': 'Choose or replace local personal vocabulary JSON',
  'clear-vocabulary': 'Clear local personal vocabulary cache',
  'schedule-label': 'Scheduled rule label',
  'schedule-start': 'Scheduled rule start time',
  'schedule-end': 'Scheduled rule end time',
  'schedule-theme': 'Scheduled rule theme',
  'add-schedule': 'Add scheduled rule',
  'adhd-focus': 'Focus mode',
  'adhd-low-stim': 'Low stimulation mode',
  'adhd-time': 'Time awareness mode',
  'adhd-one': 'One thing at a time mode',
  'next-action': 'Next action',
  'adhd-momentum': 'Momentum mode'
});
const SCHOOL_SENSITIVE_REGEX_OWNERS = new Set(['language-mode', 'funny-en', 'funny-yue', 'voice-yue', 'vocabulary-file', 'replace-vocabulary', 'clear-vocabulary']);

const defaultState = () => ({
  schemaVersion: 1,
  visited: false,
  activeTab: 'home',
  settings: {
    language: 'en',
    funnyEn: 5,
    funnyYue: 5,
    dialogEmoji: true,
    schoolMode: false,
    schoolModeName: 'School mode',
    theme: 'dark',
    density: 'comfortable',
    accent: '#a7f3d0',
    rainbow: false,
    rainbowSpeed: 3,
    fontFamily: 'system-ui',
    fontScale: 1,
    dock: 'left',
    displayName: 'Hair Growth Estimator',
    paletteSize: 'card',
    reducedMotion: false,
    narrator: { enabled: false, voiceEn: 'auto', voiceYue: 'auto', rate: 1, pitch: 1 },
    logo: { preset: 'strand', customLogoData: '', fit: 'contain', background: '#101415' },
    attention: { focus: false, lowStim: false, time: false, one: false, momentum: false, nextAction: '', snoozedUntil: 0 }
  },
  estimator: {
    baselineDate: todayDateString(),
    baselineLengthCm: 1,
    manualBaselineDate: todayDateString(),
    manualBaselineLengthCm: 1,
    growthRateCmPerMonth: 1,
    targetLengthCm: 12,
    unit: 'cm'
  },
  haircuts: [],
  tabs: {
    order: TAB_DEFINITIONS.map((tab) => tab.id),
    pinned: ['home'],
    closed: [],
    groups: { Start: { color: '#a7f3d0', collapsed: false }, Track: { color: '#c4c8ed', collapsed: false }, Connect: { color: '#ffd8a8', collapsed: false }, Learn: { color: '#a7d8ff', collapsed: false }, Manage: { color: '#ffc6dc', collapsed: false } },
    groupOverrides: {}
  },
  notifications: [],
  history: [],
  schedules: [],
  locks: {},
  unlocks: {},
  tickets: [],
  totpEntries: [],
  appearance: {},
  regexOwners: {},
  vocabulary: { schemaVersion: 1, entries: {} },
  ollama: { url: 'http://127.0.0.1:11434', models: [], checkedAt: null },
  conversion: null
});

function readJsonScript(id, fallback) {
  try {
    const text = document.getElementById(id)?.textContent || '';
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

const provenance = readJsonScript('build-provenance', null);
const bundledDocs = readJsonScript('bundled-docs', []);
const bundledChangelog = readJsonScript('bundled-changelog', []);
const bundledHairAssets = readJsonScript('bundled-hair-assets', []);

function mergeState(base, saved) {
  if (!saved) return validateBrowserState(base);
  return validateBrowserState(saved);
}

function createWriterIdentity() {
  const created = crypto.randomUUID();
  try {
    sessionStorage.setItem(WRITER_SESSION_KEY, created);
  } catch {}
  return created;
}

const writerId = createWriterIdentity();
let initialStateValue = null;
try { initialStateValue = localStorage.getItem(STATE_KEY); } catch {}
let initialQuarantineNotice = null;
function quarantineInvalidStoredState(rawValue) {
  try {
    return validateStoredStateEnvelopeText(rawValue, defaultState());
  } catch (error) {
    initialQuarantineNotice = String(error?.message || error).slice(0, 500);
    try {
      const quarantine = { schemaVersion: 1, quarantinedAt: new Date().toISOString(), reason: initialQuarantineNotice, rawState: String(rawValue || '').slice(0, 4 * 1024 * 1024) };
      localStorage.setItem(STATE_QUARANTINE_KEY, JSON.stringify(quarantine));
      localStorage.removeItem(STATE_KEY);
    } catch {}
    return validateStoredStateEnvelopeText(null, defaultState());
  }
}
const initialEnvelope = quarantineInvalidStoredState(initialStateValue);
let stateRevision = initialEnvelope.revision;
let state = mergeState(defaultState(), initialEnvelope.state);
let reconciliationGeneration = 0;
let persistQueue = Promise.resolve();
const stateCoordinator = createStateCoordinator({
  storage: localStorage,
  stateKey: STATE_KEY,
  lockName: STATE_LOCK_NAME,
  writerId,
  navigatorLocks: navigator.locks,
  indexedDB: globalThis.indexedDB || null,
  validateEnvelope: (rawValue, fallbackState) => validateStoredStateEnvelopeText(rawValue, fallbackState)
});

let contextTarget = null;
let appearanceTarget = null;
let lockTarget = null;
let unlockTarget = null;
let pendingDestructiveAction = null;
let activeRegexOwner = 'standalone';
let conversionObjectUrl = null;
let speechQueue = [];
let speaking = false;
let heroStageIndex = 0;
let heroTimer = null;
let startedAt = Date.now();
let lastChangedAt = Date.now();
let scheduleTimer = null;
let vocabularyUiState = Object.keys(state.vocabulary.entries).length ? 'loaded' : 'empty';
let lastRenderedSchoolMode = state.settings.schoolMode;
const vocabularyTextState = new WeakMap();
const vocabularyAttributeState = new WeakMap();
const searchControllers = new Map();
const searchGenerations = new Map();
let contextMenuOpener = null;
let regexWorkerClient = null;
try {
  regexWorkerClient = createRegexWorkerClient({ WorkerCtor: globalThis.Worker, workerUrl: 'regex-worker.js', timeoutMs: 150, maxConcurrent: 2, maxQueue: 16 });
} catch {}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function deepRedact(value, key = '') {
  if (PRIVATE_KEYS.has(key)) return '[omitted]';
  if (Array.isArray(value)) return value.map((item) => deepRedact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, deepRedact(child, childKey)]));
  return value;
}

function appendHistory(action, detail) {
  const entry = { id: crypto.randomUUID(), action, detail: String(detail).slice(0, 400), at: new Date().toISOString() };
  state.history = [entry, ...state.history].slice(0, MAX_HISTORY);
  lastChangedAt = Date.now();
}

function cloneStateSnapshot(value) {
  try { return structuredClone(value); }
  catch { return JSON.parse(JSON.stringify(value)); }
}

function reconcileEstimatorBaseline(today = todayDateString()) {
  const reconciled = reconcileBaseline(state.estimator, state.haircuts, today);
  state.estimator = reconciled.estimator;
  return reconciled;
}

function renderStorageRevision() {
  const target = $('#storage-revision-status');
  if (!target) return;
  const shortWriter = writerId.slice(0, 8);
  target.textContent = `Browser revision ${stateRevision}. This tab writer is ${shortWriter}. Same-origin stale writes are refused.`;
}

function adoptStoredEnvelope(envelope, { announce = true } = {}) {
  reconciliationGeneration += 1;
  stateRevision = envelope.revision;
  state = validateBrowserState(envelope.state);
  vocabularyUiState = Object.keys(state.vocabulary.entries).length ? 'loaded' : 'empty';
  reconcileEstimatorBaseline();
  renderAll();
  renderStorageRevision();
  if (announce) showNotification('Newer browser revision loaded', `Revision ${envelope.revision} from another tab replaced this tab's older view.`, 'info', false);
}

function persist(action, detail, { record = true } = {}) {
  if (record && action) appendHistory(action, detail);
  let snapshot;
  try { snapshot = validateBrowserState(cloneStateSnapshot(state)); }
  catch (error) {
    showNotification('Change not saved', `The browser state did not pass complete validation: ${error.message}`, 'error', false);
    return Promise.resolve({ ok: false, reason: 'state-validation-failed', message: error.message });
  }
  const generation = reconciliationGeneration;
  const run = async () => {
    if (generation !== reconciliationGeneration) {
      showNotification('Change not saved', 'A newer browser revision arrived before this write began. Review the current values and repeat the change if it is still needed.', 'warning', false);
      return { ok: false, reason: 'superseded-before-write' };
    }
    const result = await stateCoordinator.commit({ baseRevision: stateRevision, state: snapshot });
    if (result.ok) {
      stateRevision = result.revision;
      renderStorageRevision();
      return result;
    }
    if (result.reason === 'stale-write' && result.current) {
      adoptStoredEnvelope(result.current, { announce: false });
      showNotification('Stale change refused', `Another tab already saved browser revision ${result.current.revision}. The older local change was not written. Review the current values and repeat it if needed.`, 'warning', false);
      return result;
    }
    showNotification('Storage write failed', result.message || 'The browser could not complete a safe exclusive transaction. The local view remains unsaved.', 'error', false);
    return result;
  };
  persistQueue = persistQueue.then(run, run);
  renderHistory();
  renderAttentionBar();
  return persistQueue;
}

function friendlyCopy(serious, playfulEn, playfulYue) {
  const mode = state.settings.schoolMode ? 'en' : state.settings.language;
  const en = state.settings.funnyEn <= 1 ? serious : state.settings.funnyEn >= 4 ? playfulEn : serious;
  const yue = state.settings.funnyYue <= 1 ? serious : state.settings.funnyYue >= 4 ? playfulYue : serious;
  if (mode === 'yue') return yue;
  if (mode === 'both') return `${en} · ${yue}`;
  return en;
}

function isSchoolSensitiveText(value) {
  if (!state.settings.schoolMode) return false;
  const text = String(value || '').toLocaleLowerCase();
  return ['cantonese', 'bilingual', 'funny level', 'funny-level', 'personal vocabulary', 'personal-vocabulary', 'dim sum', 'dim-sum', 'har gow', '蝦餃'].some((term) => text.includes(term));
}

function showNotification(title, body, type = 'info', persistNotification = true, extra = null) {
  const item = { id: crypto.randomUUID(), title, body, type, at: new Date().toISOString(), dismissed: false };
  if (persistNotification) {
    state.notifications = [item, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
    persist(null, null, { record: false });
  }
  const suppressInterruption = state.settings.attention.lowStim && type === 'info';
  if (!suppressInterruption) {
    const snackbar = document.createElement('article');
    snackbar.className = 'snackbar';
    snackbar.dataset.notificationId = item.id;
    const visual = extra?.image ? `<img src="${escapeHtml(extra.image)}" alt="${escapeHtml(extra.alt || '')}">` : '';
    snackbar.innerHTML = `${visual}<div><h4>${escapeHtml(title)}</h4><p>${escapeHtml(body)}</p></div><button class="icon-button" type="button" aria-label="Dismiss notification">×</button>`;
    snackbar.querySelector('button').addEventListener('click', () => snackbar.remove());
    $('#snackbar-region').append(snackbar);
    if (type !== 'error' && type !== 'warning') setTimeout(() => snackbar.remove(), 6500);
  }
  renderNotifications();
  narrate(`${title}. ${body}`, type);
}

function narrate(text, category = 'info') {
  if (state.settings.attention.lowStim && category === 'info') return;
  if (!state.settings.narrator.enabled || !('speechSynthesis' in window)) return;
  const next = { text, category };
  const existing = speechQueue.findIndex((item) => item.category === category);
  if (existing >= 0) speechQueue.splice(existing, 1, next); else speechQueue.push(next);
  playSpeechQueue();
}

function playSpeechQueue() {
  if (speaking || !speechQueue.length || !('speechSynthesis' in window)) return;
  speaking = true;
  const item = speechQueue.shift();
  const utterance = new SpeechSynthesisUtterance(item.text);
  utterance.rate = Number(state.settings.narrator.rate) || 1;
  utterance.pitch = Number(state.settings.narrator.pitch) || 1;
  const voices = speechSynthesis.getVoices();
  const selected = voices.find((voice) => voice.voiceURI === state.settings.narrator.voiceEn);
  if (selected) utterance.voice = selected;
  utterance.onend = utterance.onerror = () => { speaking = false; playSpeechQueue(); };
  speechSynthesis.speak(utterance);
}

function isValidProvenance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fields = ['schemaVersion', 'name', 'version', 'updatedAt', 'commit', 'source', 'releaseCodeName', 'installer', 'socialPreview'];
  if (Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) return false;
  if (value.schemaVersion !== 1 || value.name !== 'hair-growth-estimator' || value.source !== 'package.json plus Git commit provenance') return false;
  if (typeof value.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value.version)) return false;
  if (typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))) return false;
  if (typeof value.commit !== 'string' || !/^[a-f0-9]{40}$/.test(value.commit)) return false;
  const codeName = value.releaseCodeName;
  const codeNameFields = ['en', 'zhHant', 'catalogId', 'catalogCommit', 'publicAsset'];
  if (!codeName || typeof codeName !== 'object' || Array.isArray(codeName) || Object.keys(codeName).length !== codeNameFields.length || codeNameFields.some((field) => !Object.hasOwn(codeName, field))) return false;
  if (codeName.en !== 'Classic Har Gow' || codeName.zhHant !== '蝦餃' || codeName.catalogId !== 'hk-dish-0001' || codeName.catalogCommit !== '736e8c1d9e40e1d146f3c3b11bb329b97c4ef515' || codeName.publicAsset !== 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png') return false;
  const preview = value.socialPreview;
  if (!preview || typeof preview !== 'object' || Array.isArray(preview) || Object.keys(preview).length !== 2 || !Object.hasOwn(preview, 'sha256') || !Object.hasOwn(preview, 'bytes')) return false;
  if (!/^[a-f0-9]{64}$/.test(preview.sha256) || !Number.isSafeInteger(preview.bytes) || preview.bytes < 1 || preview.bytes > 5 * 1024 * 1024) return false;
  return true;
}

function isValidInstallerManifest(manifest, build) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return false;
  const fields = ['schemaVersion', 'owner', 'repository', 'tag', 'target', 'version', 'platform', 'filename', 'bytes', 'sha256', 'unsigned', 'publication'];
  if (Object.keys(manifest).length !== fields.length || fields.some((field) => !Object.hasOwn(manifest, field))) return false;
  if (manifest.schemaVersion !== 1 || manifest.owner !== 'Ding-Ding-Projects' || manifest.repository !== 'HairGrowthEstimator') return false;
  if (manifest.target !== build.commit || manifest.version !== build.version || manifest.platform !== 'windows-x64' || manifest.unsigned !== true) return false;
  const escapedVersion = build.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (typeof manifest.tag !== 'string' || manifest.tag.length > 128 || !new RegExp(`^v?${escapedVersion}(?:[-.][0-9A-Za-z.-]+)?$`).test(manifest.tag)) return false;
  if (typeof manifest.filename !== 'string' || manifest.filename.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.exe$/.test(manifest.filename) || !manifest.filename.includes(build.version)) return false;
  if (!Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > 2 * 1024 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(manifest.sha256)) return false;
  const publication = manifest.publication;
  const publicationFields = ['state', 'draft', 'prerelease', 'publishedAt', 'releaseId', 'assetId', 'url'];
  if (!publication || typeof publication !== 'object' || Array.isArray(publication) || Object.keys(publication).length !== publicationFields.length || publicationFields.some((field) => !Object.hasOwn(publication, field))) return false;
  if (publication.state !== 'published' || publication.draft !== false || typeof publication.prerelease !== 'boolean' || typeof publication.publishedAt !== 'string' || Number.isNaN(Date.parse(publication.publishedAt))) return false;
  if (!Number.isSafeInteger(publication.releaseId) || publication.releaseId < 1 || !Number.isSafeInteger(publication.assetId) || publication.assetId < 1) return false;
  return publication.url === `https://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/download/${manifest.tag}/${manifest.filename}`;
}

function renderProvenance() {
  const valid = isValidProvenance(provenance);
  $('#running-version').textContent = valid ? provenance.version : 'Unavailable';
  if (valid) {
    const date = new Date(provenance.updatedAt);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local timezone';
    const formatted = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(date);
    $('#running-updated-at').textContent = `${formatted} (${timezone})`;
    $('#status-build-evidence').textContent = `Commit ${provenance.commit.slice(0, 12)}, composed from package version ${provenance.version}.`;
  } else {
    $('#running-updated-at').textContent = 'Unavailable, build provenance is missing or invalid';
    $('#status-build-evidence').textContent = 'Build provenance is missing or invalid. No version or timestamp claim is made.';
  }
  $('#provenance-json').textContent = JSON.stringify(valid ? provenance : { status: 'unavailable' }, null, 2);
  const manifest = provenance?.installer;
  const validInstaller = valid && isValidInstallerManifest(manifest, provenance);
  if (validInstaller) {
    $('#download-version').textContent = `Version ${provenance.version}`;
    $('#download-detail').textContent = `Unsigned Windows installer, ${manifest.bytes.toLocaleString()} bytes. SHA-256 ${manifest.sha256}`;
    $('#download-button').disabled = false;
    $('#download-button').textContent = 'Download installer';
    $('#download-button').dataset.url = manifest.publication.url;
    $('#download-disabled-reason').textContent = 'The versioned publication record, exact immutable release asset, byte count, and SHA-256 digest are embedded in this artifact provenance.';
  } else {
    $('#download-version').textContent = 'No verified installer manifest';
    $('#download-detail').textContent = 'The download stays disabled until a complete versioned publication manifest matches this exact website artifact.';
    $('#download-button').disabled = true;
    $('#download-button').textContent = 'Installer pending verification';
    delete $('#download-button').dataset.url;
    $('#download-disabled-reason').textContent = 'No verified immutable release asset is bound to this website artifact.';
  }
}

function displayUnit(cm, unit = state.estimator.unit) {
  return unit === 'in' ? `${(cm * INCHES_PER_CM).toFixed(2)} in` : `${cm.toFixed(2)} cm`;
}

function toCentimetres(value, unit = state.estimator.unit) {
  return unit === 'in' ? Number(value) * CM_PER_INCH : Number(value);
}

function fromCentimetres(value, unit = state.estimator.unit) {
  return unit === 'in' ? Number(value) * INCHES_PER_CM : Number(value);
}

function safePattern(owner) {
  return state.regexOwners[owner] || { enabled: false, pattern: '', flags: 'iu', plain: '' };
}

function searchOwnerAndQuery(inputOrOwner) {
  const owner = typeof inputOrOwner === 'string' ? inputOrOwner : inputOrOwner?.dataset?.searchOwner;
  const query = typeof inputOrOwner === 'string' ? safePattern(owner).plain : inputOrOwner?.value || '';
  return { owner: owner || 'unowned-search', query: String(query), config: safePattern(owner) };
}

async function filterSearchItems(items, textForItem, inputOrOwner) {
  const { owner, query, config } = searchOwnerAndQuery(inputOrOwner);
  if (!query) return items;
  if (!config.enabled) {
    const needle = query.toLocaleLowerCase();
    return items.filter((item) => String(textForItem(item)).toLocaleLowerCase().includes(needle));
  }
  if (!regexWorkerClient) return [];
  searchControllers.get(owner)?.abort();
  const controller = new AbortController();
  searchControllers.set(owner, controller);
  const generation = (searchGenerations.get(owner) || 0) + 1;
  searchGenerations.set(owner, generation);
  const source = config.pattern || query;
  const values = items.map((item) => String(textForItem(item)).slice(0, 20000));
  const verdicts = [];
  try {
    let offset = 0;
    while (offset < values.length) {
      const batch = [];
      let characters = 0;
      while (offset < values.length && batch.length < 500 && characters + values[offset].length <= 100000) {
        batch.push(values[offset]);
        characters += values[offset].length;
        offset += 1;
      }
      if (!batch.length) {
        batch.push(values[offset].slice(0, 100000));
        offset += 1;
      }
      const result = await regexWorkerClient.run({ operation: 'testMany', pattern: source, flags: config.flags || 'iu', values: batch }, { signal: controller.signal });
      verdicts.push(...result.matches);
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      const status = document.querySelector(`[data-regex-status-for="${CSS.escape(owner)}"]`);
      if (status) status.textContent = `Search pattern rejected: ${error.message}`;
    }
    return null;
  } finally {
    if (searchControllers.get(owner) === controller) searchControllers.delete(owner);
  }
  if (searchGenerations.get(owner) !== generation) return null;
  return items.filter((item, index) => verdicts[index]);
}

function applyPrivateVocabulary(text) {
  if (state.settings.schoolMode) return String(text);
  const cache = validatePersonalVocabularyCache(state.vocabulary);
  const mappings = Object.entries(cache.entries).sort(([left], [right]) => right.length - left.length);
  return mappings.reduce((result, [from, to]) => result.split(from).join(to), String(text));
}

function applyVocabularyToOwnedText(rootNode = document.body) {
  if (!rootNode) return;
  const excluded = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA']);
  const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || excluded.has(parent.tagName) || parent.closest('[data-vocabulary-exempt]')) continue;
    const prior = vocabularyTextState.get(node);
    const current = node.nodeValue || '';
    const original = prior && current === prior.applied ? prior.original : current;
    const applied = applyPrivateVocabulary(original);
    vocabularyTextState.set(node, { original, applied });
    if (current !== applied) node.nodeValue = applied;
  }
  const attributes = ['aria-label', 'aria-description', 'aria-valuetext', 'aria-roledescription', 'title', 'placeholder', 'alt'];
  for (const element of rootNode.querySelectorAll('*')) {
    if (element.closest('[data-vocabulary-exempt]')) continue;
    let states = vocabularyAttributeState.get(element);
    if (!states) { states = new Map(); vocabularyAttributeState.set(element, states); }
    for (const attribute of attributes) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute) || '';
      const prior = states.get(attribute);
      const original = prior && current === prior.applied ? prior.original : current;
      const applied = applyPrivateVocabulary(original);
      states.set(attribute, { original, applied });
      if (current !== applied) element.setAttribute(attribute, applied);
    }
  }
}

let vocabularyPassScheduled = false;
function scheduleVocabularyTextBoundary() {
  if (vocabularyPassScheduled) return;
  vocabularyPassScheduled = true;
  queueMicrotask(() => {
    vocabularyPassScheduled = false;
    applyVocabularyToOwnedText(document.body);
  });
}

function currentTabDefinition(id) { return TAB_DEFINITIONS.find((tab) => tab.id === id); }

function tabGroup(tab) { return state.tabs.groupOverrides[tab.id] || tab.group; }

function localizedTabLabel(tab) {
  const mode = state.settings.schoolMode ? 'en' : state.settings.language;
  const translated = TRANSLATIONS[tab.label] || tab.label;
  if (mode === 'yue') return translated;
  if (mode === 'both') return `${tab.label} · ${translated}`;
  return tab.label;
}

function focusFilteredTabFallback(previouslyFocusedId = null) {
  const tabs = $$('.tab-button:not([hidden])');
  if (!tabs.length) {
    $('#strip-search')?.focus();
    return;
  }
  const preferred = tabs.find((button) => button.dataset.tab === state.activeTab) || tabs[0];
  tabs.forEach((button) => { button.tabIndex = button === preferred ? 0 : -1; });
  const focusTarget = previouslyFocusedId ? tabs.find((button) => button.id === previouslyFocusedId) || preferred : null;
  if (focusTarget) focusTarget.focus();
}

async function renderTabs() {
  const list = $('#tab-list');
  const focusedId = list.contains(document.activeElement) ? document.activeElement.id : null;
  list.innerHTML = '';
  const ordered = state.tabs.order.map(currentTabDefinition).filter(Boolean);
  const visible = ordered.filter((tab) => !state.tabs.closed.includes(tab.id));
  const queryInput = $('#strip-search');
  const filtered = await filterSearchItems(visible, (tab) => `${localizedTabLabel(tab)} ${tabGroup(tab)}`, queryInput);
  if (filtered === null) return;
  filtered.sort((a, b) => Number(!state.tabs.pinned.includes(a.id)) - Number(!state.tabs.pinned.includes(b.id)));
  filtered.forEach((tab) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-button';
    button.id = `tab-${tab.id}`;
    button.role = 'tab';
    button.draggable = true;
    button.dataset.tab = tab.id;
    button.dataset.elementId = `tab:${tab.id}`;
    button.dataset.pinned = String(state.tabs.pinned.includes(tab.id));
    button.setAttribute('aria-controls', `panel-${tab.id}`);
    button.setAttribute('aria-selected', String(state.activeTab === tab.id));
    button.tabIndex = state.activeTab === tab.id ? 0 : -1;
    button.innerHTML = `<span aria-hidden="true">${tab.icon}</span><span class="tab-label">${escapeHtml(applyPrivateVocabulary(localizedTabLabel(tab)))}</span><span class="tab-group-label sr-only">${escapeHtml(tabGroup(tab))}</span>`;
    button.addEventListener('click', () => activateTab(tab.id));
    button.addEventListener('keydown', handleTabKeyboard);
    button.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', tab.id));
    button.addEventListener('dragover', (event) => event.preventDefault());
    button.addEventListener('drop', (event) => reorderTab(event.dataTransfer.getData('text/plain'), tab.id));
    list.append(button);
  });
  list.setAttribute('aria-orientation', ['left', 'right'].includes(state.settings.dock) ? 'vertical' : 'horizontal');
  focusFilteredTabFallback(focusedId);
  applyLocks();
  applyAppearance();
  scheduleVocabularyTextBoundary();
}

function handleTabKeyboard(event) {
  const vertical = ['left', 'right'].includes(state.settings.dock);
  const previousKey = vertical ? 'ArrowUp' : 'ArrowLeft';
  const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
  if (![previousKey, nextKey, 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = $$('.tab-button:not([hidden])');
  const index = tabs.indexOf(event.currentTarget);
  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === previousKey ? (index - 1 + tabs.length) % tabs.length : (index + 1) % tabs.length;
  tabs[nextIndex]?.focus();
}

function reorderTab(sourceId, targetId) {
  if (!sourceId || sourceId === targetId) return;
  const next = state.tabs.order.filter((id) => id !== sourceId);
  next.splice(next.indexOf(targetId), 0, sourceId);
  state.tabs.order = next;
  persist('Tabs reordered', `Moved ${sourceId} before ${targetId}.`);
  renderTabs();
}

function activateTab(id, focusTarget = null, persistSelection = true) {
  if (state.tabs.closed.includes(id)) state.tabs.closed = state.tabs.closed.filter((tabId) => tabId !== id);
  state.activeTab = id;
  $$('.page-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === id));
  $$('.tab-button').forEach((button) => { const active = button.dataset.tab === id; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
  try { history.replaceState(null, '', `#${id}`); } catch {}
  if (persistSelection) persist(null, null, { record: false });
  renderAttentionBar();
  if (focusTarget) {
    const element = document.getElementById(focusTarget) || document.querySelector(`[data-feature="${CSS.escape(focusTarget)}"]`);
    if (element) setTimeout(() => { element.scrollIntoView({ block: 'center' }); element.focus?.({ preventScroll: true }); element.classList.add('teleport-highlight'); setTimeout(() => element.classList.remove('teleport-highlight'), 1300); }, 40);
  }
}

function setDateFieldValidation(input, errorTarget, value, today = todayDateString()) {
  const result = validateDateNotFuture(value, today);
  input.max = today;
  input.setCustomValidity(result.valid ? '' : result.message);
  input.setAttribute('aria-invalid', String(!result.valid));
  $(errorTarget).textContent = result.message;
  return result;
}

function renderEstimator() {
  const unit = state.estimator.unit;
  const today = todayDateString();
  const reconciled = reconcileEstimatorBaseline(today);
  $('#baseline-date').value = state.estimator.manualBaselineDate;
  $('#baseline-length').value = fromCentimetres(state.estimator.manualBaselineLengthCm, unit).toFixed(2);
  $('#growth-rate').value = fromCentimetres(state.estimator.growthRateCmPerMonth, unit).toFixed(2);
  $('#target-length').value = fromCentimetres(state.estimator.targetLengthCm, unit).toFixed(2);
  $$('input[name="unit"]').forEach((radio) => { radio.checked = radio.value === unit; });
  $$('[data-unit-label]').forEach((label) => { label.textContent = unit; });
  setDateFieldValidation($('#baseline-date'), '#baseline-date-error', state.estimator.manualBaselineDate, today);
  $('#haircut-date').max = today;
  const sourceLabel = reconciled.source.kind === 'haircut'
    ? `Active baseline: newest valid haircut on ${reconciled.source.date} at ${displayUnit(reconciled.source.lengthCm, unit)}.`
    : `Active baseline: retained manual fallback on ${reconciled.source.date} at ${displayUnit(reconciled.source.lengthCm, unit)}.`;
  const futureCount = reconciled.ignoredFutureIds.length;
  const futureNote = futureCount ? ` ${futureCount} future-dated haircut ${futureCount === 1 ? 'record is' : 'records are'} excluded while the date remains in the future.` : '';
  $('#baseline-source').textContent = `${sourceLabel}${futureNote}`;
  if (!reconciled.source.valid) {
    $('#current-length-result').textContent = 'Unavailable';
    $('#elapsed-result').textContent = 'Unavailable';
    $('#target-date-result').textContent = 'Unavailable';
    $('#estimate-summary').textContent = `${reconciled.source.message} A future manual baseline is never treated as today's length.`;
    $('#target-progress').style.width = '0%';
    return;
  }
  const baseline = new Date(`${state.estimator.baselineDate}T00:00:00`);
  const now = new Date();
  const elapsedDays = (now - baseline) / 86400000;
  const current = Math.max(0, state.estimator.baselineLengthCm + state.estimator.growthRateCmPerMonth * (elapsedDays / 30.4375));
  const remaining = Math.max(0, state.estimator.targetLengthCm - current);
  const months = state.estimator.growthRateCmPerMonth > 0 ? remaining / state.estimator.growthRateCmPerMonth : Infinity;
  const targetDate = Number.isFinite(months) ? new Date(now.getTime() + months * 30.4375 * 86400000) : null;
  $('#current-length-result').textContent = displayUnit(current, unit);
  $('#elapsed-result').textContent = `${Math.floor(elapsedDays)} days`;
  $('#target-date-result').textContent = targetDate ? targetDate.toLocaleDateString() : 'Unavailable at a zero growth rate';
  $('#estimate-summary').textContent = remaining === 0 ? 'The estimate has reached the selected target.' : `Approximately ${displayUnit(remaining, unit)} remains. This adjustable estimate cannot promise individual growth.`;
  const range = Math.max(0.01, state.estimator.targetLengthCm - state.estimator.baselineLengthCm);
  const progress = Math.max(0, Math.min(100, ((current - state.estimator.baselineLengthCm) / range) * 100));
  $('#target-progress').style.width = `${progress}%`;
}

function appendTextElement(parent, tagName, text, className = '', vocabularyExempt = false) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (vocabularyExempt) element.setAttribute('data-vocabulary-exempt', '');
  element.textContent = String(text ?? '');
  parent.append(element);
  return element;
}

function renderEmptyCollection(container, message) {
  container.replaceChildren();
  appendTextElement(container, 'div', message, 'empty-state');
}

async function renderHaircuts() {
  const list = $('#haircut-list');
  const query = $('#haircut-search');
  const records = await filterSearchItems(state.haircuts, (record) => `${record.date} ${record.note} ${record.postCutLengthCm}`, query);
  if (records === null) return;
  if (!records.length) { renderEmptyCollection(list, 'No haircut records match this view.'); return; }
  const today = todayDateString();
  list.replaceChildren();
  records.forEach((record) => {
    const article = document.createElement('article');
    article.className = 'collection-item';
    article.dataset.recordId = record.id;
    article.dataset.elementId = `haircut:${record.id}`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.selectHaircut = record.id;
    checkbox.setAttribute('aria-label', `Select haircut on ${record.date}`);
    article.append(checkbox);
    const copy = document.createElement('div');
    appendTextElement(copy, 'h4', `${record.date} · ${displayUnit(record.postCutLengthCm)}`);
    appendTextElement(copy, 'p', record.note || 'No note', '', true);
    const chronology = validateDateNotFuture(record.date, today);
    if (!chronology.valid) appendTextElement(copy, 'p', `${chronology.message} This record is excluded from the active baseline while its date remains in the future.`, 'field-error');
    article.append(copy);
    const edit = appendTextElement(article, 'button', 'Edit', 'text-button');
    edit.type = 'button';
    edit.dataset.editHaircut = record.id;
    list.append(article);
  });
  $$('[data-edit-haircut]').forEach((button) => button.addEventListener('click', () => editHaircut(button.dataset.editHaircut)));
  applyLocks();
  applyAppearance();
  scheduleVocabularyTextBoundary();
}

function editHaircut(id) {
  const record = state.haircuts.find((item) => item.id === id);
  if (!record) return;
  $('#haircut-date').value = record.date;
  $('#haircut-length').value = fromCentimetres(record.postCutLengthCm).toFixed(2);
  $('#haircut-note').value = record.note;
  $('#haircut-form').dataset.editId = id;
  setDateFieldValidation($('#haircut-date'), '#haircut-date-error', record.date);
  $('#haircut-date').focus();
}

function formatRelative(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

async function renderHistory() {
  const container = $('#history-list');
  if (!container) return;
  const from = $('#history-from')?.value ? new Date(`${$('#history-from').value}T00:00:00`).getTime() : -Infinity;
  const to = $('#history-to')?.value ? new Date(`${$('#history-to').value}T23:59:59`).getTime() : Infinity;
  const dateEntries = state.history.filter((entry) => { const at = new Date(entry.at).getTime(); return at >= from && at <= to && !isSchoolSensitiveText(`${entry.action} ${entry.detail}`); });
  const entries = await filterSearchItems(dateEntries, (entry) => `${entry.action} ${entry.detail}`, $('#history-search'));
  if (entries === null) return;
  if (!entries.length) { renderEmptyCollection(container, 'No history entries match the active filters.'); return; }
  container.replaceChildren();
  entries.forEach((entry) => {
    const article = document.createElement('article');
    article.className = 'collection-item';
    const icon = appendTextElement(article, 'span', '↶');
    icon.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('div');
    appendTextElement(copy, 'h4', entry.action);
    appendTextElement(copy, 'p', `${entry.detail} · ${formatRelative(entry.at)}`);
    article.append(copy);
    const button = appendTextElement(article, 'button', 'Copy', 'text-button');
    button.type = 'button';
    button.dataset.copyText = entry.detail;
    button.addEventListener('click', () => copyText(entry.detail));
    container.append(article);
  });
  scheduleVocabularyTextBoundary();
}

async function renderNotifications() {
  const container = $('#notification-list');
  if (!container) return;
  const visibleNotifications = state.notifications.filter((entry) => !isSchoolSensitiveText(`${entry.title} ${entry.body}`));
  const entries = await filterSearchItems(visibleNotifications, (entry) => `${entry.title} ${entry.body} ${entry.type}`, $('#notification-search'));
  if (entries === null) return;
  if (!entries.length) { renderEmptyCollection(container, 'No notifications match this view.'); return; }
  container.replaceChildren();
  entries.forEach((entry) => {
    const article = document.createElement('article');
    article.className = 'collection-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.selectNotification = entry.id;
    checkbox.setAttribute('aria-label', `Select notification ${entry.title}`);
    article.append(checkbox);
    const copy = document.createElement('div');
    appendTextElement(copy, 'h4', entry.title);
    appendTextElement(copy, 'p', `${entry.body} · ${formatRelative(entry.at)}`);
    article.append(copy);
    const button = appendTextElement(article, 'button', 'Dismiss', 'text-button');
    button.type = 'button';
    button.dataset.dismissNotification = entry.id;
    article.append(button);
    container.append(article);
  });
  $$('[data-dismiss-notification]').forEach((button) => button.addEventListener('click', () => { const item = state.notifications.find((entry) => entry.id === button.dataset.dismissNotification); if (item) item.dismissed = true; persist('Notification dismissed', item?.title || 'Notification'); renderNotifications(); }));
  scheduleVocabularyTextBoundary();
}

function renderSchedules() {
  $('#schedule-timezone').textContent = `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'browser local timezone'}. Daylight-saving changes follow the browser clock.`;
  const container = $('#schedule-list');
  if (!state.schedules.length) { renderEmptyCollection(container, 'No scheduled setting rules.'); return; }
  container.replaceChildren();
  state.schedules.forEach((rule) => {
    const article = document.createElement('article');
    article.className = 'collection-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled;
    checkbox.dataset.scheduleEnabled = rule.id;
    checkbox.setAttribute('aria-label', `Enable ${rule.label}`);
    article.append(checkbox);
    const copy = document.createElement('div');
    appendTextElement(copy, 'h4', rule.label, '', true);
    appendTextElement(copy, 'p', `${rule.start} to ${rule.end}, ${rule.theme}, days ${rule.days.join(', ')}`);
    article.append(copy);
    const remove = appendTextElement(article, 'button', 'Remove', 'text-button');
    remove.type = 'button';
    remove.dataset.removeSchedule = rule.id;
    article.append(remove);
    container.append(article);
  });
  $$('[data-schedule-enabled]').forEach((input) => input.addEventListener('change', () => { const rule = state.schedules.find((item) => item.id === input.dataset.scheduleEnabled); if (rule) rule.enabled = input.checked; persist('Schedule changed', `${rule?.label || 'Rule'} ${input.checked ? 'enabled' : 'disabled'}.`); applySchedules(); }));
  $$('[data-remove-schedule]').forEach((button) => button.addEventListener('click', () => requestDestructiveAction('Remove scheduled rule', `The selected schedule rule will be removed from this browser.`, () => { state.schedules = state.schedules.filter((item) => item.id !== button.dataset.removeSchedule); persist('Schedule removed', 'A scheduled settings rule was removed.'); renderSchedules(); })));
  scheduleVocabularyTextBoundary();
}

function applySchedules() {
  const now = new Date();
  const day = now.getDay();
  const minute = now.getHours() * 60 + now.getMinutes();
  const matching = state.schedules.filter((rule) => {
    if (!rule.enabled || !rule.days.includes(day)) return false;
    const [startHour, startMinute] = rule.start.split(':').map(Number);
    const [endHour, endMinute] = rule.end.split(':').map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    return start === end ? true : start < end ? minute >= start && minute < end : minute >= start || minute < end;
  });
  const winner = matching.at(-1);
  if (winner) document.documentElement.dataset.theme = winner.theme;
  else document.documentElement.dataset.theme = state.settings.theme;
}

async function renderTickets() {
  const container = $('#ticket-list');
  const entries = await filterSearchItems(state.tickets, (ticket) => `${ticket.number} ${ticket.category} ${ticket.description} ${ticket.status}`, $('#ticket-search'));
  if (entries === null) return;
  if (!entries.length) { renderEmptyCollection(container, 'No local tickets match this view.'); return; }
  container.replaceChildren();
  entries.forEach((ticket) => {
    const article = document.createElement('article');
    article.className = 'collection-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', `Select ticket ${ticket.number}`);
    article.append(checkbox);
    const copy = document.createElement('div');
    appendTextElement(copy, 'h4', `${ticket.number} · ${ticket.category}`, '', true);
    appendTextElement(copy, 'p', `${ticket.status} · ${ticket.description}`, '', true);
    article.append(copy);
    const button = appendTextElement(article, 'button', 'Advance', 'text-button');
    button.type = 'button';
    button.dataset.advanceTicket = ticket.id;
    article.append(button);
    container.append(article);
  });
  $$('[data-advance-ticket]').forEach((button) => button.addEventListener('click', () => { const ticket = state.tickets.find((item) => item.id === button.dataset.advanceTicket); if (!ticket) return; ticket.status = ticket.status === 'Created' ? 'Manual browser reset explained' : 'Closed locally'; persist('Support ticket advanced', `${ticket.number} moved to ${ticket.status}.`); renderTickets(); }));
  scheduleVocabularyTextBoundary();
}

async function renderChangelog() {
  const container = $('#changelog-list');
  if (!container) return;
  const from = $('#changelog-from')?.value ? new Date(`${$('#changelog-from').value}T00:00:00`).getTime() : -Infinity;
  const to = $('#changelog-to')?.value ? new Date(`${$('#changelog-to').value}T23:59:59`).getTime() : Infinity;
  const dateEntries = bundledChangelog.filter((entry) => { const at = entry.date ? new Date(`${entry.date}T12:00:00`).getTime() : 0; return at >= from && at <= to && !isSchoolSensitiveText(`${entry.title} ${entry.body}`); });
  const entries = await filterSearchItems(dateEntries, (entry) => `${entry.version} ${entry.title} ${entry.body} ${entry.commit}`, $('#changelog-search'));
  if (entries === null) return;
  container.innerHTML = entries.length ? entries.map((entry) => `<article class="surface-card"><p class="eyebrow">${escapeHtml(entry.version || 'Unreleased')} · ${escapeHtml(entry.date || 'Date unavailable')}</p><h3>${escapeHtml(entry.title || 'Recorded changes')}</h3><p>${escapeHtml(entry.body || 'No release notes were provided.')}</p>${entry.commit && /^[a-f0-9]{40}$/.test(entry.commit) ? `<a href="https://github.com/Ding-Ding-Projects/HairGrowthEstimator/commit/${entry.commit}">${entry.commit.slice(0, 12)}</a>` : '<span>Commit unavailable</span>'}</article>`).join('') : '<div class="empty-state">No changelog entries match the active filters.</div>';
}

function markdownToHtml(markdown) {
  const escaped = escapeHtml(markdown).replace(/\r\n/g, '\n');
  const lines = escaped.split('\n');
  let inCode = false;
  let inList = false;
  const output = [];
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith('```')) {
      if (!inCode) { if (inList) { output.push('</ul>'); inList = false; } output.push('<pre><code>'); inCode = true; }
      else { output.push('</code></pre>'); inCode = false; }
      continue;
    }
    if (inCode) { output.push(`${line}\n`); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { if (inList) { output.push('</ul>'); inList = false; } const level = heading[1].length; const headingId = heading[2].replace(/&[a-z0-9#]+;/gi, ' ').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'section'; output.push(`<h${level} id="doc-heading-${headingId}" data-doc-heading="${headingId}">${inlineMarkdown(heading[2])}</h${level}>`); continue; }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) { if (!inList) { output.push('<ul>'); inList = true; } output.push(`<li>${inlineMarkdown(bullet[1])}</li>`); continue; }
    if (inList) { output.push('</ul>'); inList = false; }
    if (!line.trim()) output.push(''); else output.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  if (inList) output.push('</ul>');
  if (inCode) output.push('</code></pre>');
  return output.join('\n');
}

function inlineMarkdown(value) {
  return value
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+|#[^\s)]+|\.\.?\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

let currentDocumentationId = null;

function resolveDocumentationPath(currentPath, href) {
  const [rawPath, rawHash = ''] = String(href || '').split('#', 2);
  if (!rawPath) return { path: currentPath, heading: rawHash };
  if (/^[a-z][a-z0-9+.-]*:/i.test(rawPath) || rawPath.startsWith('//')) return null;
  const base = String(currentPath || '').split('/').slice(0, -1);
  const source = rawPath.startsWith('/') ? rawPath.slice(1).split('/') : [...base, ...rawPath.split('/')];
  const normalized = [];
  for (const segment of source) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!normalized.length) return null;
      normalized.pop();
    } else normalized.push(segment);
  }
  const path = normalized.join('/');
  if (!path.startsWith('docs/') || !path.endsWith('.md')) return null;
  return { path, heading: rawHash };
}

function navigateDocumentationLink(event, currentArticle) {
  const anchor = event.target.closest('a[href]');
  if (!anchor || !currentArticle) return;
  const resolved = resolveDocumentationPath(currentArticle.path, anchor.getAttribute('href'));
  if (!resolved) return;
  const targetArticle = bundledDocs.find((article) => article.path === resolved.path);
  if (!targetArticle) return;
  event.preventDefault();
  openDoc(targetArticle.id, { focusArticle: true, heading: resolved.heading });
}

async function renderDocs() {
  const list = $('#docs-list');
  const visibleArticles = bundledDocs.filter((article) => !isSchoolSensitiveText(`${article.title} ${article.category} ${article.content}`));
  const entries = await filterSearchItems(visibleArticles, (article) => `${article.title} ${article.category} ${article.content}`, $('#docs-search'));
  if (entries === null) return;
  if (!entries.length) { list.setAttribute('aria-activedescendant', ''); renderEmptyCollection(list, 'No documentation articles match this search.'); return; }
  list.replaceChildren();
  entries.forEach((article, index) => {
    const option = document.createElement('div');
    option.id = `docs-option-${article.id.replace(/[^a-z0-9_-]/gi, '-')}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String((currentDocumentationId || entries[0].id) === article.id));
    option.dataset.docId = article.id;
    option.tabIndex = index === 0 ? 0 : -1;
    appendTextElement(option, 'strong', article.title);
    option.append(document.createElement('br'));
    appendTextElement(option, 'small', article.category);
    option.addEventListener('click', () => openDoc(article.id, { focusArticle: true }));
    option.addEventListener('keydown', handleDocumentationOptionKeydown);
    list.append(option);
  });
  if (!entries.some((article) => article.id === currentDocumentationId)) currentDocumentationId = entries[0].id;
  openDoc(currentDocumentationId, { focusArticle: false });
  scheduleVocabularyTextBoundary();
}

function handleDocumentationOptionKeydown(event) {
  const options = $$('[role="option"][data-doc-id]', $('#docs-list'));
  const index = options.indexOf(event.currentTarget);
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : event.key === 'ArrowUp' ? (index - 1 + options.length) % options.length : (index + 1) % options.length;
    options[nextIndex]?.focus();
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openDoc(event.currentTarget.dataset.docId, { focusArticle: true });
  }
}

function openDoc(id, { focusArticle = true, heading = '' } = {}) {
  const article = bundledDocs.find((item) => item.id === id);
  if (!article) return;
  currentDocumentationId = id;
  $$('[data-doc-id]').forEach((option) => {
    const active = option.dataset.docId === id;
    option.setAttribute('aria-selected', String(active));
    option.tabIndex = active ? 0 : -1;
    if (active) $('#docs-list').setAttribute('aria-activedescendant', option.id);
  });
  $('#docs-article').innerHTML = markdownToHtml(article.content);
  $('#docs-article').setAttribute('aria-label', article.title);
  $('#docs-article').onclick = (event) => navigateDocumentationLink(event, article);
  if (focusArticle) $('#docs-article').focus?.();
  if (heading) requestAnimationFrame(() => $(`[data-doc-heading="${CSS.escape(heading)}"]`, $('#docs-article'))?.scrollIntoView({ block: 'start' }));
  scheduleVocabularyTextBoundary();
}

function renderAttentionBar() {
  const settings = state.settings.attention;
  document.body.classList.toggle('focus-mode', settings.focus);
  document.body.classList.toggle('low-stimulation', settings.lowStim);
  const bar = $('#attention-bar');
  bar.hidden = !settings.time && !settings.one;
  $('#session-elapsed').textContent = `Session ${Math.floor((Date.now() - startedAt) / 60000)} min`;
  $('#last-change').textContent = `Last change ${formatRelative(new Date(lastChangedAt).toISOString())}`;
  $('#next-action-display').textContent = settings.one && settings.nextAction ? `Next: ${settings.nextAction}` : '';
}

function applyExplicitSettingNames() {
  for (const [id, name] of Object.entries(SETTING_CONTROL_NAMES)) {
    const control = document.getElementById(id);
    if (control) control.setAttribute('aria-label', name);
  }
  $$('input[name="schedule-day"]').forEach((control) => control.setAttribute('aria-label', `Schedule on ${control.closest('label')?.textContent?.trim() || control.value}`));
  $$('#panel-settings button, #panel-settings input, #panel-settings select, #panel-settings textarea').forEach((control) => {
    if (control.getAttribute('aria-label') || control.getAttribute('aria-labelledby') || control.closest('label')) return;
    const heading = control.closest('.setting-card, .surface-card')?.querySelector('h3')?.textContent?.trim();
    if (heading) control.setAttribute('aria-label', `${heading}: ${control.textContent?.trim() || control.type || 'control'}`);
  });
}

function vocabularyStatusCopy() {
  const mode = state.settings.schoolMode ? 'en' : state.settings.language;
  const copy = VOCABULARY_STATUS_COPY[vocabularyUiState] || VOCABULARY_STATUS_COPY.empty;
  if (mode === 'yue') return copy.yue;
  if (mode === 'both') return `${copy.en} · ${copy.yue}`;
  return copy.en;
}

function localizedVocabularyAction(action) {
  const mode = state.settings.schoolMode ? 'en' : state.settings.language;
  const copy = VOCABULARY_ACTION_COPY[action];
  if (mode === 'yue') return copy.yue;
  if (mode === 'both') return `${copy.en} · ${copy.yue}`;
  return copy.en;
}

function renderSettings() {
  const s = state.settings;
  $('#language-mode').value = s.language;
  $('#funny-en').value = s.funnyEn;
  $('#funny-yue').value = s.funnyYue;
  $('output[for="funny-en"]').value = s.funnyEn;
  $('output[for="funny-yue"]').value = s.funnyYue;
  $('#dialog-emoji').checked = s.dialogEmoji;
  $('#school-mode').checked = s.schoolMode;
  $('#theme-select').value = s.theme;
  $('#density-select').value = s.density;
  $('#accent-color').value = /^#[a-f0-9]{6}$/i.test(s.accent) ? s.accent : '#a7f3d0';
  $('#rainbow-speed').value = s.rainbowSpeed;
  $('output[for="rainbow-speed"]').value = s.rainbowSpeed;
  $('#font-family').value = s.fontFamily;
  $('#font-scale').value = s.fontScale;
  $('#dock-select').value = s.dock;
  $('#logo-preset').value = s.logo.preset;
  $('#logo-fit').value = s.logo.fit;
  $('#logo-background').value = s.logo.background;
  $('#display-name-input').value = s.displayName;
  $('#narrator-enabled').checked = s.narrator.enabled;
  $('#narrator-rate').value = s.narrator.rate;
  $('#narrator-pitch').value = s.narrator.pitch;
  $('#reduced-motion').checked = s.reducedMotion;
  $('#palette-size').value = s.paletteSize;
  $('#adhd-focus').checked = s.attention.focus;
  $('#adhd-low-stim').checked = s.attention.lowStim;
  $('#adhd-time').checked = s.attention.time;
  $('#adhd-one').checked = s.attention.one;
  $('#adhd-momentum').checked = s.attention.momentum;
  $('#next-action').value = s.attention.nextAction;
  $('#ollama-url').value = state.ollama.url;
  $('#vocabulary-status').textContent = vocabularyStatusCopy();
  const hasVocabularyCache = Object.keys(validatePersonalVocabularyCache(state.vocabulary).entries).length > 0;
  $('#replace-vocabulary').textContent = localizedVocabularyAction(hasVocabularyCache ? 'replace' : 'choose');
  $('#clear-vocabulary').disabled = !hasVocabularyCache;
  $('#school-mode-label').textContent = s.schoolModeName;
  applyExplicitSettingNames();
  scheduleVocabularyTextBoundary();
}

function applySchoolModeVisibility() {
  const changed = lastRenderedSchoolMode !== state.settings.schoolMode;
  lastRenderedSchoolMode = state.settings.schoolMode;
  if (changed) {
    renderHistory();
    renderNotifications();
    renderDocs();
    renderChangelog();
    filterSettings();
  }
  if (!state.settings.schoolMode) return;
  $$('.snackbar').filter((item) => isSchoolSensitiveText(item.textContent)).forEach((item) => item.remove());
  if ($('#command-palette').open) renderCommandPalette();
  if ($('#regex-dialog').open && SCHOOL_SENSITIVE_REGEX_OWNERS.has(activeRegexOwner)) $('#regex-dialog').close();
  if (!$('#context-menu').hidden && contextTarget?.closest?.('[data-school-sensitive], .school-hidden')) closeContextMenu();
  if ($('#appearance-dialog').open && appearanceTarget?.closest?.('[data-school-sensitive], .school-hidden')) $('#appearance-dialog').close();
  if ($('#lock-dialog').open && lockTarget?.closest?.('[data-school-sensitive], .school-hidden')) $('#lock-dialog').close();
}

function applySettings() {
  const s = state.settings;
  document.documentElement.dataset.theme = s.theme;
  document.documentElement.dataset.density = s.density;
  document.documentElement.style.setProperty('--accent', s.rainbow ? 'hsl(0 85% 58%)' : s.accent);
  document.documentElement.style.setProperty('--font-family', s.fontFamily);
  document.documentElement.style.setProperty('--font-scale', s.fontScale);
  const durations = { 1: '18s', 2: '12s', 3: '8s', 4: '5s', 5: '3s' };
  document.documentElement.style.setProperty('--rainbow-duration', durations[s.rainbowSpeed] || '8s');
  document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
  document.body.classList.toggle('school-mode', s.schoolMode);
  document.body.classList.toggle('rainbow-accent', s.rainbow);
  $$('.dialog-emoji').forEach((emoji) => { emoji.hidden = !s.dialogEmoji; });
  $('#app-shell').dataset.dock = s.dock;
  $('#display-name').textContent = s.displayName;
  document.title = s.displayName;
  const logo = $('#brand-mark');
  logo.style.objectFit = s.logo.fit;
  logo.style.background = s.logo.background;
  if (s.logo.customLogoData) logo.src = s.logo.customLogoData;
  else logo.src = s.logo.preset === 'strand' ? 'logo.svg' : s.logo.preset === 'ruler' ? 'logo-ruler.svg' : 'logo-monogram.svg';
  if (s.rainbow) $$('.filled-button, .brand-mark').forEach((element) => element.classList.add('rainbow-color'));
  else $$('.rainbow-color').forEach((element) => element.classList.remove('rainbow-color'));
  renderTabs();
  renderAttentionBar();
  applySchedules();
  applySchoolModeVisibility();
  scheduleVocabularyTextBoundary();
}

function renderAll() {
  renderProvenance();
  renderSettings();
  applySettings();
  renderEstimator();
  renderHaircuts();
  renderHistory();
  renderNotifications();
  renderSchedules();
  renderTickets();
  renderDocs();
  renderChangelog();
  renderOllamaModels();
  renderTotpEntries();
  startHairAnimation();
  activateTab(location.hash.slice(1) && currentTabDefinition(location.hash.slice(1)) ? location.hash.slice(1) : state.activeTab, null, false);
}

function createRegexWorkbench(owner) {
  const config = safePattern(owner);
  const id = `regex-${owner.replace(/[^a-z0-9_-]/gi, '-')}`;
  return `<section class="surface-card workbench-grid" data-regex-owner="${escapeHtml(owner)}">
    <label>Engine<input value="JavaScript RegExp, browser runtime" readonly></label>
    <label>Mode<select data-regex-mode><option value="plain" ${config.enabled ? '' : 'selected'}>Plain text</option><option value="regex" ${config.enabled ? 'selected' : ''}>Regular expression</option></select></label>
    <label class="full-span">Pattern<input id="${id}-pattern" data-regex-pattern value="${escapeHtml(config.pattern || '')}" spellcheck="false" autocomplete="off"></label>
    <label>Flags<input data-regex-flags value="${escapeHtml(config.flags || 'iu')}" maxlength="8" spellcheck="false"></label>
    <label>Replacement<input data-regex-replacement value="${escapeHtml(config.replacement || '')}" spellcheck="false"></label>
    <label class="full-span">Sample text<textarea data-regex-sample rows="7" spellcheck="false">${escapeHtml(config.sample || 'Hair grew 1.0 cm in 30 days.\nHaircut reset: 3.5 cm.')}</textarea></label>
    <div class="button-row full-span"><button class="filled-button" type="button" data-regex-run>Run bounded evaluation</button><button class="tonal-button" type="button" data-regex-copy>Copy pattern</button><button class="tonal-button" type="button" data-regex-export>Export snippet</button><button class="tonal-button" type="button" data-regex-import>Import snippet</button></div>
    <input type="file" accept="application/json" data-regex-import-file hidden>
    <section><h3>Structured explanation</h3><div data-regex-explanation class="collection-list"></div></section>
    <section><h3>Live matches and captures</h3><div data-regex-results class="collection-list"></div></section>
    <section class="full-span"><h3>Replacement preview</h3><pre data-regex-preview></pre></section>
    <section class="full-span"><h3>Expected outcomes</h3><div class="inline-form"><label>Sample<input data-regex-case-sample></label><label>Expected<select data-regex-case-expected><option value="match">Match</option><option value="no-match">No match</option></select></label><button class="tonal-button" type="button" data-regex-add-case>Add case</button></div><div data-regex-cases class="collection-list"></div></section>
    <section class="full-span"><h3>Engine capabilities</h3><div class="capability-grid">
      ${['Literals and escapes|supported','Unicode code points|supported','Character classes|supported','Anchors and boundaries|supported','Named and numbered groups|supported','Non-capturing groups|supported','Alternation|supported','Greedy and lazy quantifiers|supported','Lookahead|supported','Lookbehind|runtime dependent','Backreferences|supported','Inline modifiers|limited','Replacement templates|supported','Zero-width matches|handled','Atomic groups|unsupported: JavaScript RegExp does not expose atomic groups','Possessive quantifiers|unsupported: JavaScript RegExp does not expose possessive quantifiers','Class intersection and subtraction|runtime dependent under Unicode sets','Conditionals and subroutines|unsupported: JavaScript RegExp has no conditional or subroutine syntax','Bounded execution trace|unsupported: browser RegExp does not expose a step trace'].map((entry) => { const [name, status] = entry.split('|'); const supported = status === 'supported'; return `<div class="capability-item ${supported ? '' : 'unsupported'}"><strong>${escapeHtml(name)}</strong><br><span>${escapeHtml(status)}</span></div>`; }).join('')}
    </div></section>
    <section class="full-span"><h3>Performance and safety</h3><p data-regex-performance>Evaluation has not run. Pattern and sample are capped at 2,000 and 20,000 characters. Global match navigation is capped at 500 results.</p><p data-regex-risk></p></section>
  </section>`;
}

function mountRegexWorkbench(host, owner) {
  host.innerHTML = createRegexWorkbench(owner);
  const root = host.firstElementChild;
  const config = safePattern(owner);
  const patternInput = $('[data-regex-pattern]', root);
  const flagsInput = $('[data-regex-flags]', root);
  const modeInput = $('[data-regex-mode]', root);
  const sampleInput = $('[data-regex-sample]', root);
  const replacementInput = $('[data-regex-replacement]', root);
  const saveInputs = () => {
    state.regexOwners[owner] = {
      ...safePattern(owner),
      enabled: modeInput.value === 'regex',
      pattern: patternInput.value.slice(0, 2000),
      flags: flagsInput.value.replace(/[^dgimsuvy]/g, '').slice(0, 8),
      sample: sampleInput.value.slice(0, 20000),
      replacement: replacementInput.value.slice(0, 2000)
    };
    persist(null, null, { record: false });
    const ownedInput = document.querySelector(`[data-search-owner="${CSS.escape(owner)}"]`);
    if (ownedInput && ownedInput instanceof HTMLInputElement) {
      state.regexOwners[owner].plain = ownedInput.value;
      ownedInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  [patternInput, flagsInput, modeInput, sampleInput, replacementInput].forEach((input) => input.addEventListener('input', saveInputs));
  $('[data-regex-run]', root).addEventListener('click', () => runRegexWorkbench(root, owner));
  $('[data-regex-copy]', root).addEventListener('click', () => copyText(`/${patternInput.value}/${flagsInput.value}`));
  $('[data-regex-export]', root).addEventListener('click', () => downloadText(`regex-${owner}.json`, JSON.stringify(state.regexOwners[owner] || config, null, 2), 'application/json'));
  $('[data-regex-import]', root).addEventListener('click', () => $('[data-regex-import-file]', root).click());
  $('[data-regex-import-file]', root).addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file || file.size > 32768) return showNotification('Regex snippet rejected', 'Choose a JSON snippet no larger than 32 KiB.', 'error');
    try {
      const imported = parseJsonStrict(await file.text(), { maxDepth: 3, maxBytes: 32768 });
      if (typeof imported.pattern !== 'string' || typeof imported.flags !== 'string') throw new Error('Snippet must contain string pattern and flags fields.');
      patternInput.value = imported.pattern.slice(0, 2000);
      flagsInput.value = imported.flags.replace(/[^dgimsuvy]/g, '').slice(0, 8);
      sampleInput.value = typeof imported.sample === 'string' ? imported.sample.slice(0, 20000) : '';
      replacementInput.value = typeof imported.replacement === 'string' ? imported.replacement.slice(0, 2000) : '';
      modeInput.value = imported.enabled ? 'regex' : 'plain';
      saveInputs();
      runRegexWorkbench(root, owner);
    } catch (error) { showNotification('Regex snippet rejected', error.message, 'error'); }
  });
  $('[data-regex-add-case]', root).addEventListener('click', () => {
    const sample = $('[data-regex-case-sample]', root).value.slice(0, 2000);
    const expected = $('[data-regex-case-expected]', root).value;
    if (!sample) return;
    const next = safePattern(owner);
    next.cases = [...(next.cases || []), { id: crypto.randomUUID(), sample, expected }].slice(-100);
    state.regexOwners[owner] = next;
    persist('Regex test case added', `Added an expected ${expected} case for ${owner}.`);
    runRegexWorkbench(root, owner);
  });
  $('[data-regex-results]', root).innerHTML = '<div class="empty-state">Run the bounded evaluation when you are ready. No pattern runs automatically at startup.</div>';
  $('[data-regex-preview]', root).textContent = 'Replacement preview waits for an explicit run.';
  $('[data-regex-performance]', root).textContent = 'Evaluation has not run.';
}

function explainRegex(pattern) {
  const tokens = [];
  const scanners = [
    [/\^|\$/g, 'Anchor'],
    [/\\[bBAZzG]/g, 'Boundary or anchor escape'],
    [/\(\?<([A-Za-z][A-Za-z0-9_]*)>/g, 'Named capture group'],
    [/\((?!\?)/g, 'Numbered capture group'],
    [/\(\?:/g, 'Non-capturing group'],
    [/\(\?<?[=!]/g, 'Lookaround assertion'],
    [/\[[^\]]*\]/g, 'Character class'],
    [/[+*?]|\{\d+(?:,\d*)?\}/g, 'Quantifier'],
    [/\|/g, 'Alternation'],
    [/\\[pP]\{[^}]+\}/g, 'Unicode property escape'],
    [/\\(?:\d+|k<[^>]+>)/g, 'Backreference']
  ];
  scanners.forEach(([regex, label]) => { for (const match of pattern.matchAll(regex)) tokens.push({ token: match[0], index: match.index, label }); });
  tokens.sort((a, b) => a.index - b.index);
  return tokens.length ? tokens : [{ token: pattern || '(empty)', index: 0, label: pattern ? 'Literal or engine-specific sequence' : 'No pattern' }];
}

function regexRisk(pattern) {
  const nested = /\([^)]*[+*][^)]*\)[+*{]/.test(pattern);
  const overlapping = /(\.\*|\.\+).*(\.\*|\.\+)/.test(pattern);
  const ambiguous = /\([^|)]*\|[^|)]*\)[+*{]/.test(pattern);
  if (nested || overlapping) return 'High backtracking risk: nested or overlapping unbounded quantifiers detected. Use bounded quantifiers or narrower character classes.';
  if (ambiguous) return 'Moderate backtracking risk: repeated ambiguous alternation detected. Test adversarial input before use.';
  return 'No common catastrophic-backtracking shape was detected. This is a heuristic, not a proof.';
}

async function runRegexWorkbench(root, owner) {
  const pattern = $('[data-regex-pattern]', root).value.slice(0, 2000);
  const flagsRaw = $('[data-regex-flags]', root).value.replace(/[^dgimsuvy]/g, '').slice(0, 8);
  const sample = $('[data-regex-sample]', root).value.slice(0, 20000);
  const replacement = $('[data-regex-replacement]', root).value.slice(0, 2000);
  const mode = $('[data-regex-mode]', root).value;
  const explanation = $('[data-regex-explanation]', root);
  const results = $('[data-regex-results]', root);
  const preview = $('[data-regex-preview]', root);
  const performanceOutput = $('[data-regex-performance]', root);
  const risk = $('[data-regex-risk]', root);
  explanation.innerHTML = explainRegex(pattern).map((token) => `<div class="collection-item"><code>${escapeHtml(token.token)}</code><div><strong>${escapeHtml(token.label)}</strong><p>Index ${token.index}</p></div></div>`).join('');
  risk.textContent = regexRisk(pattern);
  const started = window.performance?.now?.() ?? Date.now();
  try {
    const testCases = safePattern(owner).cases || [];
    if (mode === 'plain') {
      const index = sample.toLocaleLowerCase().indexOf(pattern.toLocaleLowerCase());
      results.innerHTML = index >= 0 ? `<div class="collection-item"><span>#1</span><div><strong>${escapeHtml(pattern)}</strong><p>Index ${index}</p></div></div>` : '<div class="empty-state">No match.</div>';
      preview.textContent = pattern ? sample.split(pattern).join(replacement) : sample;
      $('[data-regex-cases]', root).innerHTML = testCases.length ? testCases.map((testCase) => {
        const actual = testCase.sample.toLocaleLowerCase().includes(pattern.toLocaleLowerCase());
        const pass = actual === (testCase.expected === 'match');
        return `<div class="collection-item"><span>${pass ? 'Pass' : 'Fail'}</span><div><strong>${escapeHtml(testCase.sample)}</strong><p>Expected ${escapeHtml(testCase.expected)}, actual ${actual ? 'match' : 'no match'}</p></div></div>`;
      }).join('') : '<div class="empty-state">No expected-outcome cases.</div>';
    } else {
      if (!regexWorkerClient) throw new Error('Disposable Worker support is unavailable, so regular expression evaluation is disabled.');
      const evaluated = await regexWorkerClient.run({
        operation: 'scan',
        pattern,
        flags: flagsRaw,
        sample,
        replacement,
        testCases: testCases.map((testCase) => ({ text: testCase.sample, expected: testCase.expected === 'match' }))
      });
      const matches = evaluated.matches;
      results.innerHTML = matches.length ? matches.map((item, index) => `<div class="collection-item"><span>#${index + 1}</span><div><strong>${escapeHtml(item.text || '(zero-width)')}</strong><p>Index ${item.index}; captures ${escapeHtml(JSON.stringify(item.captures))}; named ${escapeHtml(JSON.stringify(item.groups))}</p></div></div>`).join('') : '<div class="empty-state">No match.</div>';
      preview.textContent = evaluated.preview;
      $('[data-regex-cases]', root).innerHTML = evaluated.tests.length ? evaluated.tests.map((testCase, index) => {
        const sourceCase = testCases[index];
        return `<div class="collection-item"><span>${testCase.passed ? 'Pass' : 'Fail'}</span><div><strong>${escapeHtml(sourceCase.sample)}</strong><p>Expected ${sourceCase.expected === 'match' ? 'match' : 'no match'}, actual ${testCase.actual ? 'match' : 'no match'}</p></div></div>`;
      }).join('') : '<div class="empty-state">No expected-outcome cases.</div>';
    }
    const elapsed = (window.performance?.now?.() ?? Date.now()) - started;
    performanceOutput.textContent = `Evaluation completed in ${elapsed.toFixed(3)} ms. Pattern ${pattern.length}/2,000 characters, sample ${sample.length}/20,000 characters, maximum 500 navigated matches.`;
  } catch (error) {
    results.innerHTML = `<div class="empty-state">Invalid pattern: ${escapeHtml(error.message)}</div>`;
    preview.textContent = 'Replacement preview unavailable for an invalid pattern.';
    performanceOutput.textContent = 'Evaluation stopped before matching because the pattern was invalid.';
  }
}

function openRegexBuilder(ownerOrInput) {
  const input = typeof ownerOrInput === 'string' ? document.getElementById(ownerOrInput) : ownerOrInput;
  const owner = input?.dataset?.searchOwner || input?.id || String(ownerOrInput || 'standalone');
  activeRegexOwner = owner;
  if (input && 'value' in input) {
    state.regexOwners[owner] = { ...safePattern(owner), plain: String(input.value || '') };
  }
  $('#regex-owner-name').textContent = owner;
  mountRegexWorkbench($('#regex-dialog-host'), owner);
  enhanceDropdowns($('#regex-dialog'));
  $('#regex-dialog').showModal();
}

function enhanceDropdowns(root = document) {
  $$('select:not([data-dropdown-enhanced])', root).forEach((select, index) => {
    if (!select.id) select.id = `generated-select-${index}-${crypto.randomUUID().slice(0, 8)}`;
    const owner = select.dataset.searchOwner || select.id;
    select.dataset.searchOwner = owner;
    select.dataset.dropdownEnhanced = 'true';
    const wrapper = document.createElement('div');
    wrapper.className = 'select-filter-wrap';
    const filter = document.createElement('input');
    filter.type = 'search';
    filter.id = `${select.id}-filter`;
    filter.placeholder = `Filter ${select.getAttribute('aria-label') || select.closest('label')?.childNodes[0]?.textContent?.trim() || 'choices'}`;
    filter.dataset.searchOwner = `${owner}:dropdown-filter`;
    filter.setAttribute('aria-label', `Filter choices for ${select.getAttribute('aria-label') || select.id}`);
    const builder = document.createElement('button');
    builder.type = 'button';
    builder.className = 'builder-button';
    builder.textContent = '.*';
    builder.dataset.openRegexFor = filter.id;
    builder.setAttribute('aria-label', `Open regex builder for ${select.getAttribute('aria-label') || select.id} choices`);
    const status = document.createElement('span');
    status.className = 'sr-only';
    status.setAttribute('aria-live', 'polite');
    wrapper.append(filter, builder, status);
    select.before(wrapper);
    setupInputSearchState(filter);
    filter.addEventListener('input', async () => {
      const options = [...select.options];
      const visibleOptions = await filterSearchItems(options, (option) => option.textContent, filter);
      if (visibleOptions === null) return;
      const visible = new Set(visibleOptions);
      options.forEach((option) => { option.hidden = !visible.has(option); });
      status.textContent = `${visible.size} choices visible.`;
    });
    builder.addEventListener('click', () => openRegexBuilder(filter));
  });
}

function assignStableElementIds() {
  let index = 0;
  $$('body *').forEach((element) => {
    if (['SCRIPT', 'STYLE', 'META', 'LINK'].includes(element.tagName)) return;
    if (!element.dataset.elementId) element.dataset.elementId = element.id ? `id:${element.id}` : `${element.tagName.toLowerCase()}:${index++}`;
  });
}

function targetName(element) {
  if (!element) return 'Global website';
  return element.getAttribute('aria-label') || element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || element.tagName.toLowerCase();
}

function targetId(element) { return element?.dataset?.elementId || 'global'; }

function appearanceEditorMarkup(element) {
  const id = targetId(element);
  const config = state.appearance[id] || { state: 'normal', layers: [{ id: crypto.randomUUID(), name: 'Base layer', visible: true, locked: false }], styles: {} };
  state.appearance[id] = config;
  const style = config.styles[config.state || 'normal'] || {};
  return `<section class="appearance-grid" data-appearance-id="${escapeHtml(id)}">
    <section><h3>Layers</h3><div class="layer-list">${config.layers.map((layer, index) => `<div class="layer-row" data-layer-id="${layer.id}"><input type="checkbox" ${layer.visible ? 'checked' : ''} aria-label="Show ${escapeHtml(layer.name)}"><input value="${escapeHtml(layer.name)}" aria-label="Layer name"><button type="button" class="icon-button" data-layer-up="${layer.id}" aria-label="Move layer up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="icon-button" data-layer-delete="${layer.id}" aria-label="Delete layer">×</button></div>`).join('')}</div><div class="button-row"><button class="tonal-button" type="button" data-add-layer>Add layer</button><button class="tonal-button" type="button" data-duplicate-layer>Duplicate layer</button></div></section>
    <section><h3>State</h3><label>Interaction state<select data-appearance-state><option value="normal">Normal</option><option value="hover">Hover</option><option value="focus">Focus</option><option value="pressed">Pressed</option><option value="selected">Selected</option><option value="disabled">Disabled</option><option value="loading">Loading</option><option value="success">Success</option><option value="warning">Warning</option><option value="error">Error</option></select></label><p>Unsupported pseudo-state injection remains visible as a saved preview state and is not claimed as live CSS unless the page enters that state.</p></section>
    <section><h3>Typography</h3><label>Family<select data-style="fontFamily"><option value="">Inherit</option><option value="system-ui">System UI</option><option value="Arial, sans-serif">Arial</option><option value="Georgia, serif">Georgia</option><option value="'Microsoft JhengHei', sans-serif">Microsoft JhengHei</option></select></label><label>Size<input data-style="fontSize" type="text" value="${escapeHtml(style.fontSize || '')}" placeholder="1rem or 18px"></label><label>Weight<input data-style="fontWeight" type="number" min="100" max="900" step="100" value="${escapeHtml(style.fontWeight || '')}"></label><label>Style<select data-style="fontStyle"><option value="">Inherit</option><option value="normal">Normal</option><option value="italic">Italic</option><option value="oblique">Oblique</option></select></label><label>Decoration<select data-style="textDecoration"><option value="">None</option><option value="underline">Underline</option><option value="line-through">Strikethrough</option><option value="underline double">Double underline</option><option value="overline">Overline</option></select></label><label>Letter spacing<input data-style="letterSpacing" type="text" value="${escapeHtml(style.letterSpacing || '')}" placeholder="0.02em"></label><label>Line height<input data-style="lineHeight" type="text" value="${escapeHtml(style.lineHeight || '')}" placeholder="1.5"></label><label>Alignment<select data-style="textAlign"><option value="">Inherit</option><option>left</option><option>center</option><option>right</option><option>justify</option></select></label></section>
    <section><h3>Shape and effects</h3><label>Radius<input data-style="borderRadius" type="text" value="${escapeHtml(style.borderRadius || '')}" placeholder="1rem"></label><label>Padding<input data-style="padding" type="text" value="${escapeHtml(style.padding || '')}" placeholder="1rem"></label><label>Border<input data-style="border" type="text" value="${escapeHtml(style.border || '')}" placeholder="1px solid #ffffff"></label><label>Shadow<input data-style="boxShadow" type="text" value="${escapeHtml(style.boxShadow || '')}" placeholder="0 8px 30px #0008"></label><label>Opacity<input data-style="opacity" type="range" min="0.1" max="1" step="0.05" value="${escapeHtml(style.opacity || '1')}"></label><label>Transform<input data-style="transform" type="text" value="${escapeHtml(style.transform || '')}" placeholder="scale(1) rotate(0deg)"></label><label>Filter<input data-style="filter" type="text" value="${escapeHtml(style.filter || '')}" placeholder="blur(0) saturate(1)"></label><label>Blend mode<select data-style="mixBlendMode"><option value="">Normal</option><option>multiply</option><option>screen</option><option>overlay</option><option>difference</option><option>color</option></select></label></section>
    <section class="full-span"><h3>Infinite color picker and translator</h3><div class="button-row"><input type="color" data-color-picker value="${normalizeHex(style.color || '#e0e3e3')}"><input data-style="color" value="${escapeHtml(style.color || '')}" placeholder="#e0e3e3"><button class="tonal-button" type="button" data-set-rainbow>Animated rainbow</button><input type="color" data-background-picker value="${normalizeHex(style.backgroundColor || '#1d2323')}"><input data-style="backgroundColor" value="${escapeHtml(style.backgroundColor || '')}" placeholder="#1d2323"></div><div class="color-translations" data-color-translations></div></section>
    <section class="full-span"><h3>Professional capability matrix</h3><div class="capability-grid">${['Ordered layers and groups|implemented locally','Show, lock, duplicate, rename, reorder|implemented for layers','Opacity and blend modes|implemented','Clipping and vector masks|unavailable in the static DOM adapter','Gradients and pattern fills|available through CSS background syntax','Multiple borders|limited to CSS border and layered shadows','Multiple shadows and glows|available through CSS box-shadow syntax','Blur and backdrop effects|filter is implemented; backdrop depends on browser support','Transforms and perspective|available through CSS transform syntax','Crop, fit, focal point, safe area|implemented for custom logo; unavailable for arbitrary DOM text','Filters and color adjustments|available through CSS filter syntax','Shape and corner editing|implemented through radius and border','Typography controls|implemented browser-safe subset','Rulers, guides, channels, paths|unavailable in the static DOM adapter','Undo and redo|append-only history records changes; direct stack unavailable','Copy and paste style|export and import target style below','Per-property reset|clear a field; target and global reset available','State inheritance and overrides|stored per state with normal fallback'].map((row) => { const [name, status] = row.split('|'); return `<div class="capability-item ${status.startsWith('unavailable') ? 'unsupported' : ''}"><strong>${escapeHtml(name)}</strong><br>${escapeHtml(status)}</div>`; }).join('')}</div></section>
    <section class="full-span"><h3>Preview and portability</h3><div class="button-row"><button class="filled-button" type="button" data-apply-style>Apply live</button><button class="tonal-button" type="button" data-copy-style>Copy style JSON</button><button class="tonal-button" type="button" data-export-style>Export preset</button><button class="tonal-button" type="button" data-import-style>Import preset</button><button class="danger-button" type="button" data-reset-style>Reset target</button></div><input type="file" accept="application/json" data-style-file hidden></section>
  </section>`;
}

function normalizeHex(value) {
  const match = String(value).trim().match(/^#([a-f0-9]{6})$/i);
  return match ? `#${match[1]}` : '#a7f3d0';
}

function parseHex(value) {
  const hex = normalizeHex(value).slice(1);
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), delta = max - min;
  let h = 0;
  if (delta) h = max === rn ? ((gn - bn) / delta) % 6 : max === gn ? (bn - rn) / delta + 2 : (rn - gn) / delta + 4;
  h = Math.round((h * 60 + 360) % 360);
  const l = (max + min) / 2;
  const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
  return { h, s: s * 100, l: l * 100 };
}

function rgbToHsv({ r, g, b }) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), delta = max - min;
  let h = 0;
  if (delta) h = max === rn ? ((gn - bn) / delta) % 6 : max === gn ? (bn - rn) / delta + 2 : (rn - gn) / delta + 4;
  return { h: (h * 60 + 360) % 360, s: max ? delta / max * 100 : 0, v: max * 100 };
}

function rgbToCmyk({ r, g, b }) {
  const c = 1 - r / 255, m = 1 - g / 255, y = 1 - b / 255, k = Math.min(c, m, y);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return { c: (c - k) / (1 - k) * 100, m: (m - k) / (1 - k) * 100, y: (y - k) / (1 - k) * 100, k: k * 100 };
}

function rgbToXyz({ r, g, b }) {
  const linear = (value) => { const n = value / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
  const rn = linear(r), gn = linear(g), bn = linear(b);
  return { x: (rn * 0.4124564 + gn * 0.3575761 + bn * 0.1804375) * 100, y: (rn * 0.2126729 + gn * 0.7151522 + bn * 0.072175) * 100, z: (rn * 0.0193339 + gn * 0.119192 + bn * 0.9503041) * 100 };
}

function xyzToLab({ x, y, z }) {
  const f = (value) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = f(x / 95.047), fy = f(y / 100), fz = f(z / 108.883);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function rgbToOklab({ r, g, b }) {
  const linear = (value) => { const n = value / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; };
  const rn = linear(r), gn = linear(g), bn = linear(b);
  const l = 0.4122214708 * rn + 0.5363325363 * gn + 0.0514459929 * bn;
  const m = 0.2119034982 * rn + 0.6806995451 * gn + 0.1073969566 * bn;
  const s = 0.0883024619 * rn + 0.2817188376 * gn + 0.6299787005 * bn;
  const l3 = Math.cbrt(l), m3 = Math.cbrt(m), s3 = Math.cbrt(s);
  return { l: 0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3, a: 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3, b: 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3 };
}

function renderColorTranslations(root, value) {
  const rgb = parseHex(value);
  const hsl = rgbToHsl(rgb);
  const hsv = rgbToHsv(rgb);
  const hwb = { h: hsv.h, w: Math.min(rgb.r, rgb.g, rgb.b) / 255 * 100, b: (1 - Math.max(rgb.r, rgb.g, rgb.b) / 255) * 100 };
  const cmyk = rgbToCmyk(rgb);
  const lab = xyzToLab(rgbToXyz(rgb));
  const lch = { l: lab.l, c: Math.hypot(lab.a, lab.b), h: (Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360 };
  const oklab = rgbToOklab(rgb);
  const oklch = { l: oklab.l, c: Math.hypot(oklab.a, oklab.b), h: (Math.atan2(oklab.b, oklab.a) * 180 / Math.PI + 360) % 360 };
  const hex = normalizeHex(value).toUpperCase();
  const values = {
    Named: 'No guaranteed CSS keyword for this exact color', HEX: hex, HEX8: `${hex}FF`, RGB: `rgb(${rgb.r} ${rgb.g} ${rgb.b})`, RGBA: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`, HSL: `hsl(${hsl.h} ${hsl.s.toFixed(2)}% ${hsl.l.toFixed(2)}%)`, HSLA: `hsla(${hsl.h}, ${hsl.s.toFixed(2)}%, ${hsl.l.toFixed(2)}%, 1)`, HSV: `hsv(${hsv.h.toFixed(2)} ${hsv.s.toFixed(2)}% ${hsv.v.toFixed(2)}%)`, HWB: `hwb(${hwb.h.toFixed(2)} ${hwb.w.toFixed(2)}% ${hwb.b.toFixed(2)}%)`, CIELAB: `lab(${lab.l.toFixed(3)} ${lab.a.toFixed(3)} ${lab.b.toFixed(3)})`, LCH: `lch(${lch.l.toFixed(3)} ${lch.c.toFixed(3)} ${lch.h.toFixed(3)})`, OKLab: `oklab(${oklab.l.toFixed(5)} ${oklab.a.toFixed(5)} ${oklab.b.toFixed(5)})`, OKLCH: `oklch(${oklch.l.toFixed(5)} ${oklch.c.toFixed(5)} ${oklch.h.toFixed(3)})`, CMYK: `cmyk(${cmyk.c.toFixed(2)}% ${cmyk.m.toFixed(2)}% ${cmyk.y.toFixed(2)}% ${cmyk.k.toFixed(2)}%)`
  };
  $('[data-color-translations]', root).innerHTML = Object.entries(values).map(([name, text]) => `<output><strong>${name}</strong><br>${escapeHtml(text)}</output>`).join('');
}

function openAppearanceEditor(element = null) {
  appearanceTarget = element || document.documentElement;
  $('#appearance-target-name').textContent = targetName(appearanceTarget);
  const host = $('#appearance-editor-host');
  host.innerHTML = appearanceEditorMarkup(appearanceTarget);
  const root = host.firstElementChild;
  const id = root.dataset.appearanceId;
  const config = state.appearance[id];
  $('[data-appearance-state]', root).value = config.state || 'normal';
  const setControls = () => {
    const style = config.styles[config.state || 'normal'] || {};
    $$('[data-style]', root).forEach((control) => { control.value = style[control.dataset.style] ?? ''; });
    renderColorTranslations(root, style.color || '#a7f3d0');
  };
  $('[data-appearance-state]', root).addEventListener('change', (event) => { config.state = event.target.value; setControls(); });
  $('[data-color-picker]', root).addEventListener('input', (event) => { $('[data-style="color"]', root).value = event.target.value; renderColorTranslations(root, event.target.value); });
  $('[data-background-picker]', root).addEventListener('input', (event) => { $('[data-style="backgroundColor"]', root).value = event.target.value; });
  $('[data-set-rainbow]', root).addEventListener('click', () => { $('[data-style="backgroundColor"]', root).value = 'rainbow'; });
  $('[data-add-layer]', root).addEventListener('click', () => { config.layers.push({ id: crypto.randomUUID(), name: `Layer ${config.layers.length + 1}`, visible: true, locked: false }); persist('Appearance layer added', `Added a layer to ${targetName(appearanceTarget)}.`); openAppearanceEditor(appearanceTarget); });
  $('[data-duplicate-layer]', root).addEventListener('click', () => { const last = config.layers.at(-1); config.layers.push({ ...last, id: crypto.randomUUID(), name: `${last?.name || 'Layer'} copy` }); persist('Appearance layer duplicated', `Duplicated a layer on ${targetName(appearanceTarget)}.`); openAppearanceEditor(appearanceTarget); });
  $$('[data-layer-delete]', root).forEach((button) => button.addEventListener('click', () => { if (config.layers.length <= 1) return showNotification('Layer retained', 'At least one layer is required.', 'warning'); config.layers = config.layers.filter((layer) => layer.id !== button.dataset.layerDelete); persist('Appearance layer removed', `Removed a layer from ${targetName(appearanceTarget)}.`); openAppearanceEditor(appearanceTarget); }));
  $$('[data-layer-up]', root).forEach((button) => button.addEventListener('click', () => { const index = config.layers.findIndex((layer) => layer.id === button.dataset.layerUp); if (index > 0) [config.layers[index - 1], config.layers[index]] = [config.layers[index], config.layers[index - 1]]; persist('Appearance layers reordered', `Reordered layers on ${targetName(appearanceTarget)}.`); openAppearanceEditor(appearanceTarget); }));
  $('[data-apply-style]', root).addEventListener('click', () => {
    const nextConfig = cloneStateSnapshot(config);
    nextConfig.styles[nextConfig.state || 'normal'] = Object.fromEntries($$('[data-style]', root).map((control) => [control.dataset.style, control.value]).filter(([, value]) => value !== ''));
    try { state.appearance[id] = validateAppearanceMap({ [id]: nextConfig })[id]; }
    catch (error) { showNotification('Appearance not applied', error.message, 'error'); return; }
    persist('Appearance changed', `Updated ${config.state || 'normal'} appearance for ${targetName(appearanceTarget)}.`);
    applyAppearance();
    renderColorTranslations(root, state.appearance[id].styles[state.appearance[id].state || 'normal'].color || '#a7f3d0');
  });
  $('[data-copy-style]', root).addEventListener('click', () => copyText(JSON.stringify(config, null, 2)));
  $('[data-export-style]', root).addEventListener('click', () => downloadText(`appearance-${id.replace(/[^a-z0-9]+/gi, '-')}.json`, JSON.stringify(config, null, 2), 'application/json'));
  $('[data-import-style]', root).addEventListener('click', () => $('[data-style-file]', root).click());
  $('[data-style-file]', root).addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file || file.size > 65536) return showNotification('Appearance preset rejected', 'Choose JSON no larger than 64 KiB.', 'error'); try { const value = parseJsonStrict(await file.text(), { maxDepth: 8, maxBytes: 65536 }); state.appearance[id] = validateAppearanceMap({ [id]: value })[id]; persist('Appearance preset imported', `Imported a validated preset for ${targetName(appearanceTarget)}.`); applyAppearance(); openAppearanceEditor(appearanceTarget); } catch (error) { showNotification('Appearance preset rejected', error.message, 'error'); } finally { event.target.value = ''; } });
  $('[data-reset-style]', root).addEventListener('click', () => requestDestructiveAction('Reset target appearance', `All local appearance overrides for ${targetName(appearanceTarget)} will be removed.`, () => { delete state.appearance[id]; persist('Appearance reset', `Reset ${targetName(appearanceTarget)}.`); applyAppearance(); $('#appearance-dialog').close(); }));
  enhanceDropdowns(root);
  $('#appearance-dialog').showModal();
}

function applyAppearance() {
  assignStableElementIds();
  let appearance;
  try { appearance = validateAppearanceMap(state.appearance); }
  catch (error) { showNotification('Appearance data quarantined', `Invalid appearance overrides were ignored: ${error.message}`, 'error', false); state.appearance = {}; return; }
  Object.entries(appearance).forEach(([id, config]) => {
    const element = id === 'global' ? document.documentElement : document.querySelector(`[data-element-id="${CSS.escape(id)}"]`);
    if (!element) return;
    const style = { ...(config.styles?.normal || {}), ...(config.styles?.[config.state] || {}) };
    Object.entries(style).forEach(([property, value]) => {
      if (property === 'backgroundColor' && value === 'rainbow') element.classList.add('rainbow-color');
      else if (property in element.style) element.style[property] = String(value).slice(0, 300);
    });
  });
}

function policyFactors(policy) {
  return ({ pin: ['pin'], password: ['password'], 'pin-password': ['pin', 'password'], 'password-totp': ['password', 'totp'], 'pin-totp': ['pin', 'totp'], 'password-pin-totp': ['password', 'pin', 'totp'] })[policy] || [];
}

async function hashSecret(secret, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function updateLockFactorVisibility() {
  const factors = policyFactors($('#lock-policy').value);
  $$('[data-lock-factor]').forEach((element) => { element.hidden = !factors.includes(element.dataset.lockFactor); });
}

function buildPinPad() {
  const pad = $('.pin-pad');
  if (!pad) return;
  pad.innerHTML = [...Array(10).keys(), 'Backspace', 'Clear'].map((key) => `<button type="button" data-pin-key="${key}">${key}</button>`).join('');
  $$('[data-pin-key]', pad).forEach((button) => button.addEventListener('click', () => {
    const input = $('#lock-pin');
    if (button.dataset.pinKey === 'Backspace') input.value = input.value.slice(0, -1);
    else if (button.dataset.pinKey === 'Clear') input.value = '';
    else input.value = `${input.value}${button.dataset.pinKey}`.slice(0, 16);
    input.focus();
  }));
}

function openLockWizard(element) {
  lockTarget = element;
  $('#lock-target-name').textContent = targetName(element);
  $('#lock-policy').value = 'pin';
  $('#lock-pin').value = '';
  $('#lock-password').value = '';
  $('#lock-totp').value = '';
  updateLockFactorVisibility();
  buildPinPad();
  enhanceDropdowns($('#lock-dialog'));
  $('#lock-dialog').showModal();
}

async function saveLock() {
  const id = targetId(lockTarget);
  const policy = $('#lock-policy').value;
  const factors = policyFactors(policy);
  const salt = crypto.randomUUID();
  const config = { id, name: targetName(lockTarget), policy, duration: $('#lock-duration').value, createdAt: new Date().toISOString(), salt, attempts: 0, blockedUntil: 0 };
  if (factors.includes('pin')) {
    const pin = $('#lock-pin').value;
    if (!/^\d{3,16}$/.test(pin)) return showNotification('Lock not created', 'PIN must contain 3 to 16 digits.', 'error');
    config.pinHash = await hashSecret(pin, salt);
  }
  if (factors.includes('password')) {
    const password = $('#lock-password').value;
    if (!password) return showNotification('Lock not created', 'Enter a password. Its length is not reported after registration.', 'error');
    config.passwordHash = await hashSecret(password, salt);
  }
  if (factors.includes('totp')) {
    const secret = normalizeTotpSecret($('#lock-totp').value);
    if (!secret) return showNotification('Lock not created', 'Enter a valid Base32 TOTP secret.', 'error');
    config.totpSecret = secret;
  }
  state.locks[id] = config;
  persist('Element lock created', `Created a ${policy} lock for ${config.name}.`);
  $('#lock-dialog').close();
  applyLocks();
  showNotification('Element locked', `${config.name} now requires its configured factors in this browser.`, 'info');
}

function applyLocks() {
  assignStableElementIds();
  $$('[data-element-id]').forEach((element) => {
    const lock = state.locks[targetId(element)];
    const unlockedUntil = state.unlocks[targetId(element)] || 0;
    const active = Boolean(lock && unlockedUntil < Date.now());
    element.classList.toggle('locked-element', active);
    if (active) {
      element.setAttribute('aria-disabled', 'true');
      element.dataset.locked = 'true';
    } else {
      element.removeAttribute('aria-disabled');
      delete element.dataset.locked;
    }
  });
}

function openUnlock(element) {
  unlockTarget = element;
  const config = state.locks[targetId(element)];
  if (!config) return;
  $('#unlock-target-name').textContent = config.name;
  const factors = policyFactors(config.policy);
  $('#unlock-factors').innerHTML = factors.map((factor, index) => `<label>Step ${index + 1}: ${factor === 'totp' ? 'Current TOTP code' : factor === 'pin' ? 'PIN' : 'Password'}<input data-unlock-factor="${factor}" type="password" ${factor === 'pin' || factor === 'totp' ? 'inputmode="numeric"' : ''} autocomplete="off"></label>`).join('');
  const wait = Math.max(0, config.blockedUntil - Date.now());
  if (wait > 0) $('#unlock-factors').insertAdjacentHTML('beforeend', `<p class="warning-callout">Try again in ${Math.ceil(wait / 1000)} seconds. Clearing site storage resets this for-fun lock.</p>`);
  $('#unlock-dialog').showModal();
}

async function submitUnlock() {
  const id = targetId(unlockTarget);
  const config = state.locks[id];
  if (!config) return $('#unlock-dialog').close();
  if (config.blockedUntil > Date.now()) return showNotification('Unlock waiting', `Try again in ${Math.ceil((config.blockedUntil - Date.now()) / 1000)} seconds.`, 'warning');
  let valid = true;
  for (const input of $$('[data-unlock-factor]')) {
    const factor = input.dataset.unlockFactor;
    if (factor === 'pin') valid &&= (await hashSecret(input.value, config.salt)) === config.pinHash;
    if (factor === 'password') valid &&= (await hashSecret(input.value, config.salt)) === config.passwordHash;
    if (factor === 'totp') valid &&= await verifyTotp(config.totpSecret, input.value);
  }
  if (!valid) {
    config.attempts = (config.attempts || 0) + 1;
    config.blockedUntil = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(config.attempts, 5));
    persist('Element unlock refused', `A local lock attempt did not match for ${config.name}.`);
    return showNotification('Values did not match', 'The element remains locked. Clear this site\'s local storage to reset the lock.', 'error');
  }
  config.attempts = 0;
  config.blockedUntil = 0;
  const duration = config.duration;
  state.unlocks[id] = duration === '5' ? Date.now() + 300000 : duration === '30' ? Date.now() + 1800000 : duration === 'session' ? Number.MAX_SAFE_INTEGER : Date.now() + 30000;
  persist('Element unlocked', `${config.name} was unlocked for the selected duration.`);
  $('#unlock-dialog').close();
  applyLocks();
  unlockTarget?.focus?.();
}

function requestDestructiveAction(name, impact, callback) {
  pendingDestructiveAction = callback;
  $('#confirm-action-name').textContent = name;
  $('#confirm-impact').textContent = impact;
  $('#confirm-key-a').checked = false;
  $('#confirm-key-b').checked = false;
  $('#confirm-slider').value = 0;
  $('#confirm-slider').disabled = true;
  $('#confirm-progress').value = 0;
  $('#complete-confirm').disabled = true;
  $('#super-confirm-dialog').showModal();
  $('#confirm-key-a').focus();
}

function updateSuperConfirmation() {
  const ready = $('#confirm-key-a').checked && $('#confirm-key-b').checked;
  $('#confirm-slider').disabled = !ready;
  if (!ready) $('#confirm-slider').value = 0;
  $('#confirm-progress').value = Number($('#confirm-slider').value);
  $('#complete-confirm').disabled = !ready || Number($('#confirm-slider').value) !== 100;
}

function normalizeTotpSecret(value) {
  const raw = String(value || '').trim();
  if (raw.startsWith('otpauth://')) {
    try { return normalizeTotpSecret(new URL(raw).searchParams.get('secret') || ''); } catch { return ''; }
  }
  const normalized = raw.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');
  return /^[A-Z2-7]{16,128}$/.test(normalized) ? normalized : '';
}

function base32Bytes(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value) bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const output = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) output.push(parseInt(bits.slice(index, index + 8), 2));
  return new Uint8Array(output);
}

async function totpCode(secret, time = Date.now(), algorithm = 'SHA-1', digits = 6, period = 30) {
  const counter = BigInt(Math.floor(time / 1000 / period));
  const message = new Uint8Array(8);
  let value = counter;
  for (let index = 7; index >= 0; index -= 1) { message[index] = Number(value & 255n); value >>= 8n; }
  const key = await crypto.subtle.importKey('raw', base32Bytes(secret), { name: 'HMAC', hash: algorithm }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const offset = signature.at(-1) & 15;
  const binary = ((signature[offset] & 127) << 24) | (signature[offset + 1] << 16) | (signature[offset + 2] << 8) | signature[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

async function verifyTotp(secret, input) {
  const normalized = String(input || '').replace(/\s/g, '');
  for (const offset of [-30000, 0, 30000]) if (await totpCode(secret, Date.now() + offset) === normalized) return true;
  return false;
}

function parseOtpUri(value, fallbackLabel) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('otpauth://')) return { secret: normalizeTotpSecret(raw), label: fallbackLabel || 'Local entry', issuer: '', algorithm: 'SHA-1', digits: 6, period: 30 };
  const url = new URL(raw);
  if (url.protocol !== 'otpauth:' || url.hostname !== 'totp') throw new Error('Only otpauth TOTP URIs are supported.');
  const algorithm = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase().replace('SHA1', 'SHA-1').replace('SHA256', 'SHA-256').replace('SHA512', 'SHA-512');
  if (!['SHA-1', 'SHA-256', 'SHA-512'].includes(algorithm)) throw new Error('Algorithm must be SHA-1, SHA-256, or SHA-512.');
  const digits = Number(url.searchParams.get('digits') || 6);
  const period = Number(url.searchParams.get('period') || 30);
  if (![6, 7, 8].includes(digits) || !Number.isInteger(period) || period < 10 || period > 300) throw new Error('Digits or period are outside supported bounds.');
  return { secret: normalizeTotpSecret(url.searchParams.get('secret') || ''), label: decodeURIComponent(url.pathname.slice(1)) || fallbackLabel || 'Local entry', issuer: url.searchParams.get('issuer') || '', algorithm, digits, period };
}

async function renderTotpEntries() {
  const container = $('#totp-list');
  if (!container) return;
  const entries = await filterSearchItems(state.totpEntries, (entry) => `${entry.label} ${entry.issuer}`, $('#totp-search'));
  if (entries === null) return;
  if (!entries.length) { container.innerHTML = '<div class="empty-state">No local authenticator entries match this view.</div>'; return; }
  const rows = [];
  for (const entry of entries) {
    try {
      const current = await totpCode(entry.totpSecret, Date.now(), entry.algorithm, entry.digits, entry.period);
      const next = await totpCode(entry.totpSecret, Date.now() + entry.period * 1000, entry.algorithm, entry.digits, entry.period);
      const remaining = entry.period - Math.floor(Date.now() / 1000) % entry.period;
      rows.push(`<article class="collection-item" data-element-id="totp:${entry.id}"><span aria-hidden="true">◴</span><div><h4 data-vocabulary-exempt>${escapeHtml(entry.label)}</h4><p><strong data-vocabulary-exempt aria-label="Current code ${current.split('').join(' ')}">${current.match(/.{1,3}/g).join(' ')}</strong> · ${remaining}s · next <span data-vocabulary-exempt>${next.match(/.{1,3}/g).join(' ')}</span></p></div><div><button class="text-button" type="button" data-copy-code="${current}">Copy</button><button class="danger-button" type="button" data-remove-totp="${entry.id}">Delete</button></div></article>`);
    } catch { rows.push(`<article class="collection-item"><span>!</span><div><h4 data-vocabulary-exempt>${escapeHtml(entry.label)}</h4><p>Code generation failed in this browser.</p></div></article>`); }
  }
  container.innerHTML = rows.join('');
  $$('[data-copy-code]').forEach((button) => button.addEventListener('click', () => copyText(button.dataset.copyCode)));
  $$('[data-remove-totp]').forEach((button) => button.addEventListener('click', () => requestDestructiveAction('Delete authenticator entry', 'The selected browser-local secret will be removed. Ordinary exports never include it.', () => { state.totpEntries = state.totpEntries.filter((entry) => entry.id !== button.dataset.removeTotp); persist('Authenticator entry deleted', 'A local authenticator entry was deleted. Secret material was not recorded in history.'); renderTotpEntries(); })));
  applyLocks();
}

async function renderOllamaModels() {
  const container = $('#ollama-model-list');
  if (!container) return;
  const models = await filterSearchItems(state.ollama.models, (model) => `${model.name} ${model.size || ''}`, $('#ollama-search'));
  if (models === null) return;
  container.innerHTML = models.length ? models.map((model) => `<article class="collection-item"><span aria-hidden="true">◫</span><div><h4 data-vocabulary-exempt>${escapeHtml(model.name)}</h4><p>${model.size ? `${Number(model.size / 1024 / 1024 / 1024).toFixed(2)} GiB` : 'Size unavailable'} · Hardware fit Unknown, browser evidence is incomplete</p></div><button class="text-button" type="button" disabled aria-label="Chat unavailable in this static website">Chat unavailable</button></article>`).join('') : '<div class="empty-state">No installed local models are available in this browser state.</div>';
}

async function connectOllama() {
  const raw = $('#ollama-url').value.trim();
  let url;
  try {
    url = new URL(raw);
    const allowedOrigins = new Set(['http://127.0.0.1:11434', 'http://localhost:11434']);
    if (!allowedOrigins.has(url.origin) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use exactly http://127.0.0.1:11434 or http://localhost:11434 without credentials, paths, queries, or fragments.');
  } catch (error) { return showNotification('Local API URL rejected', error.message, 'error'); }
  state.ollama.url = url.origin;
  $('#ollama-status').textContent = 'Checking the user-selected loopback API...';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(new URL('/api/tags', url), { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Local API returned HTTP ${response.status}.`);
    const body = await response.json();
    if (!body || !Array.isArray(body.models) || JSON.stringify(body).length > 1024 * 1024) throw new Error('Local API response is malformed or exceeds 1 MiB.');
    state.ollama.models = body.models.slice(0, 2000).map((model, index) => {
      if (!model || typeof model !== 'object' || Array.isArray(model)) throw new Error(`Local model row ${index + 1} is malformed.`);
      const name = typeof model.name === 'string' ? model.name.trim().slice(0, 300) : '';
      const numericSize = Number(model.size);
      if (!name || !Number.isSafeInteger(numericSize) || numericSize < 0) throw new Error(`Local model row ${index + 1} has an invalid name or size.`);
      return { name, size: numericSize };
    });
    state.ollama.checkedAt = new Date().toISOString();
    $('#ollama-status').textContent = `Connected to a local API. ${state.ollama.models.length} installed tags reported.`;
    persist('Local model API checked', `The user-selected loopback API reported ${state.ollama.models.length} installed tags.`);
  } catch (error) {
    state.ollama.models = [];
    $('#ollama-status').textContent = `Unavailable: ${error.name === 'AbortError' ? 'the request exceeded 5 seconds' : error.message}. A public HTTPS page may be blocked by mixed-content or CORS rules.`;
  } finally { clearTimeout(timeout); renderOllamaModels(); }
}

async function convertFile() {
  const file = $('#converter-file').files?.[0];
  if (!file) return showNotification('No source selected', 'Choose one local file before converting.', 'warning');
  if (file.size > MAX_FILE_BYTES) return showNotification('Source rejected', 'The browser converter accepts files no larger than 1 MiB.', 'error');
  $('#converter-progress').value = 10;
  const source = await file.text();
  $('#converter-progress').value = 35;
  const adapter = $('#converter-adapter').value;
  let output = '';
  let extension = 'txt';
  let type = 'text/plain';
  try {
    if (adapter === 'json-pretty') { const parsed = JSON.parse(source); output = `${JSON.stringify(parsed, null, 2)}\n`; JSON.parse(output); extension = 'json'; type = 'application/json'; }
    if (adapter === 'csv-tsv') { output = delimitedConvert(source, ',', '\t'); extension = 'tsv'; type = 'text/tab-separated-values'; }
    if (adapter === 'tsv-csv') { output = delimitedConvert(source, '\t', ','); extension = 'csv'; type = 'text/csv'; }
    if (adapter === 'text-base64') { output = bytesToBase64(new TextEncoder().encode(source)); extension = 'b64.txt'; }
    if (adapter === 'base64-text') { output = new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(source.trim())); extension = 'txt'; }
    if (adapter === 'markdown-html') { output = `<!doctype html><meta charset="utf-8"><article>${markdownToHtml(source)}</article>`; extension = 'html'; type = 'text/html'; }
    if (!output && source) throw new Error('The selected adapter produced no validated output.');
    $('#converter-progress').value = 80;
    $('#converter-preview').value = output.slice(0, 20000);
    state.conversion = { output, extension, type, sourceName: file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'converted' };
    $('#download-conversion').disabled = false;
    $('#converter-progress').value = 100;
    appendHistory('File converted', `${file.name.slice(0, 120)} converted with ${adapter}. Source bytes were not stored in history.`);
    persist(null, null, { record: false });
  } catch (error) {
    state.conversion = null;
    $('#converter-progress').value = 0;
    $('#download-conversion').disabled = true;
    showNotification('Conversion failed', error.message, 'error');
  }
}

function delimitedConvert(source, from, to) {
  return source.split(/\r?\n/).map((line) => {
    const cells = [];
    let value = '', quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') { if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted; }
      else if (character === from && !quoted) { cells.push(value); value = ''; }
      else value += character;
    }
    cells.push(value);
    return cells.map((cell) => to === ',' && /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(to);
  }).join('\n');
}

function bytesToBase64(bytes) { let binary = ''; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); return btoa(binary); }
function base64ToBytes(value) { const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }

function redactedExportRecord() {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    encoding: 'UTF-8',
    omissions: ['Authenticator entries and secrets', 'Element locks and verifier material', 'Presentation-mode verifier material', 'Private vocabulary cache and source metadata', 'Custom logo bytes', 'Transient conversion output'],
    state: buildRedactedExportState(state)
  };
}

function serializeExport(record, format) {
  const json = JSON.stringify(record, null, 2);
  if (format === 'JSON') return { text: `${json}\n`, extension: 'json', type: 'application/json' };
  if (format === 'JSONL') return { text: `${[record, ...record.state.haircuts.map((haircut) => ({ type: 'haircut', ...haircut }))].map((item) => JSON.stringify(item)).join('\n')}\n`, extension: 'jsonl', type: 'application/x-ndjson' };
  if (format === 'YAML') return { text: `schemaVersion: ${record.schemaVersion}\nexportedAt: "${record.exportedAt}"\nomissions:\n${record.omissions.map((item) => `  - "${item}"`).join('\n')}\ndataJson: |\n${json.split('\n').map((line) => `  ${line}`).join('\n')}\n`, extension: 'yaml', type: 'application/yaml' };
  if (format === 'TOML') return { text: `schemaVersion = ${record.schemaVersion}\nexportedAt = "${record.exportedAt}"\nomissions = [${record.omissions.map((item) => JSON.stringify(item)).join(', ')}]\ndataJson = ${JSON.stringify(json)}\n`, extension: 'toml', type: 'application/toml' };
  if (format === 'XML') return { text: `<?xml version="1.0" encoding="UTF-8"?>\n<hairGrowthExport schemaVersion="1"><exportedAt>${escapeHtml(record.exportedAt)}</exportedAt><omissions>${record.omissions.map((item) => `<item>${escapeHtml(item)}</item>`).join('')}</omissions><json>${escapeHtml(json)}</json></hairGrowthExport>\n`, extension: 'xml', type: 'application/xml' };
  if (format === 'CSV' || format === 'TSV') return serializeDelimitedExport(record, format);
  if (format === 'Markdown') return { text: `# Hair Growth Estimator browser export\n\nExported: ${record.exportedAt}\n\n## Omitted private data\n\n${record.omissions.map((item) => `- ${item}`).join('\n')}\n\n## Redacted JSON\n\n\`\`\`json\n${json}\n\`\`\`\n`, extension: 'md', type: 'text/markdown' };
  if (format === 'HTML') return { text: `<!doctype html><meta charset="utf-8"><title>Hair Growth Estimator export</title><h1>Hair Growth Estimator browser export</h1><p>Exported ${escapeHtml(record.exportedAt)}</p><h2>Omitted private data</h2><ul>${record.omissions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul><pre>${escapeHtml(json)}</pre>`, extension: 'html', type: 'text/html' };
  if (format === 'SQL') return { text: `CREATE TABLE hair_growth_export (schema_version INTEGER, exported_at TEXT, redacted_json TEXT);\nINSERT INTO hair_growth_export VALUES (1, ${sqlString(record.exportedAt)}, ${sqlString(json)});\n`, extension: 'sql', type: 'application/sql' };
  if (format === 'TypeScript') return { text: `export const hairGrowthExport = ${json} as const;\n`, extension: 'ts', type: 'text/typescript' };
  if (format === 'JavaScript') return { text: `export const hairGrowthExport = ${json};\n`, extension: 'js', type: 'text/javascript' };
  if (format === 'Python') return { text: `import json\nhair_growth_export = json.loads(${JSON.stringify(json)})\n`, extension: 'py', type: 'text/x-python' };
  if (format === 'Go') return { text: `package hairgrowth\n\nconst ExportJSON = ${JSON.stringify(json)}\n`, extension: 'go', type: 'text/x-go' };
  if (format === 'Rust') return { text: `pub const EXPORT_JSON: &str = ${JSON.stringify(json)};\n`, extension: 'rs', type: 'text/x-rust' };
  if (format === 'JSON Schema') return { text: `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Hair Growth Estimator redacted browser export', type: 'object', required: ['schemaVersion', 'exportedAt', 'omissions', 'state'], properties: { schemaVersion: { const: 1 }, exportedAt: { type: 'string', format: 'date-time' }, omissions: { type: 'array', items: { type: 'string' } }, state: { type: 'object' } }, additionalProperties: false }, null, 2)}\n`, extension: 'schema.json', type: 'application/schema+json' };
  if (format === 'Protobuf') return { text: 'syntax = "proto3";\nmessage HairGrowthExport { uint32 schema_version = 1; string exported_at = 2; repeated string omissions = 3; string redacted_json = 4; }\n', extension: 'proto', type: 'text/plain' };
  throw new Error(`Unsupported export format ${format}.`);
}

function sqlString(value) { return `'${String(value).replace(/'/g, "''")}'`; }

function downloadText(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(String(text)); showNotification('Copied', 'The requested text was copied to the clipboard.', 'info'); }
  catch { showNotification('Copy unavailable', 'The browser refused clipboard access.', 'error'); }
}

function startHairAnimation() {
  if (heroTimer) clearInterval(heroTimer);
  const stage = $('#hero-hair-stage');
  if (!bundledHairAssets.length) {
    stage.innerHTML = '<div class="image-placeholder" role="img" aria-label="Generated hair reference assets are not present in this isolated website build"><span>Generated hair reference assets will be required in the integrated release build.</span></div>';
    $('#hero-stage-caption').textContent = 'Image assets are temporarily absent in this isolated website build.';
    $('#timeline-progress').style.width = '0%';
    return;
  }
  const render = () => {
    const item = bundledHairAssets[heroStageIndex % bundledHairAssets.length];
    stage.innerHTML = `<img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}">`;
    $('#hero-stage-caption').textContent = `Approximate reference stage ${item.cm} cm · ${(item.cm * INCHES_PER_CM).toFixed(2)} in. Individual growth and appearance vary.`;
    $('#timeline-progress').style.width = `${((heroStageIndex + 1) / bundledHairAssets.length) * 100}%`;
    heroStageIndex = (heroStageIndex + 1) % bundledHairAssets.length;
  };
  render();
  if (!state.settings.reducedMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches) heroTimer = setInterval(render, 2600);
}

async function renderCommandPalette() {
  const allowedCommands = FEATURE_COMMANDS.filter(([label, , target]) => !state.settings.schoolMode || (!isSchoolSensitiveText(label) && !['language-mode', 'vocabulary-file', 'vocabulary-status', 'replace-vocabulary', 'clear-vocabulary'].includes(target)));
  const matchingCommands = await filterSearchItems(allowedCommands, ([label]) => label, $('#palette-search'));
  if (matchingCommands === null) return;
  const rows = matchingCommands.map(([label, tab, target]) => ({ label, tab, target }));
  $('#palette-results').innerHTML = rows.length ? rows.map((row, index) => `<button class="palette-row" type="button" role="option" data-command-index="${index}"><span><strong>${escapeHtml(row.label)}</strong><br><small>${escapeHtml(currentTabDefinition(row.tab)?.label || row.tab)}</small></span><span>Open</span></button>`).join('') : '<div class="empty-state">No command or setting matches this search.</div>';
  $$('[data-command-index]').forEach((button) => button.addEventListener('click', () => {
    const row = rows[Number(button.dataset.commandIndex)];
    $('#command-palette').close();
    if (row.target === 'support') return $('#support-dialog').showModal();
    if (row.tab === 'tools' && ['regex', 'converter', 'ollama', 'authenticator', 'exports'].includes(row.target)) activateSubtab(row.target);
    if (row.tab === 'settings' && row.target) {
      const target = document.getElementById(row.target);
      const panel = target?.closest('[data-settings-panel]');
      if (panel) activateSettingsTab(panel.dataset.settingsPanel);
    }
    activateTab(row.tab, row.target);
  }));
}

function activateManagedTab(buttonSelector, panelSelector, id, { focus = false } = {}) {
  const buttons = $$(buttonSelector).filter((button) => !button.hidden && !button.closest('[hidden]'));
  buttons.forEach((button) => {
    const active = (button.dataset.subtab || button.dataset.settingsTab) === id;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  });
  $$(panelSelector).forEach((panel) => {
    const active = (panel.dataset.toolPanel || panel.dataset.settingsPanel) === id;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function handleManagedTabKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tablist = event.currentTarget.closest('[role="tablist"]');
  const tabs = $$('[role="tab"]', tablist).filter((tab) => !tab.hidden && !tab.closest('[hidden]'));
  const index = tabs.indexOf(event.currentTarget);
  if (index < 0 || !tabs.length) return;
  event.preventDefault();
  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : (index + 1) % tabs.length;
  const next = tabs[nextIndex];
  const id = next.dataset.subtab || next.dataset.settingsTab;
  if (next.dataset.subtab) activateSubtab(id, true); else activateSettingsTab(id, true);
}

function activateSubtab(id, focus = false) {
  activateManagedTab('[data-subtab]', '[data-tool-panel]', id, { focus });
}

function activateSettingsTab(id, focus = false) {
  activateManagedTab('[data-settings-tab]', '[data-settings-panel]', id, { focus });
}

async function renderOverflow() {
  const openTabs = TAB_DEFINITIONS.filter((tab) => !state.tabs.closed.includes(tab.id));
  const tabs = await filterSearchItems(openTabs, (tab) => `${tab.label} ${tabGroup(tab)}`, $('#overflow-search'));
  if (tabs === null) return;
  $('#overflow-list').innerHTML = tabs.map((tab) => `<button type="button" class="palette-row" data-overflow-tab="${tab.id}"><span>${escapeHtml(localizedTabLabel(tab))}</span><small>${escapeHtml(tabGroup(tab))}</small></button>`).join('') || '<div class="empty-state">No tabs match this filter.</div>';
  $$('[data-overflow-tab]').forEach((button) => button.addEventListener('click', () => { $('#tab-overflow-dialog').close(); activateTab(button.dataset.overflowTab); }));
}

async function updateBulkTabPreview() {
  const query = $('#bulk-tab-query').value;
  if (!query) { $('#bulk-tab-preview').textContent = 'Enter text to preview affected tabs.'; $('#run-bulk-tabs').disabled = true; return; }
  const config = safePattern('bulk-tab-query');
  config.plain = query;
  state.regexOwners['bulk-tab-query'] = config;
  const inverse = $('input[name="bulk-mode"]:checked').value === 'not-contains';
  const includePinned = $('#bulk-include-pinned').checked;
  const candidates = TAB_DEFINITIONS.filter((tab) => !state.tabs.closed.includes(tab.id) && (includePinned || !state.tabs.pinned.includes(tab.id)));
  const matching = await filterSearchItems(candidates, (tab) => tab.label, 'bulk-tab-query');
  if (matching === null) return;
  const matchingSet = new Set(matching);
  const targets = candidates.filter((tab) => inverse ? !matchingSet.has(tab) : matchingSet.has(tab));
  $('#bulk-tab-preview').textContent = `${targets.length} tabs will close. ${includePinned ? 'Pinned tabs are included.' : 'Pinned tabs are excluded.'}`;
  $('#run-bulk-tabs').disabled = !targets.length;
  $('#run-bulk-tabs').dataset.targets = targets.map((tab) => tab.id).join(',');
}

async function filterSettings() {
  const query = $('#settings-search');
  const cards = $$('.setting-card').filter((card) => !state.settings.schoolMode || !card.matches('[data-school-sensitive], .school-hidden'));
  const matches = await filterSearchItems(cards, (card) => `${card.dataset.settingKeywords || ''} ${card.textContent}`, query);
  if (matches === null) return;
  const visible = new Set(matches);
  $$('.setting-card').forEach((card) => { card.hidden = state.settings.schoolMode && card.matches('[data-school-sensitive], .school-hidden') ? true : !visible.has(card); });
  if (query.value && matches.length) {
    const panel = matches[0].closest('[data-settings-panel]');
    if (panel) activateSettingsTab(panel.dataset.settingsPanel);
  }
}

async function filterContextMenu() {
  const query = $('#context-search');
  const buttons = $$('[data-context-action]');
  const matches = await filterSearchItems(buttons, (button) => button.textContent, query);
  if (matches === null) return;
  const visible = new Set(matches);
  buttons.forEach((button) => { button.hidden = !visible.has(button); });
}

function openContextMenu(event, element) {
  contextTarget = element;
  contextMenuOpener = element instanceof HTMLElement && element.tabIndex >= 0 ? element : document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const menu = $('#context-menu');
  $('#context-search').value = '';
  menu.hidden = false;
  menu.style.left = `${Math.min(event.clientX || 12, innerWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${Math.min(event.clientY || 12, innerHeight - menu.offsetHeight - 8)}px`;
  $('#context-search').focus();
}

function closeContextMenu({ returnFocus = true } = {}) {
  const menu = $('#context-menu');
  menu.hidden = true;
  $('#context-search').value = '';
  if (returnFocus && contextMenuOpener?.isConnected) contextMenuOpener.focus();
}

function handleContextMenuKeydown(event) {
  if ($('#context-menu').hidden) return;
  const search = $('#context-search');
  const items = $$('[role="menuitem"]:not([hidden])', $('#context-menu'));
  if (event.key === 'Escape') {
    event.preventDefault();
    if (search.value) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
    else closeContextMenu();
    return;
  }
  if (event.target === search && event.key === 'ArrowDown') {
    event.preventDefault();
    items[0]?.focus();
    return;
  }
  if (!items.includes(event.target)) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    const index = items.indexOf(event.target);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : (index + 1) % items.length;
    items[nextIndex]?.focus();
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    event.target.click();
  }
}

function createSchoolDialog(mode) {
  let dialog = $('#school-factor-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'school-factor-dialog';
    dialog.className = 'lock-dialog';
    document.body.append(dialog);
  }
  dialog.innerHTML = `<div class="dialog-header"><div><p class="eyebrow">Shared presentation mode</p><h2>${mode === 'create' ? 'Create an unlock PIN' : 'Enter the unlock PIN'}</h2></div><button class="icon-button" type="button" data-school-cancel aria-label="Cancel">×</button></div><p>This is a browser-local experience lock, not a security boundary. Clearing this site's storage resets it.</p><label>PIN<input id="school-pin-input" type="password" inputmode="numeric" autocomplete="off" maxlength="16"></label><div class="dialog-footer"><button class="text-button" type="button" data-school-cancel>Cancel</button><button class="filled-button" type="button" id="school-factor-submit">${mode === 'create' ? 'Turn on mode' : 'Turn off mode'}</button></div>`;
  $$('[data-school-cancel]', dialog).forEach((button) => button.addEventListener('click', () => { $('#school-mode').checked = state.settings.schoolMode; dialog.close(); }));
  $('#school-factor-submit', dialog).addEventListener('click', async () => {
    const value = $('#school-pin-input', dialog).value;
    if (!/^\d{3,16}$/.test(value)) return showNotification('PIN not accepted', 'Enter 3 to 16 digits.', 'error');
    if (mode === 'create') {
      const salt = crypto.randomUUID();
      state.schoolLock = { salt, hash: await hashSecret(value, salt) };
      state.settings.schoolMode = true;
      persist('School mode enabled', 'The shared browser presentation mode was enabled. Credential material was not recorded in history.');
    } else {
      const valid = state.schoolLock && (await hashSecret(value, state.schoolLock.salt)) === state.schoolLock.hash;
      if (!valid) return showNotification('PIN did not match', 'The mode remains on. Clearing this site\'s storage resets it.', 'error');
      state.settings.schoolMode = false;
      persist('School mode disabled', 'The shared browser presentation mode was disabled.');
    }
    dialog.close();
    renderSettings();
    applySettings();
  });
  dialog.showModal();
  $('#school-pin-input', dialog).focus();
}

function populateVoices() {
  if (!('speechSynthesis' in window)) {
    $('#voice-en-status').textContent = 'Speech synthesis is unavailable in this browser.';
    $('#voice-yue-status').textContent = 'Speech synthesis is unavailable in this browser.';
    return;
  }
  const voices = speechSynthesis.getVoices();
  const populate = (select, languagePrefix, selected, status) => {
    const relevant = voices.filter((voice) => voice.lang.toLowerCase().startsWith(languagePrefix));
    select.innerHTML = `<option value="auto">Choose automatically</option>${relevant.map((voice) => `<option value="${escapeHtml(voice.voiceURI)}">${escapeHtml(voice.name)} · ${escapeHtml(voice.lang)}${voice.localService ? '' : ' · network-backed'}</option>`).join('')}`;
    select.value = relevant.some((voice) => voice.voiceURI === selected) ? selected : 'auto';
    if (selected !== 'auto' && !relevant.some((voice) => voice.voiceURI === selected)) status.textContent = 'The selected voice is not installed on this computer. The choice is kept and automatic fallback is active.';
    else if (!relevant.length) status.textContent = 'No matching voice is installed on this computer.';
    else status.textContent = select.value === 'auto' ? `Choose automatically. ${relevant.length} matching voices are available.` : `Active voice: ${select.selectedOptions[0].textContent}.`;
  };
  populate($('#voice-en'), 'en', state.settings.narrator.voiceEn, $('#voice-en-status'));
  populate($('#voice-yue'), 'zh-hk', state.settings.narrator.voiceYue, $('#voice-yue-status'));
}

function addSchedule() {
  const label = $('#schedule-label').value.trim();
  const start = $('#schedule-start').value;
  const end = $('#schedule-end').value;
  const days = $$('input[name="schedule-day"]:checked').map((input) => Number(input.value));
  if (!label || !start || !end || !days.length) return showNotification('Schedule incomplete', 'Enter a label, start time, end time, and at least one weekday.', 'error');
  state.schedules.push({ id: crypto.randomUUID(), label: label.slice(0, 80), start, end, days, theme: $('#schedule-theme').value, enabled: true, createdAt: new Date().toISOString() });
  persist('Schedule created', `Created scheduled settings rule ${label.slice(0, 80)}.`);
  renderSchedules();
  applySchedules();
}

function maybeDimSumSurprise() {
  const firstVisit = !state.visited;
  state.visited = true;
  persist(null, null, { record: false });
  if (firstVisit || state.settings.schoolMode || Math.random() >= 0.1) return;
  showNotification(`${DIM_SUM.nameEn} · ${DIM_SUM.nameYue}`, friendlyCopy('A dim-sum catalog surprise appeared.', 'A tiny steamer basket rolled into this visit.', '今次有個小小點心驚喜。'), 'info', true, { image: DIM_SUM.image, alt: `Warm tea-house photograph of ${DIM_SUM.nameEn}` });
}

function momentumCheck() {
  const settings = state.settings.attention;
  if (!settings.momentum || settings.snoozedUntil > Date.now() || Date.now() - lastChangedAt < 40 * 60 * 1000) return;
  showNotification('Nothing has changed here for 40 minutes', 'Resume the chosen next action or dismiss this prompt for one hour.', 'info');
  settings.snoozedUntil = Date.now() + 3600000;
  persist(null, null, { record: false });
}

function setupInputSearchState(input) {
  if (!input.dataset.searchOwner) return;
  input.addEventListener('input', () => {
    const owner = input.dataset.searchOwner;
    state.regexOwners[owner] = { ...safePattern(owner), plain: input.value };
    persist(null, null, { record: false });
  });
}

function setupEvents() {
  document.addEventListener('click', (event) => {
    const locked = event.target.closest?.('.locked-element');
    if (locked && state.locks[targetId(locked)] && (state.unlocks[targetId(locked)] || 0) < Date.now()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openUnlock(locked);
    }
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      renderCommandPalette();
      $('#command-palette').classList.toggle('full', state.settings.paletteSize === 'full');
      $('#command-palette').showModal();
      $('#palette-search').focus();
      return;
    }
    if (event.key === 'F10' && event.shiftKey) {
      event.preventDefault();
      const element = document.activeElement === document.body ? $('#main-content') : document.activeElement;
      const rect = element.getBoundingClientRect();
      openContextMenu({ clientX: rect.left + 10, clientY: rect.top + 10 }, element);
      return;
    }
    if (event.key === 'Escape' && !$('#context-menu').hidden) handleContextMenuKeydown(event);
  });
  document.addEventListener('contextmenu', (event) => { event.preventDefault(); openContextMenu(event, event.target); });
  document.addEventListener('pointerdown', (event) => { if (!event.target.closest('#context-menu') && !$('#context-menu').hidden) closeContextMenu(); });
  let longPressTimer;
  document.addEventListener('pointerdown', (event) => { if (event.pointerType === 'touch') longPressTimer = setTimeout(() => openContextMenu(event, event.target), 650); });
  document.addEventListener('pointerup', () => clearTimeout(longPressTimer));
  document.addEventListener('pointercancel', () => clearTimeout(longPressTimer));

  $$('[data-open-regex-for]').forEach((button) => button.addEventListener('click', () => openRegexBuilder(button.dataset.openRegexFor)));
  $$('[data-search-owner]').forEach(setupInputSearchState);
  $('#context-menu').addEventListener('keydown', handleContextMenuKeydown);
  $('#docs-list').addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || event.target !== event.currentTarget) return;
    event.preventDefault();
    const options = $$('[role="option"][data-doc-id]', event.currentTarget);
    const target = event.key === 'End' || event.key === 'ArrowUp' ? options.at(-1) : options[0];
    target?.focus();
  });
  $('#strip-search').addEventListener('input', renderTabs);
  $('#haircut-search').addEventListener('input', renderHaircuts);
  $('#docs-search').addEventListener('input', renderDocs);
  $('#history-search').addEventListener('input', renderHistory);
  $('#history-from').addEventListener('change', renderHistory);
  $('#history-to').addEventListener('change', renderHistory);
  $('#notification-search').addEventListener('input', renderNotifications);
  $('#changelog-search').addEventListener('input', renderChangelog);
  $('#changelog-from').addEventListener('change', renderChangelog);
  $('#changelog-to').addEventListener('change', renderChangelog);
  $('#ollama-search').addEventListener('input', renderOllamaModels);
  $('#totp-search').addEventListener('input', renderTotpEntries);
  $('#ticket-search').addEventListener('input', renderTickets);
  $('#settings-search').addEventListener('input', filterSettings);
  $('#context-search').addEventListener('input', filterContextMenu);
  $('#overflow-search').addEventListener('input', renderOverflow);
  $('#palette-search').addEventListener('input', renderCommandPalette);
  $('#bulk-tab-query').addEventListener('input', updateBulkTabPreview);
  $$('input[name="bulk-mode"], #bulk-include-pinned').forEach((input) => input.addEventListener('change', updateBulkTabPreview));
  $('#baseline-date').addEventListener('input', () => setDateFieldValidation($('#baseline-date'), '#baseline-date-error', $('#baseline-date').value));
  $('#haircut-date').addEventListener('input', () => setDateFieldValidation($('#haircut-date'), '#haircut-date-error', $('#haircut-date').value));

  $$('[data-go-tab]').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.goTab)));
  $$('[data-subtab]').forEach((button) => { button.addEventListener('click', () => activateSubtab(button.dataset.subtab)); button.addEventListener('keydown', handleManagedTabKeydown); });
  $$('[data-settings-tab]').forEach((button) => { button.addEventListener('click', () => activateSettingsTab(button.dataset.settingsTab)); button.addEventListener('keydown', handleManagedTabKeydown); });
  $$('[data-copy]').forEach((button) => button.addEventListener('click', () => copyText($(button.dataset.copy)?.textContent || '')));

  $('#estimator-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const chronology = setDateFieldValidation($('#baseline-date'), '#baseline-date-error', $('#baseline-date').value);
    if (!chronology.valid) {
      $('#baseline-date').focus();
      $('#baseline-date').reportValidity();
      return;
    }
    state.estimator.manualBaselineDate = $('#baseline-date').value;
    state.estimator.manualBaselineLengthCm = toCentimetres($('#baseline-length').value);
    state.estimator.growthRateCmPerMonth = toCentimetres($('#growth-rate').value);
    state.estimator.targetLengthCm = toCentimetres($('#target-length').value);
    const reconciled = reconcileEstimatorBaseline();
    persist('Estimate changed', 'Updated the retained manual fallback, growth rate, or target. The newest valid haircut remains active when present.');
    renderEstimator();
    const baselineDetail = reconciled.source.kind === 'haircut' ? ' The newest valid haircut remains the active baseline.' : ' The manual fallback is now active.';
    showNotification('Estimate updated', `${friendlyCopy('The browser-local projection was recalculated.', 'The projection got a fresh trim and recalculated itself.', '個估算啱啱梳好晒再計過。')}${baselineDetail}`, 'info');
  });
  $$('input[name="unit"]').forEach((radio) => radio.addEventListener('change', () => { state.estimator.unit = radio.value; persist('Measurement unit changed', `Changed browser-local display to ${radio.value}.`); renderEstimator(); renderHaircuts(); }));
  $('#haircut-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const chronology = setDateFieldValidation($('#haircut-date'), '#haircut-date-error', $('#haircut-date').value);
    if (!chronology.valid) {
      $('#haircut-date').focus();
      $('#haircut-date').reportValidity();
      return;
    }
    const editing = Boolean(event.currentTarget.dataset.editId);
    const id = event.currentTarget.dataset.editId || crypto.randomUUID();
    const record = { id, date: $('#haircut-date').value, postCutLengthCm: toCentimetres($('#haircut-length').value), note: $('#haircut-note').value.trim().slice(0, 500), updatedAt: new Date().toISOString() };
    state.haircuts = [record, ...state.haircuts.filter((item) => item.id !== id)].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    const reconciled = reconcileEstimatorBaseline();
    delete event.currentTarget.dataset.editId;
    event.currentTarget.reset();
    $('#haircut-date-error').textContent = '';
    $('#haircut-date').setAttribute('aria-invalid', 'false');
    persist(editing ? 'Haircut changed' : 'Haircut recorded', `Reconciled the active baseline to the newest valid haircut on ${reconciled.source.date}.`);
    renderHaircuts(); renderEstimator();
    showNotification(editing ? 'Haircut updated' : 'Haircut recorded', `The active estimate now begins from the newest valid haircut on ${reconciled.source.date}.`, 'info');
  });

  $('#language-mode').addEventListener('change', (event) => { if (state.settings.schoolMode) return; state.settings.language = event.target.value; persist('Language changed', `Changed website language mode to ${event.target.value}.`); applySettings(); });
  $('#funny-en').addEventListener('input', (event) => { state.settings.funnyEn = Number(event.target.value); $('output[for="funny-en"]').value = event.target.value; persist('English funny level changed', `Set English funny level to ${event.target.value}.`); });
  $('#funny-yue').addEventListener('input', (event) => { state.settings.funnyYue = Number(event.target.value); $('output[for="funny-yue"]').value = event.target.value; persist('Cantonese funny level changed', `Set Cantonese funny level to ${event.target.value}.`); });
  $('#dialog-emoji').addEventListener('change', (event) => { state.settings.dialogEmoji = event.target.checked; persist('Dialog emoji preference changed', `Dialog emoji are ${event.target.checked ? 'shown' : 'hidden'}.`); applySettings(); });
  $('#school-mode').addEventListener('change', (event) => createSchoolDialog(event.target.checked ? 'create' : 'unlock'));
  $('#theme-select').addEventListener('change', (event) => { state.settings.theme = event.target.value; persist('Theme changed', `Changed theme to ${event.target.value}.`); applySettings(); });
  $('#density-select').addEventListener('change', (event) => { state.settings.density = event.target.value; persist('Density changed', `Changed density to ${event.target.value}.`); applySettings(); });
  $('#accent-color').addEventListener('input', (event) => { state.settings.accent = event.target.value; state.settings.rainbow = false; persist('Accent changed', `Changed accent to ${event.target.value}.`); applySettings(); });
  $('#accent-rainbow').addEventListener('click', () => { state.settings.rainbow = true; persist('Accent changed', 'Selected the animated rainbow sentinel.'); applySettings(); });
  $('#rainbow-speed').addEventListener('input', (event) => { state.settings.rainbowSpeed = Number(event.target.value); $('output[for="rainbow-speed"]').value = event.target.value; persist('Rainbow speed changed', `Set rainbow speed level to ${event.target.value}.`); applySettings(); });
  $('#font-family').addEventListener('change', (event) => { state.settings.fontFamily = event.target.value; persist('Font changed', `Changed website font to ${event.target.value}.`); applySettings(); });
  $('#font-scale').addEventListener('input', (event) => { state.settings.fontScale = Number(event.target.value); persist('Font scale changed', `Changed font scale to ${event.target.value}.`); applySettings(); });
  $('#dock-select').addEventListener('change', (event) => { state.settings.dock = event.target.value; persist('Tab strip moved', `Docked tabs to ${event.target.value}.`); applySettings(); });
  $('#display-name-input').addEventListener('change', (event) => { state.settings.displayName = event.target.value.trim().slice(0, 80) || 'Hair Growth Estimator'; persist('Display name changed', 'The website display name changed.'); applySettings(); });
  $('#reset-display-name').addEventListener('click', () => { state.settings.displayName = 'Hair Growth Estimator'; persist('Display name reset', 'The website display name returned to its shipped value.'); renderSettings(); applySettings(); });
  $('#logo-preset').addEventListener('change', (event) => { state.settings.logo.preset = event.target.value; state.settings.logo.customLogoData = ''; persist('Logo preset changed', `Selected logo preset ${event.target.value}.`); applySettings(); });
  $('#logo-fit').addEventListener('change', (event) => { state.settings.logo.fit = event.target.value; persist('Logo fit changed', `Set logo fit to ${event.target.value}.`); applySettings(); });
  $('#logo-background').addEventListener('input', (event) => { state.settings.logo.background = event.target.value; persist('Logo background changed', `Changed logo background to ${event.target.value}.`); applySettings(); });
  $('#custom-logo').addEventListener('change', handleCustomLogo);
  $('#reset-logo').addEventListener('click', () => { state.settings.logo = defaultState().settings.logo; persist('Logo reset', 'The website logo returned to the shipped mark.'); renderSettings(); applySettings(); });
  $('#narrator-enabled').addEventListener('change', (event) => { state.settings.narrator.enabled = event.target.checked; persist('Narrator changed', `Narrator ${event.target.checked ? 'enabled' : 'disabled'}.`); if (event.target.checked) narrate('Narrator enabled.'); });
  $('#voice-en').addEventListener('change', (event) => { state.settings.narrator.voiceEn = event.target.value; persist('English narrator voice changed', 'The selected English voice identity changed.'); populateVoices(); });
  $('#voice-yue').addEventListener('change', (event) => { state.settings.narrator.voiceYue = event.target.value; persist('Cantonese narrator voice changed', 'The selected Cantonese voice identity changed.'); populateVoices(); });
  $('#narrator-rate').addEventListener('input', (event) => { state.settings.narrator.rate = Number(event.target.value); persist('Narrator rate changed', `Set narrator rate to ${event.target.value}.`); });
  $('#narrator-pitch').addEventListener('input', (event) => { state.settings.narrator.pitch = Number(event.target.value); persist('Narrator pitch changed', `Set narrator pitch to ${event.target.value}.`); });
  $('#reduced-motion').addEventListener('change', (event) => { state.settings.reducedMotion = event.target.checked; persist('Reduced motion changed', `Reduced motion ${event.target.checked ? 'enabled' : 'disabled'}.`); applySettings(); startHairAnimation(); });
  $('#palette-size').addEventListener('change', (event) => { state.settings.paletteSize = event.target.value; persist('Command palette size changed', `Set command palette to ${event.target.value}.`); $('#command-palette').classList.toggle('full', event.target.value === 'full'); });

  ['focus', 'lowStim', 'time', 'one', 'momentum'].forEach((key) => {
    const id = { focus: 'adhd-focus', lowStim: 'adhd-low-stim', time: 'adhd-time', one: 'adhd-one', momentum: 'adhd-momentum' }[key];
    $(`#${id}`).addEventListener('change', (event) => { state.settings.attention[key] = event.target.checked; persist('Attention mode changed', `${key} ${event.target.checked ? 'enabled' : 'disabled'}.`); applySettings(); });
  });
  $('#next-action').addEventListener('change', (event) => { state.settings.attention.nextAction = event.target.value.trim().slice(0, 160); persist('Next action changed', 'Updated the user-chosen next action.'); renderAttentionBar(); });

  $('#add-schedule').addEventListener('click', addSchedule);
  $('#ollama-connect').addEventListener('click', connectOllama);
  $('#convert-button').addEventListener('click', convertFile);
  $('#cancel-convert').addEventListener('click', () => { state.conversion = null; $('#converter-progress').value = 0; $('#converter-preview').value = ''; $('#download-conversion').disabled = true; showNotification('Conversion cancelled', 'No output was downloaded and the source remained unchanged.', 'info'); });
  $('#download-conversion').addEventListener('click', () => { if (!state.conversion) return; downloadText(`${state.conversion.sourceName}.${state.conversion.extension}`, state.conversion.output, state.conversion.type); });
  $('#totp-add').addEventListener('click', async () => { try { const value = parseOtpUri($('#totp-input').value, $('#totp-label').value.trim()); if (!value.secret) throw new Error('Enter a valid Base32 secret or otpauth URI.'); const entry = { id: crypto.randomUUID(), label: ($('#totp-label').value.trim() || value.label).slice(0, 120), issuer: value.issuer.slice(0, 120), totpSecret: value.secret, algorithm: value.algorithm, digits: value.digits, period: value.period, createdAt: new Date().toISOString() }; await totpCode(entry.totpSecret, Date.now(), entry.algorithm, entry.digits, entry.period); state.totpEntries.push(entry); $('#totp-input').value = ''; $('#totp-label').value = ''; persist('Authenticator entry added', `Added local entry ${entry.label}. Secret material was not recorded in history.`); renderTotpEntries(); } catch (error) { showNotification('Entry not added', error.message, 'error'); } });
  $('#totp-clear').addEventListener('click', () => { $('#totp-input').value = ''; $('#totp-label').value = ''; });
  $('#export-state').addEventListener('click', () => { const format = $('#export-format').value; const serialized = serializeExport(redactedExportRecord(), format); downloadText(`hair-growth-browser-export.${serialized.extension}`, serialized.text, serialized.type); appendHistory('State exported', `Exported redacted browser state as ${format}.`); persist(null, null, { record: false }); });
  $('#import-state').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', handleStateImport);
  $('#vocabulary-file').addEventListener('change', handleVocabularyFile);
  $('#replace-vocabulary').addEventListener('click', () => $('#vocabulary-file').click());
  $('#clear-vocabulary').addEventListener('click', () => { state.vocabulary = { schemaVersion: 1, entries: {} }; vocabularyUiState = 'cleared'; $('#vocabulary-file').value = ''; persist('Personal vocabulary cleared', 'Cleared the validated local cache. Source details and mappings were not recorded.'); renderSettings(); applySettings(); });

  $('#lock-policy').addEventListener('change', updateLockFactorVisibility);
  $('#save-lock').addEventListener('click', saveLock);
  $('#submit-unlock').addEventListener('click', submitUnlock);
  $('#confirm-key-a').addEventListener('change', updateSuperConfirmation);
  $('#confirm-key-b').addEventListener('change', updateSuperConfirmation);
  $('#confirm-slider').addEventListener('input', updateSuperConfirmation);
  $('#complete-confirm').addEventListener('click', () => { const callback = pendingDestructiveAction; pendingDestructiveAction = null; $('#confirm-progress').value = 100; $('#super-confirm-dialog').classList.add('complete'); setTimeout(() => { $('#super-confirm-dialog').classList.remove('complete'); $('#super-confirm-dialog').close(); callback?.(); }, state.settings.reducedMotion ? 1 : 300); });
  $$('[data-action="cancel-confirm"]').forEach((button) => button.addEventListener('click', () => { pendingDestructiveAction = null; $('#super-confirm-dialog').close(); }));
  $$('[data-action="open-support"]').forEach((button) => button.addEventListener('click', () => { $('#lock-dialog').open && $('#lock-dialog').close(); $('#unlock-dialog').open && $('#unlock-dialog').close(); renderTickets(); $('#support-dialog').showModal(); }));
  $('#create-ticket').addEventListener('click', () => { const description = $('#ticket-description').value.trim(); if (!description) return showNotification('Ticket not created', 'Enter a local description.', 'warning'); const number = `LOCAL-${String(state.tickets.length + 1).padStart(5, '0')}`; state.tickets.unshift({ id: crypto.randomUUID(), number, category: $('#ticket-category').value, description: description.slice(0, 1000), severity: 'Unstaffed', status: 'Created', createdAt: new Date().toISOString() }); $('#ticket-description').value = ''; persist('Support ticket created', `${number} was created locally. Nothing was sent.`); renderTickets(); });
  $('#download-button').addEventListener('click', () => { const url = $('#download-button').dataset.url; if (url) location.href = url; });

  $$('[data-context-action]').forEach((button) => button.addEventListener('click', () => {
    closeContextMenu();
    const action = button.dataset.contextAction;
    if (action === 'activate') contextTarget?.click?.();
    if (action === 'appearance') openAppearanceEditor(contextTarget);
    if (action === 'lock') openLockWizard(contextTarget);
    if (action === 'copy') copyText(contextTarget?.innerText || contextTarget?.textContent || '');
  }));

  $$('[data-action="open-command-palette"]').forEach((button) => button.addEventListener('click', () => { renderCommandPalette(); $('#command-palette').showModal(); $('#palette-search').focus(); }));
  $$('[data-action="open-overflow"]').forEach((button) => button.addEventListener('click', () => { renderOverflow(); $('#tab-overflow-dialog').showModal(); }));
  $$('[data-action="open-bulk-tabs"]').forEach((button) => button.addEventListener('click', () => { updateBulkTabPreview(); $('#bulk-tabs-dialog').showModal(); }));
  $$('[data-action="restore-tabs"]').forEach((button) => button.addEventListener('click', () => { state.tabs.closed = []; persist('Tabs restored', 'Restored every locally closed tab.'); renderTabs(); }));
  $('#run-bulk-tabs').addEventListener('click', () => { const targets = ($('#run-bulk-tabs').dataset.targets || '').split(',').filter(Boolean); if (!targets.length) return; requestDestructiveAction('Close matching tabs', `${targets.length} tabs will be hidden from this browser view. Restore tabs remains available.`, () => { state.tabs.closed = [...new Set([...state.tabs.closed, ...targets])]; if (targets.includes(state.activeTab)) state.activeTab = 'home'; persist('Tabs closed in bulk', `Closed ${targets.length} matching tabs.`); renderTabs(); activateTab(state.activeTab); $('#bulk-tabs-dialog').close(); }); });
  $$('[data-action="open-appearance-editor"]').forEach((button) => button.addEventListener('click', () => openAppearanceEditor(document.documentElement)));
  $$('[data-action="reset-appearance"]').forEach((button) => button.addEventListener('click', () => requestDestructiveAction('Reset all appearance', 'Every browser-local per-element appearance override will be removed.', () => { state.appearance = {}; persist('All appearance reset', 'Removed every browser-local appearance override.').then((result) => { if (result.ok) location.reload(); }); })));
  $$('[data-action="clear-site-data"]').forEach((button) => button.addEventListener('click', () => requestDestructiveAction('Clear all local site data', 'Settings, haircut planning, locks, tickets, authenticator entries, notifications, and history stored by this website will be removed.', () => {
    const stateBeforeClear = cloneStateSnapshot(state);
    state = defaultState();
    reconcileEstimatorBaseline();
    reconciliationGeneration += 1;
    const clearGeneration = reconciliationGeneration;
    const snapshot = cloneStateSnapshot(state);
    persistQueue = persistQueue.then(async () => {
      if (clearGeneration !== reconciliationGeneration) return { ok: false, reason: 'superseded-before-clear' };
      const result = await stateCoordinator.commit({ baseRevision: stateRevision, state: snapshot });
      if (result.ok) location.reload();
      else if (result.reason === 'stale-write' && result.current) {
        adoptStoredEnvelope(result.current, { announce: false });
        showNotification('Local data was not cleared', `Another tab already saved browser revision ${result.current.revision}. The clear request was refused.`, 'warning', false);
      } else {
        state = stateBeforeClear;
        reconciliationGeneration += 1;
        reconcileEstimatorBaseline();
        renderAll();
        showNotification('Local data was not cleared', 'A safe exclusive browser transaction could not be completed. No stored data was silently replaced.', 'error', false);
      }
      return result;
    });
  })));
  $$('[data-action="select-all-haircuts"]').forEach((button) => button.addEventListener('click', () => $$('[data-select-haircut]').forEach((input) => { input.checked = true; })));
  $$('[data-action="export-haircuts"]').forEach((button) => button.addEventListener('click', () => downloadText('haircut-records.json', `${JSON.stringify(state.haircuts, null, 2)}\n`, 'application/json')));
  $$('[data-action="delete-haircuts"]').forEach((button) => button.addEventListener('click', () => { const ids = $$('[data-select-haircut]:checked').map((input) => input.dataset.selectHaircut); if (!ids.length) return showNotification('Nothing selected', 'Select at least one haircut record.', 'warning'); requestDestructiveAction('Delete selected haircut records', `${ids.length} browser-local haircut records will be removed.`, () => { state.haircuts = state.haircuts.filter((record) => !ids.includes(record.id)); const reconciled = reconcileEstimatorBaseline(); persist('Haircut records deleted', `Deleted ${ids.length} selected records and reconciled the active ${reconciled.source.kind} baseline on ${reconciled.source.date}.`); renderHaircuts(); renderEstimator(); }); }));
  $$('[data-action="select-all-notifications"]').forEach((button) => button.addEventListener('click', () => $$('[data-select-notification]').forEach((input) => { input.checked = true; })));
  $$('[data-action="delete-notifications"]').forEach((button) => button.addEventListener('click', () => { const ids = $$('[data-select-notification]:checked').map((input) => input.dataset.selectNotification); if (!ids.length) return; requestDestructiveAction('Delete selected notifications', `${ids.length} browser-local notification records will be removed.`, () => { state.notifications = state.notifications.filter((record) => !ids.includes(record.id)); persist('Notifications deleted', `Deleted ${ids.length} notifications.`); renderNotifications(); }); }));
  $$('[data-action="export-history"]').forEach((button) => button.addEventListener('click', () => downloadText('redacted-history.json', `${JSON.stringify(deepRedact(state.history), null, 2)}\n`, 'application/json')));
  $$('[data-action="export-changelog"]').forEach((button) => button.addEventListener('click', () => downloadText('changelog.md', bundledChangelog.map((entry) => `## ${entry.version} (${entry.date})\n\n${entry.title}\n\n${entry.body}\n\nCommit: ${entry.commit || 'Unavailable'}\n`).join('\n'), 'text/markdown')));
  $$('[data-copy-text]').forEach((button) => button.addEventListener('click', () => copyText(button.dataset.copyText)));
  $$('[data-action="toggle-animation"]').forEach((button) => button.addEventListener('click', () => { if (heroTimer) { clearInterval(heroTimer); heroTimer = null; button.textContent = '▶'; button.setAttribute('aria-label', 'Resume hair growth animation'); } else { startHairAnimation(); button.textContent = 'Ⅱ'; button.setAttribute('aria-label', 'Pause hair growth animation'); } }));
}

async function handleCustomLogo(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_FILE_BYTES) return showNotification('Custom logo rejected', 'Choose a PNG, JPEG, or WebP image no larger than 1 MiB.', 'error');
  const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const image = new Image();
  image.onload = () => {
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 4_194_304) return showNotification('Custom logo rejected', 'Decoded dimensions exceed the 4,194,304 pixel limit.', 'error');
    state.settings.logo.customLogoData = data;
    persist('Custom logo changed', `A validated local image was applied at ${image.naturalWidth} by ${image.naturalHeight} pixels. Image bytes were omitted from history.`);
    applySettings();
  };
  image.onerror = () => showNotification('Custom logo rejected', 'The browser could not decode the selected image bytes.', 'error');
  image.src = data;
}

async function handleVocabularyFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const hadValidCache = Object.keys(state.vocabulary.entries).length > 0;
  try {
    vocabularyUiState = 'loading';
    renderSettings();
    if (!Number.isSafeInteger(file.size) || file.size > MAX_VOCABULARY_BYTES) throw new Error('Personal vocabulary exceeds the 256 KiB limit.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== file.size) throw new Error('Personal vocabulary bytes changed while the file was being read.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    state.vocabulary = validatePersonalVocabularyText(text, bytes.byteLength);
    vocabularyUiState = hadValidCache ? 'replaced' : 'loaded';
    persist('Personal vocabulary changed', 'A complete validated local cache was applied. Source details and mappings were not recorded.');
    renderSettings();
    applySettings();
  } catch (error) {
    vocabularyUiState = hadValidCache ? 'invalid-preserved' : 'invalid';
    renderSettings();
    showNotification('Personal vocabulary rejected', `${error.message} ${hadValidCache ? 'The last valid local cache remains active.' : 'Original wording remains active.'}`, 'error');
  } finally {
    event.target.value = '';
  }
}

async function handleStateImport(event) {
  const file = event.target.files?.[0];
  if (!file || file.size > MAX_FILE_BYTES) return showNotification('Import rejected', 'Choose a compatible JSON export no larger than 1 MiB.', 'error');
  try {
    const parsed = parseJsonStrict(await file.text(), { maxDepth: 16, maxBytes: MAX_FILE_BYTES });
    const allowed = new Set(['schemaVersion', 'exportedAt', 'encoding', 'omissions', 'state']);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some((key) => !allowed.has(key))) throw new Error('Export contains an unexpected root field.');
    if (parsed.schemaVersion !== 1 || !parsed.state || typeof parsed.state !== 'object') throw new Error('Export schema is unsupported.');
    const imported = sanitizeImportedState(parsed.state);
    const currentPrivateState = {
      locks: state.locks,
      unlocks: state.unlocks,
      totpEntries: state.totpEntries,
      vocabulary: state.vocabulary,
      schoolLock: state.schoolLock,
      customLogoData: state.settings.logo.customLogoData,
      schoolMode: state.settings.schoolMode,
      schoolModeName: state.settings.schoolModeName
    };
    imported.locks = currentPrivateState.locks;
    imported.unlocks = currentPrivateState.unlocks;
    imported.totpEntries = currentPrivateState.totpEntries;
    imported.vocabulary = currentPrivateState.vocabulary;
    imported.settings.logo.customLogoData = currentPrivateState.customLogoData;
    imported.settings.schoolMode = currentPrivateState.schoolMode;
    imported.settings.schoolModeName = currentPrivateState.schoolModeName;
    if (currentPrivateState.schoolLock) imported.schoolLock = currentPrivateState.schoolLock;
    state = validateBrowserState(imported);
    reconcileEstimatorBaseline();
    persist('State imported', 'Imported compatible redacted browser state. Private credential and vocabulary data was omitted.');
    renderAll();
  } catch (error) { showNotification('Import rejected', error.message, 'error'); }
  finally { event.target.value = ''; }
}

function handleStateStorageEvent(event) {
  if (event.key !== STATE_KEY) return;
  if (event.newValue === null) {
    adoptStoredEnvelope(validateStoredStateEnvelopeText(null, defaultState()), { announce: false });
    showNotification('Browser storage reset detected', 'Another same-origin tab removed the revisioned state. This tab returned to its local defaults.', 'warning', false);
    return;
  }
  try {
    const incoming = validateStoredStateEnvelopeText(event.newValue, defaultState());
    if (incoming.writerId === writerId || incoming.revision <= stateRevision) return;
    adoptStoredEnvelope(incoming);
  } catch {
    try { localStorage.setItem(STATE_QUARANTINE_KEY, JSON.stringify({ schemaVersion: 1, quarantinedAt: new Date().toISOString(), reason: 'Invalid storage event state', rawState: String(event.newValue).slice(0, 4 * 1024 * 1024) })); } catch {}
    showNotification('Invalid browser revision ignored', 'A malformed same-origin storage update was quarantined locally and was not rendered.', 'error', false);
  }
}

function initialize() {
  reconcileEstimatorBaseline();
  assignStableElementIds();
  mountRegexWorkbench($('#regex-workbench-host'), 'standalone-workbench');
  setupEvents();
  enhanceDropdowns(document);
  activateSubtab('regex');
  activateSettingsTab('language');
  renderAll();
  applyExplicitSettingNames();
  filterSettings();
  populateVoices();
  renderStorageRevision();
  const vocabularyObserver = new MutationObserver(() => scheduleVocabularyTextBoundary());
  vocabularyObserver.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'aria-description', 'aria-valuetext', 'aria-roledescription', 'title', 'placeholder', 'alt'] });
  scheduleVocabularyTextBoundary();
  if (initialQuarantineNotice) showNotification('Saved browser state quarantined', 'Invalid saved browser state was quarantined locally before the first render. The website started from validated defaults.', 'warning', false);
  window.addEventListener('storage', handleStateStorageEvent);
  if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', populateVoices);
  maybeDimSumSurprise();
  scheduleTimer = setInterval(() => { applySchedules(); renderAttentionBar(); momentumCheck(); renderTotpEntries(); }, 1000);
  window.addEventListener('beforeunload', () => { vocabularyObserver.disconnect(); regexWorkerClient?.cancelQueued(); clearInterval(scheduleTimer); if (heroTimer) clearInterval(heroTimer); window.removeEventListener('storage', handleStateStorageEvent); if ('speechSynthesis' in window) speechSynthesis.cancel(); });
}

initialize();
