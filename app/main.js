'use strict';

const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, autoUpdater } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const { atomicWriteFile, atomicWriteJson } = require('./core/atomic');
const { buildSshArguments } = require('./core/ssh');
const {
  createServiceCredentialRecord,
  isPublicServiceEndpoint,
  resolveServiceSecurityContext,
  serviceCredentialHeaders
} = require('./core/service-security');
const { validateProvenance } = require('./core/provenance');
const { StateStore, drainStateAndHistory } = require('./core/state-store');
const { LocalVault } = require('./core/vault');
const { LocalHistory } = require('./core/history');
const { evaluateRegex: evaluateRegexInWorker } = require('./core/regex-worker');
const EvidencePaths = require('./core/evidence-paths');
const { hashSecret, verifySecret } = require('./core/credentials');
const SchoolMode = require('./core/school-mode');
const ScheduledSettings = require('./core/scheduled-settings');
const { DIM_SUM_RECORD } = require('./core/delight-attention');
const {
  CANONICAL_UPDATE_FEED_URL,
  UpdateRestartAuthorization,
  assertTrustedMainFrame,
  createObservedDownloadedUpdate
} = require('./core/update-security');
const { LIMITS: VOCABULARY_LIMITS, VocabularyStore, serializeVocabularyCache } = require('./core/vocabulary');

const execFileAsync = promisify(execFile);
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
const MAX_CONVERTER_SOURCE_BYTES = 10 * 1024 * 1024;
const CONVERTER_HANDLES = new Map();
const OLLAMA_ENDPOINTS = new Set(['/api/version', '/api/tags', '/api/ps', '/api/show', '/api/pull', '/api/chat', '/api/generate', '/api/copy', '/api/delete']);

function initializeEvidencePathIsolation() {
  const validation = EvidencePaths.validateEvidencePathArguments(process.argv);
  if (!validation.active) return Object.freeze({ active: false });
  fsSync.mkdirSync(validation.paths.appData, { recursive: true, mode: 0o700 });
  fsSync.mkdirSync(validation.paths.userData, { recursive: true, mode: 0o700 });
  const activatedValidation = EvidencePaths.validateEvidencePathArguments(process.argv);
  app.setPath('appData', activatedValidation.paths.appData);
  app.setPath('userData', activatedValidation.paths.userData);
  const receipt = EvidencePaths.createEvidenceIsolationReceipt(activatedValidation);
  fsSync.writeFileSync(
    path.join(validation.paths.userData, 'evidence-isolation.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 }
  );
  fsSync.writeFileSync(
    path.join(validation.paths.appData, 'evidence-app-data-active.json'),
    `${JSON.stringify({ schemaVersion: 1, appDataPathSha256: receipt.appDataPathSha256 }, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 }
  );
  return Object.freeze({ active: true });
}

initializeEvidencePathIsolation();

let mainWindow = null;
let sshProcess = null;
let sshState = { status: 'disconnected', message: 'No SSH tunnel is active.' };
let localVault = null;
let localHistory = null;
let stateStore = null;
const updateAuthorization = new UpdateRestartAuthorization();
let activeUpdateCheck = null;
let lastSchoolRecord = '';
let schoolPoll = null;
let schoolUnlockFailures = { failures: 0, retryAt: 0 };
let shutdownStarted = false;
let shutdownReady = false;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function userDataPath(file) {
  return path.join(app.getPath('userData'), file);
}

function personalVocabularyCachePath() {
  return userDataPath('personal-vocabulary.json');
}

function sharedSchoolPath() {
  return path.join(app.getPath('appData'), 'Ding Ding Projects', 'shared-school-mode.json');
}

function sharedSchoolCredentialPath() {
  return path.join(app.getPath('appData'), 'Ding Ding Projects', 'shared-school-mode-credential.bin');
}

function dimSumPhotoCachePath() {
  return userDataPath('public-dim-sum-cache', DIM_SUM_RECORD.photoFileName);
}

function defaultSchoolRecord() {
  return SchoolMode.createDefaultSchoolRecord();
}

async function readSharedSchoolCredential() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system credential protection is unavailable.');
  try {
    const encrypted = await fs.readFile(sharedSchoolCredentialPath());
    const value = JSON.parse(safeStorage.decryptString(encrypted));
    if (value?.schemaVersion !== 1 || !['pin', 'password'].includes(value.kind) || !value.record || typeof value.record !== 'object') {
      throw new Error('The shared mode credential record is invalid.');
    }
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (/credential record is invalid|credential protection is unavailable/.test(error.message)) throw error;
    throw new Error('The shared mode credential record could not be read.');
  }
}

async function writeSharedSchoolCredential(kind, credential) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system credential protection is unavailable.');
  const record = {
    schemaVersion: 1,
    kind,
    record: hashSecret(credential, kind),
    updatedAt: new Date().toISOString()
  };
  const encrypted = safeStorage.encryptString(JSON.stringify(record));
  await atomicWriteFile(sharedSchoolCredentialPath(), encrypted, { mode: 0o600, maxBytes: 16 * 1024 });
  return record;
}

function publicSchoolRecord(record, credential, status = 'available') {
  return {
    ...record,
    credentialConfigured: Boolean(credential && record.unlock?.credentialRef === 'vault:shared-school-primary'),
    credentialKind: credential?.kind || null,
    status
  };
}

async function readSchoolRecord() {
  try {
    const raw = await fs.readFile(sharedSchoolPath(), 'utf8');
    const value = SchoolMode.normalizeSchoolRecord(JSON.parse(raw));
    const credential = await readSharedSchoolCredential();
    return publicSchoolRecord(value, credential);
  } catch (error) {
    if (error.code === 'ENOENT') {
      try { return publicSchoolRecord(defaultSchoolRecord(), await readSharedSchoolCredential()); } catch { return { ...defaultSchoolRecord(), status: 'unavailable' }; }
    }
    return { ...defaultSchoolRecord(), status: 'invalid', credentialConfigured: false, credentialKind: null };
  }
}

async function publishSchoolRecord(next) {
  lastSchoolRecord = JSON.stringify(next);
  mainWindow?.webContents.send('school:changed', next);
  return next;
}

async function persistSchoolRecord(record) {
  const normalized = SchoolMode.normalizeSchoolRecord(record);
  await atomicWriteJson(sharedSchoolPath(), normalized, { maxBytes: 16 * 1024 });
  return normalized;
}

function nextSchoolTimestamp(current) {
  const now = Date.now();
  const previous = current?.updatedAt ? Date.parse(current.updatedAt) : 0;
  return new Date(Math.max(now, Number.isFinite(previous) ? previous + 1 : now)).toISOString();
}

async function configureSchoolMode(input) {
  const credential = String(input?.credential || '');
  const requestedKind = ['pin', 'password'].includes(input?.credentialKind) ? input.credentialKind : 'password';
  const requestedDisplayName = SchoolMode.normalizeSchoolDisplayName(input?.displayName);
  const currentPublic = await readSchoolRecord();
  const current = currentPublic.status === 'available'
    ? SchoolMode.normalizeSchoolRecord({
        schemaVersion: currentPublic.schemaVersion,
        revision: currentPublic.revision,
        enabled: currentPublic.enabled,
        displayName: currentPublic.displayName,
        unlock: currentPublic.unlock,
        updatedAt: currentPublic.updatedAt
      })
    : defaultSchoolRecord();
  const existing = await readSharedSchoolCredential();
  let activeCredential = existing;
  const credentialRef = 'vault:shared-school-primary';
  const evidence = {};
  if (existing) {
    if (!verifySecret(credential, existing.record, existing.kind)) throw new Error('The shared unlock value did not match. No shared change was made.');
    if (requestedKind !== existing.kind) throw new Error('Choose the configured shared unlock method before changing this mode.');
    evidence.verifiedCredentialRef = credentialRef;
  } else {
    activeCredential = await writeSharedSchoolCredential(requestedKind, credential);
    evidence.enrolledCredentialRef = credentialRef;
  }
  const unlock = { policy: activeCredential.kind, credentialRef };
  if (!current.unlock || current.unlock.policy !== unlock.policy || current.unlock.credentialRef !== unlock.credentialRef) evidence.enrolledCredentialRef = credentialRef;
  const next = await persistSchoolRecord(SchoolMode.transitionSchoolMode(current, {
    enabled: true,
    displayName: requestedDisplayName,
    unlock,
    updatedAt: nextSchoolTimestamp(current)
  }, evidence));
  schoolUnlockFailures = { failures: 0, retryAt: 0 };
  return publishSchoolRecord(publicSchoolRecord(next, activeCredential));
}

async function disableSchoolMode(input) {
  const now = Date.now();
  if (schoolUnlockFailures.retryAt > now) {
    return { ...(await readSchoolRecord()), unlocked: false, retryAfterMs: schoolUnlockFailures.retryAt - now };
  }
  const existing = await readSharedSchoolCredential();
  if (!existing) throw new Error('No shared unlock credential is configured. Configure one before changing the shared mode.');
  if (!verifySecret(String(input?.credential || ''), existing.record, existing.kind)) {
    const failures = schoolUnlockFailures.failures + 1;
    const retryAt = failures >= 5 ? now + 30000 : 0;
    schoolUnlockFailures = { failures: retryAt ? 0 : failures, retryAt };
    return { ...(await readSchoolRecord()), unlocked: false, retryAfterMs: retryAt ? 30000 : 0, remainingBeforeDelay: retryAt ? 0 : 5 - failures };
  }
  schoolUnlockFailures = { failures: 0, retryAt: 0 };
  const currentPublic = await readSchoolRecord();
  const current = SchoolMode.normalizeSchoolRecord({
    schemaVersion: currentPublic.schemaVersion,
    revision: currentPublic.revision,
    enabled: currentPublic.enabled,
    displayName: currentPublic.displayName,
    unlock: currentPublic.unlock,
    updatedAt: currentPublic.updatedAt
  });
  const next = await persistSchoolRecord(SchoolMode.transitionSchoolMode(current, {
    enabled: false,
    updatedAt: nextSchoolTimestamp(current)
  }, { verifiedCredentialRef: current.unlock.credentialRef }));
  return publishSchoolRecord({ ...publicSchoolRecord(next, existing), unlocked: true });
}

async function pollSchoolRecord() {
  const record = await readSchoolRecord();
  const serialized = JSON.stringify(record);
  if (serialized !== lastSchoolRecord) {
    lastSchoolRecord = serialized;
    mainWindow?.webContents.send('school:changed', record);
  }
}

function redactedHistoryState(state) {
  const clone = structuredClone(state);
  delete clone.revision;
  delete clone.updatedAt;
  if (clone.settings?.sync?.ssh?.keyFile) clone.settings.sync.ssh.keyFile = '[omitted from history]';
  if (clone.settings?.logo?.customDataUrl) clone.settings.logo.customDataUrl = '[local custom image omitted from history]';
  clone.vocabulary = { loaded: Boolean(clone.vocabulary?.loaded), cacheVersion: clone.vocabulary?.cacheVersion || null };
  return clone;
}

async function readState() {
  return stateStore.read();
}

async function writeStateWithHistory(input, event = 'Application state updated') {
  const result = await stateStore.write(input, event);
  if (result.history.status === 'degraded' || result.history.status === 'unavailable') {
    mainWindow?.webContents.send('history:error', { message: result.history.message });
  }
  return result;
}

async function writeState(input, event = 'Application state updated') {
  return (await writeStateWithHistory(input, event)).state;
}

async function readProvenance() {
  let raw;
  let release = null;
  try {
    raw = JSON.parse(await fs.readFile(path.join(__dirname, 'provenance.json'), 'utf8'));
  } catch {
    raw = null;
  }
  try {
    const candidate = JSON.parse(await fs.readFile(path.join(__dirname, 'release-metadata.json'), 'utf8'));
    if (candidate?.schemaVersion === 1 && candidate.version === app.getVersion() && typeof candidate.codeName === 'string' && typeof candidate.publicPhotoUrl === 'string') {
      release = candidate;
    }
  } catch {}
  return { ...validateProvenance(raw, app.getVersion()), release };
}

async function boundedFetch(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Math.min(120000, Number(options.timeoutMs) || 8000));
  const maxResponseBytes = Math.max(256, Math.min(MAX_RESPONSE_BYTES, Number(options.maxResponseBytes) || MAX_RESPONSE_BYTES));
  const fetchOptions = { ...options };
  delete fetchOptions.timeoutMs;
  delete fetchOptions.maxResponseBytes;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal, redirect: 'error' });
    const reader = response.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxResponseBytes) {
          await reader.cancel();
          throw new RangeError(`Response exceeds the ${maxResponseBytes}-byte limit.`);
        }
        chunks.push(Buffer.from(value));
      }
    }
    const text = Buffer.concat(chunks).toString('utf8');
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch { throw new Error('The service returned invalid JSON.'); }
    }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

function validateDimSumPhoto(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 8 || bytes.length > 2 * 1024 * 1024) throw new RangeError('The public catalog photo is outside the supported size bound.');
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(pngSignature)) throw new TypeError('The public catalog photo is not a valid PNG payload.');
  return bytes;
}

async function fetchBoundedBytes(url, { timeoutMs = 8000, maxBytes = 2 * 1024 * 1024 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(30000, Number(timeoutMs) || 8000)));
  try {
    const response = await fetch(url, { method: 'GET', headers: { accept: 'image/png' }, redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new Error(`The public catalog returned HTTP ${response.status}.`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('The public catalog photo response had no body.');
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RangeError(`The public catalog photo exceeds ${maxBytes} bytes.`);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}

async function dimSumPhotoDataUrl() {
  let bytes;
  try {
    bytes = validateDimSumPhoto(await fs.readFile(dimSumPhotoCachePath()));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof TypeError) && !(error instanceof RangeError)) throw error;
    bytes = validateDimSumPhoto(await fetchBoundedBytes(DIM_SUM_RECORD.photoUrl));
    await atomicWriteFile(dimSumPhotoCachePath(), bytes, { mode: 0o600, maxBytes: 2 * 1024 * 1024 });
  }
  return { dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, alt: DIM_SUM_RECORD.alt, id: DIM_SUM_RECORD.id };
}

function normalizeScheduleRuleInput(input) {
  return ScheduledSettings.normalizeScheduleRule(input?.rule || input);
}

async function resolveScheduledSource(input) {
  const rule = normalizeScheduleRuleInput(input);
  const generation = Number(input?.generation);
  const receivedAt = new Date().toISOString();
  if (rule.source.type === 'local') {
    return ScheduledSettings.validateSourceResult(rule, null, { generation, receivedAt });
  }
  const descriptor = ScheduledSettings.createExternalRequestDescriptor(rule);
  const headers = { ...descriptor.headers };
  if (rule.source.type === 'home-assistant') {
    const scope = ScheduledSettings.canonicalSourceScope(rule);
    const accessToken = await localVault.externalSettingToken(scope);
    if (!accessToken) throw new Error('The Home Assistant access token is not stored for this exact rule source.');
    headers.authorization = `Bearer ${accessToken}`;
  }
  const { response, body } = await boundedFetch(descriptor.url, {
    method: descriptor.method,
    headers,
    credentials: 'omit',
    timeoutMs: descriptor.timeoutMs,
    maxResponseBytes: descriptor.maxResponseBytes
  });
  if (!response.ok) throw new Error(`The scheduled-settings source returned HTTP ${response.status}.`);
  return ScheduledSettings.validateSourceResult(rule, body, { generation, receivedAt });
}

async function setHomeAssistantScheduleToken(input) {
  const rule = normalizeScheduleRuleInput(input);
  if (rule.source.type !== 'home-assistant') throw new TypeError('A Home Assistant rule is required to store this access token.');
  return localVault.setExternalSettingToken(ScheduledSettings.canonicalSourceScope(rule), input?.token);
}

async function hasHomeAssistantScheduleToken(input) {
  const rule = normalizeScheduleRuleInput(input);
  if (rule.source.type !== 'home-assistant') return false;
  return localVault.hasExternalSettingToken(ScheduledSettings.canonicalSourceScope(rule));
}

async function apiRequest(request) {
  const policy = resolveServiceSecurityContext(request.sync, sshState);
  const endpoint = String(request.endpoint || '');
  if (!/^\/(?:health|version|api\/profiles\/[a-zA-Z0-9_-]{1,64}(?:\/haircuts(?:\/[a-zA-Z0-9-]{8,64})?)?)$/.test(endpoint)) {
    throw new TypeError('Service endpoint is not allowlisted.');
  }
  const url = new URL(endpoint, policy.baseUrl);
  const bodyText = request.body === undefined ? null : JSON.stringify(request.body);
  if (bodyText && Buffer.byteLength(bodyText) > 64 * 1024) throw new RangeError('Request body exceeds 64 KiB.');
  const apiKey = isPublicServiceEndpoint(endpoint) ? '' : await localVault.apiKeyForScope(policy.credentialScope);
  const credential = apiKey ? createServiceCredentialRecord(policy, apiKey) : null;
  const { response, body } = await boundedFetch(url, {
    method: ['GET', 'PUT', 'POST', 'DELETE'].includes(request.method) ? request.method : 'GET',
    headers: {
      accept: 'application/json',
      ...(bodyText ? { 'content-type': 'application/json' } : {}),
      ...serviceCredentialHeaders(policy, endpoint, credential)
    },
    body: bodyText,
    timeoutMs: request.timeoutMs
  });
  if (!response.ok) throw new Error(body?.error || `Service returned HTTP ${response.status}.`);
  return body;
}

function sendSshState(state) {
  sshState = state;
  mainWindow?.webContents.send('ssh:state', state);
  return state;
}

async function stopSshTunnel() {
  if (!sshProcess) return sendSshState({ status: 'disconnected', message: 'No SSH tunnel is active.' });
  const child = sshProcess;
  sshProcess = null;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500))
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
  return sendSshState({ status: 'disconnected', message: 'SSH tunnel stopped.' });
}

async function startSshTunnel(config) {
  await stopSshTunnel();
  if (config.keyFile) await fs.access(path.resolve(config.keyFile));
  const args = buildSshArguments(config, app.getPath('home'));
  sendSshState({ status: 'connecting', message: 'Starting a tunnel with strict host-key verification.' });
  return new Promise((resolve, reject) => {
    const child = spawn('ssh.exe', args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], shell: false });
    sshProcess = child;
    let errorText = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (sshProcess !== child || settled) return;
      settled = true;
      const state = sendSshState({
        status: 'connected',
        host: String(config.host || '').trim(),
        port: Number(config.port),
        remoteApiPort: Number(config.remoteApiPort),
        localForwardPort: Number(config.localForwardPort),
        message: `Tunnel ready on 127.0.0.1:${config.localForwardPort}.`
      });
      resolve(state);
    }, 1200);
    child.stderr.on('data', (chunk) => { errorText = `${errorText}${chunk.toString('utf8')}`.slice(-2000); });
    child.once('error', (error) => {
      clearTimeout(timer);
      if (sshProcess === child) sshProcess = null;
      if (!settled) {
        settled = true;
        const message = error.code === 'ENOENT' ? 'OpenSSH client was not found on this computer.' : error.message;
        sendSshState({ status: 'error', message });
        reject(new Error(message));
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (sshProcess === child) sshProcess = null;
      const detail = errorText.trim().split(/\r?\n/).at(-1);
      if (!settled) {
        settled = true;
        const message = detail ? `SSH tunnel could not start: ${detail}` : `ssh.exe exited with code ${code}.`;
        sendSshState({ status: 'error', message });
        reject(new Error(message));
      } else {
        sendSshState({ status: 'disconnected', message: `SSH tunnel closed with code ${code}.` });
      }
    });
  });
}

async function chooseFile(options) {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result.canceled ? null : result.filePaths[0];
}

function detectImage(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

async function readBoundedFile(filePath, maxBytes) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new TypeError('The selected item is not a file.');
  if (stat.size > maxBytes) throw new RangeError(`The selected file exceeds ${maxBytes} bytes.`);
  return fs.readFile(filePath);
}

async function readVocabularyCacheBytes() {
  try {
    return await fs.readFile(personalVocabularyCachePath());
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('The local personal-vocabulary cache could not be read.');
  }
}

function presentVocabularyStatus(result, canceled = false) {
  return {
    canceled,
    status: result.status,
    loaded: result.loaded,
    schemaVersion: result.loaded ? 1 : null,
    entries: result.entries,
    preservedLastValid: result.preservedLastValid,
    error: result.error ? { code: result.error.code, message: result.error.message } : null
  };
}

async function readVocabularyCache() {
  const store = new VocabularyStore(await readVocabularyCacheBytes());
  return presentVocabularyStatus(store.read());
}

async function replaceVocabularyCache() {
  const filePath = await chooseFile({ title: 'Choose personal vocabulary JSON', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!filePath) return { ...(await readVocabularyCache()), canceled: true };
  const priorBytes = await readVocabularyCacheBytes();
  const candidateBytes = await readBoundedFile(filePath, VOCABULARY_LIMITS.maxBytes);
  const store = new VocabularyStore(priorBytes);
  const result = store.replace(candidateBytes);
  if (result.status !== 'loaded') {
    throw new TypeError(result.preservedLastValid
      ? 'The selected private vocabulary file is invalid. The last valid local cache remains active.'
      : 'The selected private vocabulary file is invalid. Original shipped wording remains active.');
  }
  const serialized = serializeVocabularyCache({ schemaVersion: 1, entries: result.entries });
  await atomicWriteFile(personalVocabularyCachePath(), serialized, { encoding: 'utf8', mode: 0o600, maxBytes: VOCABULARY_LIMITS.maxBytes });
  return presentVocabularyStatus(result);
}

async function clearVocabularyCache() {
  try {
    await fs.unlink(personalVocabularyCachePath());
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('The local personal-vocabulary cache could not be cleared.');
  }
  return presentVocabularyStatus(new VocabularyStore().clear());
}

async function chooseLogoFile() {
  const filePath = await chooseFile({ title: 'Choose a local logo image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (!filePath) return { canceled: true };
  const bytes = await readBoundedFile(filePath, 2 * 1024 * 1024);
  const mimeType = detectImage(bytes);
  if (!mimeType) throw new TypeError('The selected file is not a supported PNG, JPEG, or WebP image.');
  return { canceled: false, name: path.basename(filePath), bytes: bytes.length, dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}` };
}

async function chooseConverterSource() {
  const filePath = await chooseFile({ title: 'Choose a file to convert', properties: ['openFile'] });
  if (!filePath) return { canceled: true };
  const bytes = await readBoundedFile(filePath, MAX_CONVERTER_SOURCE_BYTES);
  const handle = crypto.randomUUID();
  CONVERTER_HANDLES.set(handle, { filePath, expiresAt: Date.now() + 15 * 60 * 1000 });
  return { canceled: false, handle, name: path.basename(filePath), bytes: bytes.length, leadingBytesHex: bytes.subarray(0, 16).toString('hex') };
}

function converterOutput(bytes, adapter) {
  if (adapter === 'base64') return { extension: 'txt', content: `${bytes.toString('base64')}\n`, encoding: 'utf8' };
  if (adapter === 'hex') return { extension: 'txt', content: `${bytes.toString('hex')}\n`, encoding: 'utf8' };
  const text = bytes.toString('utf8');
  if (adapter === 'json-pretty') return { extension: 'json', content: `${JSON.stringify(JSON.parse(text), null, 2)}\n`, encoding: 'utf8' };
  if (adapter === 'normalize-text') return { extension: 'txt', content: `${text.replace(/\r\n|\r|\n/g, '\r\n').replace(/\r\n*$/, '')}\r\n`, encoding: 'utf8' };
  throw new TypeError('The selected converter adapter is unavailable.');
}

async function convertFile({ handle, adapter }) {
  const source = CONVERTER_HANDLES.get(String(handle || ''));
  if (!source || source.expiresAt <= Date.now()) throw new Error('The local file selection expired. Choose the source again.');
  const bytes = await readBoundedFile(source.filePath, MAX_CONVERTER_SOURCE_BYTES);
  const output = converterOutput(bytes, adapter);
  const baseName = path.basename(source.filePath, path.extname(source.filePath));
  const save = await dialog.showSaveDialog(mainWindow, { title: 'Save converted file', defaultPath: `${baseName}.${output.extension}`, properties: ['createDirectory', 'showOverwriteConfirmation'] });
  if (save.canceled || !save.filePath) return { canceled: true };
  await atomicWriteFile(save.filePath, output.content, { encoding: output.encoding, mode: 0o600 });
  const written = await fs.readFile(save.filePath, output.encoding);
  if (written !== output.content) throw new Error('Converted output did not pass post-write validation.');
  return { canceled: false, name: path.basename(save.filePath), bytes: Buffer.byteLength(output.content) };
}

async function exportContent({ suggestedName, content }) {
  const text = String(content || '');
  if (Buffer.byteLength(text) > MAX_EXPORT_BYTES) throw new RangeError('Export exceeds 10 MiB.');
  const result = await dialog.showSaveDialog(mainWindow, { title: 'Export data', defaultPath: path.basename(String(suggestedName || 'hair-growth-export.txt')), properties: ['createDirectory', 'showOverwriteConfirmation'] });
  if (result.canceled || !result.filePath) return { canceled: true };
  await atomicWriteFile(result.filePath, text, { encoding: 'utf8', mode: 0o600 });
  return { canceled: false, name: path.basename(result.filePath), bytes: Buffer.byteLength(text) };
}

async function openInVsCode(targetPath) {
  const resolved = path.resolve(String(targetPath || app.getPath('documents')));
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'),
    path.join(process.env.ProgramFiles || '', 'Microsoft VS Code', 'bin', 'code.cmd'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd')
  ].filter(Boolean);
  let executable = null;
  for (const candidate of candidates) {
    try { await fs.access(candidate); executable = candidate; break; } catch {}
  }
  if (!executable) {
    try {
      const { stdout } = await execFileAsync('where.exe', ['code.cmd'], { windowsHide: true, timeout: 3000 });
      executable = stdout.split(/\r?\n/).find(Boolean);
    } catch {}
  }
  if (!executable) return { opened: false, reason: 'Visual Studio Code was not found. The application remains fully usable without it.' };
  const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${executable}" "${resolved}"`], { windowsHide: true, detached: true, stdio: 'ignore', shell: false });
  child.unref();
  return { opened: true };
}

async function ollamaRequest({ endpoint, method = 'GET', body, timeoutMs = 10000 }) {
  if (!OLLAMA_ENDPOINTS.has(endpoint)) throw new TypeError('Ollama endpoint is not allowlisted.');
  const bodyText = body === undefined ? null : JSON.stringify(body);
  if (bodyText && Buffer.byteLength(bodyText) > 256 * 1024) throw new RangeError('Ollama request exceeds 256 KiB.');
  const { response, body: responseBody } = await boundedFetch(new URL(endpoint, 'http://127.0.0.1:11434'), {
    method: ['GET', 'POST', 'DELETE'].includes(method) ? method : 'GET',
    headers: { accept: 'application/json', ...(bodyText ? { 'content-type': 'application/json' } : {}) },
    body: bodyText,
    timeoutMs
  });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
  return responseBody;
}

const updateState = { status: 'idle', currentVersion: null, availableVersion: null, message: 'No update check has run.' };
const rendererApplicationUrl = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href;

function publishUpdateState(patch) {
  Object.assign(updateState, patch);
  mainWindow?.webContents.send('update:state', { ...updateState });
}

function assertTrustedIpcSender(event) {
  if (!mainWindow || event?.sender !== mainWindow.webContents) {
    const error = new Error('The request did not originate from the application window.');
    error.code = 'ERR_UNTRUSTED_IPC_SENDER';
    throw error;
  }
  return assertTrustedMainFrame({
    senderFrame: event.senderFrame,
    mainFrame: mainWindow.webContents.mainFrame,
    applicationUrl: rendererApplicationUrl
  });
}

function registerUpdaterEvents() {
  autoUpdater.on('checking-for-update', () => publishUpdateState({ status: 'checking', message: 'Checking the unsigned HTTPS update feed.' }));
  autoUpdater.on('update-available', (_event, notes, name) => {
    if (!activeUpdateCheck) return;
    activeUpdateCheck.availableVersion = typeof name === 'string' ? name.slice(0, 80) : null;
    publishUpdateState({
      status: 'available',
      availableVersion: activeUpdateCheck.availableVersion,
      message: String(notes || 'An update is available.').slice(0, 4000)
    });
  });
  autoUpdater.on('update-not-available', () => {
    updateAuthorization.supersede();
    activeUpdateCheck = null;
    publishUpdateState({ status: 'current', availableVersion: null, message: 'This version is current.' });
  });
  autoUpdater.on('update-downloaded', (_event, notes, name) => {
    try {
      if (!activeUpdateCheck) throw new Error('No active update check owns this downloaded update event.');
      const observedUpdate = createObservedDownloadedUpdate({
        provider: 'squirrel-windows',
        releaseName: name,
        downloadedEvent: true
      });
      const ready = updateAuthorization.markReady({
        version: observedUpdate.releaseName,
        feedUrl: activeUpdateCheck.feedUrl,
        generation: activeUpdateCheck.generation,
        observedUpdate
      });
      activeUpdateCheck = null;
      publishUpdateState({
        status: 'ready',
        availableVersion: ready.version,
        message: `${String(notes || 'Update downloaded.').slice(0, 3800)} The package is unsigned. Restart only after saving work.`
      });
    } catch (error) {
      activeUpdateCheck = null;
      updateAuthorization.recordError();
      publishUpdateState({
        status: 'error',
        availableVersion: null,
        message: `The downloaded update could not be authorized: ${error.message}`
      });
    }
  });
  autoUpdater.on('error', (error) => {
    activeUpdateCheck = null;
    updateAuthorization.recordError();
    publishUpdateState({ status: 'error', availableVersion: null, message: error.message });
  });
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    updateAuthorization.supersede();
    activeUpdateCheck = null;
    publishUpdateState({ status: 'unavailable', availableVersion: null, message: 'Update checks are available in packaged builds.' });
    return { ...updateState };
  }
  if (activeUpdateCheck) throw new Error('An update check is already active.');
  updateAuthorization.applyMainProcessFeed(CANONICAL_UPDATE_FEED_URL);
  autoUpdater.setFeedURL({ url: CANONICAL_UPDATE_FEED_URL });
  activeUpdateCheck = { ...updateAuthorization.beginCheck(), availableVersion: null };
  publishUpdateState({ status: 'checking', currentVersion: app.getVersion(), message: 'Checking the unsigned HTTPS update feed.' });
  try {
    autoUpdater.checkForUpdates();
  } catch (error) {
    activeUpdateCheck = null;
    updateAuthorization.recordError();
    publishUpdateState({ status: 'error', availableVersion: null, message: error.message });
    throw error;
  }
  return { ...updateState };
}

async function restartVerifiedUpdate() {
  const ready = updateAuthorization.snapshot().ready;
  if (!ready) throw new Error('No verified downloaded update is ready to install.');
  await drainStateAndHistory(stateStore, localHistory);
  await stopSshTunnel();
  updateAuthorization.consumeRestart(ready);
  shutdownStarted = true;
  shutdownReady = true;
  try {
    autoUpdater.quitAndInstall();
  } catch (error) {
    shutdownStarted = false;
    shutdownReady = false;
    throw error;
  }
  return { restarting: true, version: ready.version };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 880,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'Hair Growth Estimator',
    icon: path.join(__dirname, '..', 'assets', 'app-icon.ico'),
    backgroundColor: '#0c1513',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerIpc() {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:setTitle', (_event, value) => { mainWindow?.setTitle(String(value || 'Hair Growth Estimator').slice(0, 80)); });
  ipcMain.handle('provenance:read', readProvenance);
  ipcMain.handle('state:read', readState);
  ipcMain.handle('state:write', (_event, { state, event }) => writeState(state, event));
  ipcMain.handle('school:read', (event) => { assertTrustedIpcSender(event); return readSchoolRecord(); });
  ipcMain.handle('school:configure', (event, value) => { assertTrustedIpcSender(event); return configureSchoolMode(value); });
  ipcMain.handle('school:disable', (event, value) => { assertTrustedIpcSender(event); return disableSchoolMode(value); });
  ipcMain.handle('accessibility:status', (event) => { assertTrustedIpcSender(event); return Boolean(app.accessibilitySupportEnabled); });
  ipcMain.handle('delight:photo', (event) => { assertTrustedIpcSender(event); return dimSumPhotoDataUrl(); });
  ipcMain.handle('schedule:resolve', (event, value) => { assertTrustedIpcSender(event); return resolveScheduledSource(value); });
  ipcMain.handle('schedule:setHomeAssistantToken', (event, value) => { assertTrustedIpcSender(event); return setHomeAssistantScheduleToken(value); });
  ipcMain.handle('schedule:hasHomeAssistantToken', (event, value) => { assertTrustedIpcSender(event); return hasHomeAssistantScheduleToken(value); });
  ipcMain.handle('secret:setApiKey', (event, { sync, value }) => {
    assertTrustedIpcSender(event);
    const policy = resolveServiceSecurityContext(sync, sshState);
    return localVault.setApiKeyForScope(policy.credentialScope, value);
  });
  ipcMain.handle('secret:hasApiKey', (event, sync) => {
    assertTrustedIpcSender(event);
    const policy = resolveServiceSecurityContext(sync, sshState);
    return localVault.hasApiKeyForScope(policy.credentialScope);
  });
  ipcMain.handle('lock:set', (_event, value) => localVault.setLock(value));
  ipcMain.handle('lock:list', () => localVault.listLocks());
  ipcMain.handle('lock:verify', (_event, value) => localVault.verifyLock(value));
  ipcMain.handle('lock:remove', (_event, value) => localVault.removeLock(value));
  ipcMain.handle('auth:createSecret', () => localVault.createTotpSecret());
  ipcMain.handle('auth:add', (_event, value) => localVault.addAuthenticator(value));
  ipcMain.handle('auth:list', () => localVault.listAuthenticators());
  ipcMain.handle('auth:remove', (_event, id) => localVault.removeAuthenticator(id));
  ipcMain.handle('file:chooseKey', async () => {
    const filePath = await chooseFile({ title: 'Choose an SSH private key', properties: ['openFile'], filters: [{ name: 'Private keys', extensions: ['pem', 'key', 'ppk'] }, { name: 'All files', extensions: ['*'] }] });
    return filePath || '';
  });
  ipcMain.handle('vocabulary:read', readVocabularyCache);
  ipcMain.handle('vocabulary:replace', replaceVocabularyCache);
  ipcMain.handle('vocabulary:clear', clearVocabularyCache);
  ipcMain.handle('file:chooseLogo', chooseLogoFile);
  ipcMain.handle('file:chooseConverterSource', chooseConverterSource);
  ipcMain.handle('file:convert', (_event, value) => convertFile(value));
  ipcMain.handle('file:export', (_event, value) => exportContent(value));
  ipcMain.handle('file:showAppData', async () => { await shell.openPath(app.getPath('userData')); return app.getPath('userData'); });
  ipcMain.handle('external:openVsCode', (_event, target) => openInVsCode(target));
  ipcMain.handle('external:openUrl', async (_event, raw) => {
    const url = new URL(raw);
    if (url.protocol !== 'https:') throw new TypeError('Only HTTPS links can be opened.');
    await shell.openExternal(url.href);
    return true;
  });
  ipcMain.handle('history:setCredential', (_event, credential) => localVault.setHistoryPassword(credential));
  ipcMain.handle('history:list', (_event, options) => localHistory.list(options));
  ipcMain.handle('history:read', (_event, commit, credential) => localHistory.read(commit, { credential }));
  ipcMain.handle('history:diff', async (_event, fromCommit, toCommit, credential) => {
    const result = await localHistory.diff(fromCommit, toCommit, { credential });
    return `${JSON.stringify(result, null, 2)}\n`;
  });
  ipcMain.handle('history:restore', async (_event, commit, credential) => {
    const historySnapshot = await localHistory.read(commit, { credential });
    const current = await stateStore.read();
    const restored = historySnapshot.state && typeof historySnapshot.state === 'object' ? structuredClone(historySnapshot.state) : {};
    restored.revision = current.revision;
    restored.settings = restored.settings && typeof restored.settings === 'object' ? restored.settings : {};
    restored.settings.sync = restored.settings.sync && typeof restored.settings.sync === 'object' ? restored.settings.sync : {};
    restored.settings.sync.ssh = restored.settings.sync.ssh && typeof restored.settings.sync.ssh === 'object' ? restored.settings.sync.ssh : {};
    restored.settings.sync.ssh.keyFile = current.settings.sync.ssh.keyFile;
    restored.settings.logo = restored.settings.logo && typeof restored.settings.logo === 'object' ? restored.settings.logo : {};
    restored.settings.logo.customDataUrl = current.settings.logo.customDataUrl;
    restored.vocabulary = current.vocabulary;
    const result = await writeStateWithHistory(restored, 'Restored local history revision');
    return {
      recorded: result.history.recorded,
      commit: result.history.commit || null,
      restoredFrom: String(commit).toLowerCase(),
      state: result.state
    };
  });
  ipcMain.handle('history:label', (_event, commit, label, credential) => localHistory.label(commit, label, { credential }));
  ipcMain.handle('history:prune', (_event, maxEntries, credential) => localHistory.prune({ maxEntries, credential }));
  ipcMain.handle('history:export', async (_event, options) => `${JSON.stringify(await localHistory.exportRedacted(options), null, 2)}\n`);
  ipcMain.handle('server:request', (event, request) => {
    assertTrustedIpcSender(event);
    return apiRequest(request);
  });
  ipcMain.handle('ssh:start', (_event, config) => startSshTunnel(config));
  ipcMain.handle('ssh:stop', stopSshTunnel);
  ipcMain.handle('ssh:state', () => sshState);
  ipcMain.handle('ollama:request', (_event, request) => ollamaRequest(request));
  ipcMain.handle('regex:evaluate', (event, request) => {
    assertTrustedIpcSender(event);
    return evaluateRegexInWorker(request);
  });
  ipcMain.handle('update:state', (event) => {
    assertTrustedIpcSender(event);
    return { ...updateState, currentVersion: app.getVersion() };
  });
  ipcMain.handle('update:check', (event) => {
    assertTrustedIpcSender(event);
    return checkForUpdates();
  });
  ipcMain.handle('update:restart', (event) => {
    assertTrustedIpcSender(event);
    return restartVerifiedUpdate();
  });
}

app.whenReady().then(async () => {
  localVault = new LocalVault({ filePath: userDataPath('credentials.bin'), safeStorage });
  localHistory = new LocalHistory(userDataPath('history'), {
    authenticate: ({ credential }) => localVault.verifyHistoryPassword(credential)
  });
  stateStore = new StateStore({
    filePath: userDataPath('hair-growth.json'),
    history: localHistory,
    today: todayIso,
    redact: redactedHistoryState
  });
  registerUpdaterEvents();
  registerIpc();
  app.on('accessibility-support-changed', (_event, enabled) => {
    mainWindow?.webContents.send('accessibility:changed', Boolean(enabled));
  });
  createWindow();
  lastSchoolRecord = JSON.stringify(await readSchoolRecord());
  schoolPoll = setInterval(() => { pollSchoolRecord().catch(() => {}); }, 1500);
});

app.on('before-quit', (event) => {
  if (schoolPoll) clearInterval(schoolPoll);
  schoolPoll = null;
  if (shutdownReady) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  Promise.resolve()
    .then(() => drainStateAndHistory(stateStore, localHistory))
    .then(() => stopSshTunnel())
    .catch((error) => {
      mainWindow?.webContents.send('shutdown:error', { message: error?.message || String(error) });
    })
    .finally(() => {
      shutdownReady = true;
      app.quit();
    });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
