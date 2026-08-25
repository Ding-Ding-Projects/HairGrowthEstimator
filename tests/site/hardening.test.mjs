import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const encoder = new TextEncoder();

async function loadBrowserContract(file, globalName) {
  const source = await readFile(join(root, 'site', file), 'utf8');
  const context = vm.createContext({
    AbortController,
    AbortSignal,
    clearTimeout,
    console,
    crypto,
    DOMException,
    setTimeout,
    structuredClone,
    TextDecoder,
    TextEncoder,
    URL
  });
  vm.runInContext(source, context, { filename: file });
  assert.ok(context[globalName], `${file} must expose ${globalName}`);
  return context[globalName];
}

function fullSafeState() {
  return {
    schemaVersion: 1,
    visited: false,
    activeTab: 'home',
    settings: {
      language: 'en', funnyEn: 5, funnyYue: 5, dialogEmoji: true, schoolMode: false,
      schoolModeName: 'School mode', theme: 'dark', density: 'comfortable', accent: '#a7f3d0',
      rainbow: false, rainbowSpeed: 3, fontFamily: 'system-ui', fontScale: 1, dock: 'left',
      displayName: 'Hair Growth Estimator', paletteSize: 'card', reducedMotion: false,
      narrator: { schemaVersion: 1, enabled: false, language: 'en', voiceURIEn: 'auto', voiceURIYue: 'auto', rate: 1, pitch: 1, assistiveTechnologyActive: false, quietHours: false, reducedSound: false },
      logo: { preset: 'strand', customLogoData: '', fit: 'contain', background: '#101415' },
      attention: { focus: false, lowStim: false, time: false, one: false, momentum: false, nextAction: '', snoozedUntil: 0 }
    },
    estimator: {
      baselineDate: '2026-08-25', baselineLengthCm: 1, manualBaselineDate: '2026-08-25',
      manualBaselineLengthCm: 1, growthRateCmPerMonth: 1, targetLengthCm: 12, unit: 'cm'
    },
    haircuts: [],
    tabs: {
      order: ['home'], pinned: ['home'], closed: [],
      groups: { Start: { color: '#a7f3d0', collapsed: false } }, groupOverrides: {}
    },
    notifications: [], history: [], schedules: [], locks: {}, unlocks: {}, tickets: [],
    totpEntries: [], appearance: {}, regexOwners: {},
    vocabulary: { schemaVersion: 1, entries: {} },
    ollama: { url: 'http://127.0.0.1:11434', models: [], checkedAt: null },
    conversion: null
  };
}

test('strict JSON parsing rejects duplicate and unsafe keys before object assignment', async () => {
  const { parseJsonStrict } = await loadBrowserContract('security-contract.js', 'HairGrowthSecurityContract');
  assert.throws(() => parseJsonStrict('{"safe":1,"safe":2}', { maxDepth: 2 }), /Duplicate key/);
  assert.throws(() => parseJsonStrict('{"entries":{"__proto__":"x"}}', { maxDepth: 2 }), /Unsafe key/);
  assert.throws(() => parseJsonStrict('{"a":{"b":{"c":1}}}', { maxDepth: 2 }), /depth/i);
  assert.deepEqual(JSON.parse(JSON.stringify(parseJsonStrict('{"schemaVersion":1,"entries":{}}', { maxDepth: 2 }))), { schemaVersion: 1, entries: {} });
});

test('personal vocabulary uses the exact bounded schema and revalidates cached data', async () => {
  const { validatePersonalVocabularyText, validatePersonalVocabularyCache } = await loadBrowserContract('security-contract.js', 'HairGrowthSecurityContract');
  const validText = JSON.stringify({ schemaVersion: 1, entries: { alpha: 'one', beta: 'two' } });
  const parsed = validatePersonalVocabularyText(validText, encoder.encode(validText).byteLength);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.entries.alpha, 'one');
  assert.equal(validatePersonalVocabularyCache(parsed).entries.beta, 'two');
  assert.throws(() => validatePersonalVocabularyText(validText, 256 * 1024 + 1), /256 KiB/);
  assert.throws(() => validatePersonalVocabularyText('{"schemaVersion":1,"entries":{"x":"a","x":"b"}}', 55), /Duplicate key/);
  assert.throws(() => validatePersonalVocabularyText(JSON.stringify({ schemaVersion: 2, entries: {} }), 40), /schemaVersion 1/);
  assert.throws(() => validatePersonalVocabularyText(JSON.stringify({ schemaVersion: 1, entries: {}, extra: true }), 60), /Unexpected root field/);
  assert.throws(() => validatePersonalVocabularyText(JSON.stringify({ schemaVersion: 1, entries: { ['k'.repeat(161)]: 'x' } }), 220), /1 to 160/);
  assert.throws(() => validatePersonalVocabularyText(JSON.stringify({ schemaVersion: 1, entries: { key: 'v'.repeat(1001) } }), 1100), /1,000/);
  assert.throws(() => validatePersonalVocabularyText(JSON.stringify({ schemaVersion: 1, entries: Object.fromEntries(Array.from({ length: 4097 }, (_, index) => [`key${index}`, 'value'])) }), 100000), /4,096/);
  assert.throws(() => validatePersonalVocabularyCache({ schemaVersion: 1, entries: { key: 3 } }), /string/);
});

test('personal vocabulary consumer preserves the last valid cache and covers visible and accessible text', async () => {
  const [app, template] = await Promise.all([
    readFile(join(root, 'site', 'app.js'), 'utf8'),
    readFile(join(root, 'site', 'index.template.html'), 'utf8')
  ]);
  assert.match(app, /new TextDecoder\('utf-8', \{ fatal: true \}\)/);
  assert.match(app, /file\.size > MAX_VOCABULARY_BYTES/);
  assert.match(app, /const hadValidCache = Object\.keys\(state\.vocabulary\.entries\)\.length > 0/);
  assert.match(app, /vocabularyUiState = 'loading'/);
  assert.match(app, /'invalid-preserved'/);
  assert.match(app, /state\.vocabulary = \{ schemaVersion: 1, entries: \{\} \}/);
  assert.match(app, /function applyVocabularyToOwnedText\(/);
  assert.match(app, /function appendTextElement\(parent, tagName, text, className = '', vocabularyExempt = false\)/);
  assert.match(app, /if \(vocabularyExempt\) element\.setAttribute\('data-vocabulary-exempt', ''\)/);
  assert.match(app, /record\.note \|\| 'No note', '', true/);
  assert.match(app, /<h4 data-vocabulary-exempt>\$\{escapeHtml\(entry\.label\)\}/);
  assert.match(app, /<h4 data-vocabulary-exempt>\$\{escapeHtml\(model\.name\)\}/);
  for (const attribute of ['aria-label', 'aria-description', 'aria-valuetext', 'aria-roledescription', 'title', 'placeholder', 'alt']) assert.match(app, new RegExp(`'${attribute}'`));
  assert.match(app, /if \(state\.settings\.schoolMode\) return String\(text\)/);
  assert.match(app, /SCHOOL_SENSITIVE_REGEX_OWNERS\.has\(activeRegexOwner\)/);
  assert.match(app, /scheduleVocabularyTextBoundary\(\)/);
  assert.match(app, /source details and mappings are not exposed/i);
  assert.doesNotMatch(app.slice(app.indexOf('async function handleVocabularyFile'), app.indexOf('async function handleStateImport')), /fetch\(|file\.name|entries\.length/);
  for (const id of ['vocabulary-file', 'vocabulary-status', 'replace-vocabulary', 'clear-vocabulary']) {
    assert.match(template, new RegExp(`id="${id}"`));
    assert.match(app, new RegExp(`'${id}'`));
  }
  assert.match(template, /id="vocabulary-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(template, /id="display-name"[^>]*data-vocabulary-exempt/);
  assert.match(template, /id="school-mode-label"[^>]*data-vocabulary-exempt/);
  assert.match(app, /function vocabularyStatusCopy\(\) \{[\s\S]{0,200}const mode = effectiveLanguageMode\(\)/);
  assert.match(app, /replace-vocabulary'\)\.textContent/);
  assert.match(template, /data-school-sensitive data-setting-keywords="vocabulary/);
});

test('external personal vocabulary currentness is nonzero and value-free', async (context) => {
  const sourcePath = process.env.PRIVATE_VOCABULARY_SOURCE;
  if (!sourcePath) return context.skip('External private source is unavailable.');
  const expectedCount = Number(process.env.PRIVATE_VOCABULARY_EXPECTED_COUNT);
  assert.ok(Number.isSafeInteger(expectedCount) && expectedCount > 0, 'A nonzero external expected count is required.');
  const bytes = await readFile(sourcePath);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const { validatePersonalVocabularyText } = await loadBrowserContract('security-contract.js', 'HairGrowthSecurityContract');
  const parsed = validatePersonalVocabularyText(text, bytes.byteLength);
  assert.equal(Object.keys(parsed.entries).length, expectedCount);
  const receiptPath = process.env.PRIVATE_VOCABULARY_RECEIPT;
  if (receiptPath) {
    const receipt = {
      schemaVersion: 1,
      sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      expectedEntryCount: expectedCount,
      observedEntryCount: Object.keys(parsed.entries).length,
      checkedAt: new Date().toISOString(),
      mappingsIncluded: false
    };
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }
});

test('full state and appearance schemas reject unknown keys, unsafe identifiers, and unsafe styles', async () => {
  const { validateBrowserState, validateAppearanceMap, sanitizeImportedState } = await loadBrowserContract('security-contract.js', 'HairGrowthSecurityContract');
  const safe = fullSafeState();
  assert.equal(validateBrowserState(safe).activeTab, 'home');
  const unknown = structuredClone(safe);
  unknown.unreviewed = true;
  assert.throws(() => validateBrowserState(unknown), /Unexpected state field/);
  const invalidRecord = structuredClone(safe);
  invalidRecord.haircuts = [{ id: 'bad\" selector', date: '2026-08-25', postCutLengthCm: 1, note: '', updatedAt: '2026-08-25T00:00:00.000Z' }];
  assert.throws(() => validateBrowserState(invalidRecord), /identifier/);
  const safeAppearance = { 'id:display-name': { state: 'normal', layers: [{ id: '123e4567-e89b-42d3-a456-426614174000', name: 'Base', visible: true, locked: false }], styles: { normal: { color: '#ffffff', opacity: '1' } } } };
  assert.equal(validateAppearanceMap(safeAppearance)['id:display-name'].styles.normal.color, '#ffffff');
  assert.throws(() => validateAppearanceMap({ 'bad\"]': safeAppearance['id:display-name'] }), /target identifier/);
  assert.throws(() => validateAppearanceMap({ safe: { ...safeAppearance['id:display-name'], styles: { normal: { backgroundImage: 'url(https://example.invalid/x)' } } } }), /style property/);
  assert.throws(() => sanitizeImportedState({ ...safe, schoolLock: { salt: 'x', hash: 'y' } }), /verifier material/);
});

test('saved presentation state migrates the prior narrator and schedule shapes without losing visitor data', async () => {
  const { validateStoredStateEnvelopeText } = await loadBrowserContract('security-contract.js', 'HairGrowthSecurityContract');
  const legacy = fullSafeState();
  legacy.visited = true;
  legacy.settings.language = 'both';
  legacy.settings.accent = '#123456';
  legacy.settings.fontScale = 1.25;
  legacy.settings.narrator = { enabled: true, voiceEn: 'voice:english', voiceYue: 'voice:cantonese', rate: 1.2, pitch: 0.9 };
  legacy.schedules = [{
    id: 'legacy-schedule',
    label: 'Evening theme',
    start: '18:00',
    end: '23:00',
    days: [1, 2, 3, 4, 5],
    theme: 'light',
    enabled: true,
    createdAt: '2026-08-24T20:00:00.000Z'
  }];
  const serialized = JSON.stringify({
    storageEnvelopeSchema: 1,
    revision: 7,
    writerId: 'writer-before-l06',
    writtenAt: '2026-08-24T20:01:00.000Z',
    state: legacy
  });

  const migrated = validateStoredStateEnvelopeText(serialized, fullSafeState());
  assert.equal(migrated.revision, 7);
  assert.equal(migrated.legacy, false);
  assert.equal(migrated.state.visited, true);
  assert.equal(migrated.state.settings.narrator.schemaVersion, 1);
  assert.equal(migrated.state.settings.narrator.language, 'both');
  assert.equal(migrated.state.settings.narrator.voiceURIEn, 'voice:english');
  assert.equal(migrated.state.settings.narrator.voiceURIYue, 'voice:cantonese');
  assert.equal(migrated.state.schedules[0].priority, 0);
  assert.equal(migrated.state.schedules[0].startDate, '');
  assert.equal(migrated.state.schedules[0].endDate, '');
  assert.equal(migrated.state.schedules[0].everyDay, false);
  assert.equal(migrated.state.schedules[0].settings.theme, 'light');
  assert.equal(migrated.state.schedules[0].settings.accent, '#123456');
  assert.equal(migrated.state.schedules[0].settings.fontScale, 1.25);
  assert.equal(migrated.state.schedules[0].source.kind, 'local');

  const malformed = structuredClone(legacy);
  malformed.settings.narrator.extra = true;
  assert.throws(() => validateStoredStateEnvelopeText(JSON.stringify(malformed), fullSafeState()), /narrator settings/);
});

test('positive export allowlist omits every verifier and private cache in every serializer input', async () => {
  const { buildRedactedExportState } = await loadBrowserContract('security-contract.js', 'HairGrowthSecurityContract');
  const state = fullSafeState();
  state.schoolLock = { salt: 'do-not-export', hash: 'do-not-export' };
  state.vocabulary = { schemaVersion: 1, entries: { privateKey: 'privateValue' } };
  state.settings.logo.customLogoData = 'data:image/png;base64,private';
  state.locks = { target: { pinHash: 'private', salt: 'private' } };
  state.totpEntries = [{ id: 'entry-12345678', label: 'Example', issuer: 'Example', totpSecret: 'private', algorithm: 'SHA-1', digits: 6, period: 30 }];
  const exported = buildRedactedExportState(state);
  const serialized = JSON.stringify(exported);
  for (const marker of ['do-not-export', 'privateValue', 'data:image', 'pinHash', 'totpSecret', 'schoolLock', 'vocabularyMappings']) assert.equal(serialized.includes(marker), false, `export contains ${marker}`);
  assert.equal(exported.settings.schoolMode, false);
  assert.equal(Object.hasOwn(exported, 'vocabulary'), false);
  const app = await readFile(join(root, 'site', 'app.js'), 'utf8');
  const serializer = app.slice(app.indexOf('function serializeExport'), app.indexOf('function sqlString'));
  assert.match(serializer, /record\.state\.haircuts\.map/);
  assert.doesNotMatch(serializer, /,\s*\.\.\.state\.haircuts\.map/);
});

test('user regular expressions run only in disposable bounded workers', async () => {
  const [app, clientSource, workerSource] = await Promise.all([
    readFile(join(root, 'site', 'app.js'), 'utf8'),
    readFile(join(root, 'site', 'regex-client.js'), 'utf8'),
    readFile(join(root, 'site', 'regex-worker.js'), 'utf8')
  ]);
  assert.doesNotMatch(app, /new RegExp\(pattern|new RegExp\(source/);
  assert.match(clientSource, /new WorkerCtor\(workerUrl\)/);
  assert.match(clientSource, /worker\.terminate\(\)/);
  assert.match(clientSource, /timeoutMs/);
  assert.match(clientSource, /maxQueue/);
  assert.match(clientSource, /AbortSignal|signal\.aborted/);
  assert.match(workerSource, /MAX_RESULTS\s*=\s*500/);
  assert.match(workerSource, /match\[0\]\s*===\s*''/);
  assert.match(workerSource, /self\.onmessage/);
  const { evaluateRegexRequest } = await loadBrowserContract('regex-worker.js', 'HairGrowthRegexWorker');
  const result = evaluateRegexRequest({ operation: 'scan', pattern: '(?<word>hair)', flags: 'giu', sample: 'hair HAIR', replacement: 'strand', testCases: [] });
  assert.equal(result.matches.length, 2);
  assert.equal(result.preview, 'strand strand');
  assert.ok(result.matches.length <= 500);
  const zeroWidth = evaluateRegexRequest({ operation: 'scan', pattern: '^|$', flags: 'gu', sample: 'abc', replacement: '', testCases: [] });
  assert.ok(zeroWidth.matches.length > 0 && zeroWidth.matches.length <= 500);

  const { createRegexWorkerClient } = await loadBrowserContract('regex-client.js', 'HairGrowthRegexClient');
  let terminations = 0;
  class ReplyWorker {
    postMessage(message) { setTimeout(() => this.onmessage?.({ data: { id: message.id, ok: true, result: { matches: [true] } } }), 5); }
    terminate() { terminations += 1; }
  }
  const client = createRegexWorkerClient({ WorkerCtor: ReplyWorker, workerUrl: 'regex-worker.js', timeoutMs: 50, maxConcurrent: 1, maxQueue: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(await client.run({ operation: 'testMany', values: ['hair'], pattern: 'hair', flags: 'i' }))), { matches: [true] });
  assert.equal(terminations, 1);

  class NeverWorker { postMessage() {} terminate() { terminations += 1; } }
  const deadlineClient = createRegexWorkerClient({ WorkerCtor: NeverWorker, workerUrl: 'regex-worker.js', timeoutMs: 25, maxConcurrent: 1, maxQueue: 1 });
  await assert.rejects(deadlineClient.run({ operation: 'scan' }), /25 ms deadline/);

  const controller = new AbortController();
  const cancelled = deadlineClient.run({ operation: 'scan' }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(cancelled, /cancelled/i);

  let attempts = 0;
  class ConstructorRecoveryWorker extends ReplyWorker {
    constructor(...args) {
      super(...args);
      attempts += 1;
      if (attempts === 1) throw new Error('construction refused');
    }
  }
  const recoveryClient = createRegexWorkerClient({ WorkerCtor: ConstructorRecoveryWorker, workerUrl: 'regex-worker.js', timeoutMs: 50, maxConcurrent: 1, maxQueue: 1 });
  await assert.rejects(recoveryClient.run({ operation: 'scan' }), /could not be created/i);
  assert.deepEqual(JSON.parse(JSON.stringify(await recoveryClient.run({ operation: 'testMany' }))), { matches: [true] });
});

test('accessibility repair boundaries are explicit and responsive controls remain operable', async () => {
  const [template, app, styles, accessibility, inventory] = await Promise.all([
    readFile(join(root, 'site', 'index.template.html'), 'utf8'),
    readFile(join(root, 'site', 'app.js'), 'utf8'),
    readFile(join(root, 'site', 'styles.css'), 'utf8'),
    readFile(join(root, 'docs', 'site', 'accessibility-and-responsive-layout.md'), 'utf8'),
    readFile(join(root, 'docs', 'inventory', 'site-universal-features.md'), 'utf8')
  ]);
  assert.match(app, /const SETTING_CONTROL_NAMES = Object\.freeze\(/);
  assert.match(app, /function applyExplicitSettingNames\(\)/);
  assert.match(template, /id="tool-tab-regex" role="tab" aria-controls="tool-panel-regex"/);
  assert.match(template, /id="settings-tab-language" role="tab" aria-controls="settings-panel-language"/);
  assert.match(app, /function activateManagedTab\(/);
  assert.match(app, /function handleManagedTabKeydown\(/);
  assert.match(app, /function focusFilteredTabFallback\(/);
  assert.match(app, /const focusTarget = previouslyFocusedId[\s\S]*focusTarget\.focus\(\)/);
  assert.match(app, /function closeContextMenu\(/);
  assert.match(app, /case 'ArrowDown'|event\.key === 'ArrowDown'/);
  assert.match(app, /case 'Home'|event\.key === 'Home'/);
  assert.match(app, /contextMenuOpener\.focus/);
  assert.match(template, /id="docs-list" role="listbox" tabindex="0" aria-activedescendant=""/);
  assert.match(template, /id="docs-article"[^>]*tabindex="-1"/);
  assert.match(app, /document\.createElement\('div'\).*role.*option|option\.setAttribute\('role', 'option'\)/s);
  assert.match(styles, /input\[type="checkbox"\][^}]*min-width:\s*2\.75rem/s);
  assert.match(styles, /input\[type="range"\][^}]*min-height:\s*2\.75rem/s);
  assert.doesNotMatch(styles, /\.nav-search-stack[^\n{]*,[^{]*\.rail-actions[^\n{]*\{[^}]*position:\s*absolute/s);
  assert.match(accessibility, /partial negative-regression coverage/i);
  assert.match(inventory, /Partial negative-regression proof/);
});

test('rendered Markdown routes local article links inside the documentation browser', async () => {
  const app = await readFile(join(root, 'site', 'app.js'), 'utf8');
  assert.match(app, /function navigateDocumentationLink\(/);
  assert.match(app, /resolveDocumentationPath\(/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /openDoc\(targetArticle\.id/);
  assert.match(app, /data-doc-heading|scrollIntoView/);
});

test('installer manifest and canonical hair images fail closed on incomplete or mismatched evidence', async () => {
  const [composer, app] = await Promise.all([
    readFile(join(root, 'scripts', 'compose-site.mjs'), 'utf8'),
    readFile(join(root, 'site', 'app.js'), 'utf8')
  ]);
  for (const token of ['validateInstallerManifest', 'schemaVersion', 'owner', 'repository', 'tag', 'target', 'version', 'platform', 'filename', 'bytes', 'sha256', 'unsigned', 'publication']) assert.match(composer, new RegExp(token));
  assert.match(composer, /MAX_INSTALLER_MANIFEST_BYTES\s*=\s*64\s*\*\s*1024/);
  for (const token of ['validateTerminalTransfer', 'release-context.json', 'trusted-product-validation.json', 'terminal-transfer-receipt.json', 'installerSourceBinding', 'containerSourceBinding']) assert.match(composer, new RegExp(token));
  assert.match(composer, /join\(root, 'dist', 'terminal-transfer'\)/);
  assert.doesNotMatch(composer, /process\.env\.INSTALLER_MANIFEST|release['"], ['"]installer-manifest\.json/);
  assert.match(composer, /new TextDecoder\('utf-8', \{ fatal: true \}\)/);
  assert.match(composer, /MAX_HAIR_MANIFEST_BYTES\s*=\s*64\s*\*\s*1024/);
  assert.match(app, /manifest\.tag\s*!==\s*`v\$\{build\.version\}`/);
  assert.match(app, /manifest\.filename\.length\s*>\s*160/);
  assert.match(app, /typeof publication\.publishedAt\s*!==\s*'string'/);
  assert.match(composer, /gh['"], \['api'/);
  assert.match(composer, /\['release', 'download'/);
  assert.match(composer, /GitHub Setup asset bytes do not match/);
  assert.match(composer, /Ding-Ding-Projects/);
  assert.match(composer, /HairGrowthEstimator/);
  assert.match(composer, /releases\/download/);
  assert.match(composer, /function inspectPng\(/);
  assert.match(composer, /duplicate stage/i);
  assert.match(composer, /duplicate SHA-256/i);
  assert.match(composer, /1254/);
  assert.match(composer, /unexpected hair asset|manifest mismatch/i);
});

test('static CSP and integrated service guidance bind the website to reviewed counterparts', async () => {
  const [template, app, security, server, compose, dockerfile, packageJson] = await Promise.all([
    readFile(join(root, 'site', 'index.template.html'), 'utf8'),
    readFile(join(root, 'site', 'app.js'), 'utf8'),
    readFile(join(root, 'site', 'security-contract.js'), 'utf8'),
    readFile(join(root, 'server', 'index.js'), 'utf8'),
    readFile(join(root, 'docker-compose.yml'), 'utf8'),
    readFile(join(root, 'Dockerfile'), 'utf8'),
    readFile(join(root, 'package.json'), 'utf8')
  ]);
  assert.match(template, /http-equiv="Content-Security-Policy"/);
  assert.match(template, /default-src 'self'/);
  assert.match(template, /script-src 'self'/);
  assert.match(template, /worker-src 'self'/);
  assert.match(template, /connect-src 'self' http:\/\/127\.0\.0\.1:11434 http:\/\/localhost:11434/);
  assert.match(app, /allowedOrigins = new Set\(\['http:\/\/127\.0\.0\.1:11434', 'http:\/\/localhost:11434'\]\)/);
  assert.ok(security.includes(String.raw`pattern: /^http:\/\/(?:127\.0\.0\.1|localhost):11434`));
  assert.match(app, /function quarantineInvalidStoredState\(/);
  assert.match(app, /validateBrowserState/);
  assert.match(server, /url\.pathname === '\/health'/);
  assert.match(server, /\^\\\/api\\\/profiles\\\//);
  assert.match(compose, /hair-growth-api:/);
  assert.match(compose, /127\.0\.0\.1.*4782.*4782/);
  assert.match(dockerfile, /CMD \["node", "server\/index\.js"\]/);
  assert.match(packageJson, /"start:server"\s*:\s*"node server\/index\.js"/);

  const audit = (sources) => {
    const required = [
      [sources.template, 'docker compose up --build -d', 'container command'],
      [sources.server, "url.pathname === '/health'", 'health route'],
      [sources.server, '^\\/api\\/profiles\\/', 'profile route'],
      [sources.compose, 'hair-growth-api:', 'compose service'],
      [sources.dockerfile, 'CMD ["node", "server/index.js"]', 'container entry point']
    ];
    for (const [source, token, label] of required) if (!source.includes(token)) throw new Error(`Missing reviewed ${label} counterpart.`);
  };
  const sources = { template, server, compose, dockerfile };
  assert.doesNotThrow(() => audit(sources));
  assert.throws(() => audit({ ...sources, server: server.replace("url.pathname === '/health'", "url.pathname === '/stale-health'") }), /health route/);
  assert.doesNotThrow(() => audit(sources));
});
