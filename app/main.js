'use strict';

const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, autoUpdater } = require('electron');
const fs = require('node:fs/promises');
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

function defaultSchoolRecord() {
  return { schemaVersion: 1, enabled: false, displayName: 'School mode', updatedAt: null };
}

async function readSchoolRecord() {
  try {
    const raw = await fs.readFile(sharedSchoolPath(), 'utf8');
    const value = JSON.parse(raw);
    if (value?.schemaVersion !== 1 || typeof value.enabled !== 'boolean') return { ...defaultSchoolRecord(), status: 'invalid' };
    return {
      schemaVersion: 1,
      enabled: value.enabled,
      displayName: typeof value.displayName === 'string' && value.displayName.trim() ? value.displayName.trim().slice(0, 80) : 'School mode',
      updatedAt: typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt)) ? value.updatedAt : null,
      status: 'available'
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...defaultSchoolRecord(), status: 'available' };
    return { ...defaultSchoolRecord(), status: 'unavailable' };
  }
}

async function writeSchoolRecord(input) {
  const current = await readSchoolRecord();
  const next = {
    schemaVersion: 1,
    enabled: Boolean(input?.enabled),
    displayName: typeof input?.displayName === 'string' && input.displayName.trim() ? input.displayName.trim().slice(0, 80) : current.displayName,
    updatedAt: new Date().toISOString()
  };
  await atomicWriteJson(sharedSchoolPath(), next, { maxBytes: 16 * 1024 });
  lastSchoolRecord = JSON.stringify(next);
  mainWindow?.webContents.send('school:changed', { ...next, status: 'available' });
  return { ...next, status: 'available' };
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
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
    const reader = response.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new RangeError('Response exceeds 512 KiB.');
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
  ipcMain.handle('school:read', readSchoolRecord);
  ipcMain.handle('school:write', (_event, value) => writeSchoolRecord(value));
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
