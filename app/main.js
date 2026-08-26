const { app, BrowserWindow, dialog, ipcMain, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

const DEFAULT_STATE = Object.freeze({
  version: 1,
  profile: {
    baselineLengthCm: 1.2,
    baselineDate: new Date().toISOString().slice(0, 10),
    growthRateCmPerMonth: 1.25,
    targetLengthCm: 12,
    displayUnit: 'cm'
  },
  haircuts: [],
  settings: {
    language: 'en',
    theme: 'dark',
    storageMode: 'local',
    serverUrl: 'http://127.0.0.1:4782',
    connectionTimeoutMs: 8000,
    ssh: {
      host: '',
      port: 22,
      username: '',
      remoteApiPort: 4782,
      localForwardPort: 14782,
      keyFile: ''
    }
  }
});

let mainWindow;
let sshProcess = null;
let sshState = { status: 'disconnected', message: 'No SSH tunnel is active.' };

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function dataPath(file) {
  return path.join(app.getPath('userData'), file);
}

async function renameWithRetry(from, to) {
  const transient = new Set(['EPERM', 'EACCES', 'EBUSY']);
  let lastError;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      lastError = error;
      if (!transient.has(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function atomicWriteJson(file, value) {
  const destination = dataPath(file);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    await renameWithRetry(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function readState() {
  try {
    const raw = await fs.readFile(dataPath('hair-growth.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...cloneDefaultState(), ...parsed, profile: { ...DEFAULT_STATE.profile, ...parsed.profile }, settings: { ...DEFAULT_STATE.settings, ...parsed.settings, ssh: { ...DEFAULT_STATE.settings.ssh, ...parsed.settings?.ssh } } };
  } catch (error) {
    if (error.code === 'ENOENT' || error.name === 'SyntaxError') return cloneDefaultState();
    throw error;
  }
}

async function writeState(state) {
  await atomicWriteJson('hair-growth.json', state);
  return state;
}

async function storeApiKey(apiKey) {
  if (!apiKey) {
    await fs.rm(dataPath('server-key.enc'), { force: true });
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system encryption is unavailable. The API key was not stored.');
  const encrypted = safeStorage.encryptString(apiKey);
  await fs.writeFile(dataPath('server-key.enc'), encrypted, { flag: 'w', mode: 0o600 });
}

async function readApiKey() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(await fs.readFile(dataPath('server-key.enc')));
  } catch {
    return '';
  }
}

function validatedServerUrl(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP or HTTPS server URLs are supported.');
  if (url.username || url.password) throw new Error('Credentials must not be embedded in the server URL.');
  return url;
}

async function apiRequest(serverUrl, endpoint, options = {}) {
  const url = new URL(endpoint, validatedServerUrl(serverUrl));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(Number(options.timeoutMs) || 8000, 1000), 30000));
  try {
    const apiKey = await readApiKey();
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(apiKey ? { 'x-api-key': apiKey } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(body?.error || `Server returned HTTP ${response.status}.`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function sshArguments(config) {
  const port = Number(config.port);
  const remoteApiPort = Number(config.remoteApiPort);
  const localForwardPort = Number(config.localForwardPort);
  if (!config.host || !/^[a-zA-Z0-9.-]{1,253}$/.test(config.host)) throw new Error('Enter a valid host name or IP address.');
  if (!config.username || !/^[a-zA-Z0-9._-]{1,64}$/.test(config.username)) throw new Error('Enter a valid SSH username.');
  for (const [label, value] of [['SSH port', port], ['remote API port', remoteApiPort], ['local forwarded port', localForwardPort]]) {
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${label} must be between 1 and 65535.`);
  }
  const knownHosts = path.join(app.getPath('home'), '.ssh', 'known_hosts');
  const args = [
    '-N',
    '-T',
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'UpdateHostKeys=no',
    '-o', `UserKnownHostsFile=${knownHosts}`,
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-p', String(port),
    '-L', `127.0.0.1:${localForwardPort}:127.0.0.1:${remoteApiPort}`
  ];
  if (config.keyFile) args.push('-i', path.resolve(config.keyFile));
  args.push(`${config.username}@${config.host}`);
  return args;
}

async function stopSshTunnel() {
  if (!sshProcess) {
    sshState = { status: 'disconnected', message: 'No SSH tunnel is active.' };
    return sshState;
  }
  const processToStop = sshProcess;
  sshProcess = null;
  processToStop.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (!processToStop.killed) processToStop.kill('SIGKILL');
  sshState = { status: 'disconnected', message: 'SSH tunnel stopped.' };
  mainWindow?.webContents.send('ssh:state', sshState);
  return sshState;
}

async function startSshTunnel(config) {
  await stopSshTunnel();
  const args = sshArguments(config);
  sshState = { status: 'connecting', message: 'Starting an SSH tunnel with strict host-key verification.' };
  mainWindow?.webContents.send('ssh:state', sshState);
  return new Promise((resolve, reject) => {
    const child = spawn('ssh.exe', args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], shell: false });
    sshProcess = child;
    let errorText = '';
    const readyTimer = setTimeout(() => {
      if (sshProcess !== child) return;
      sshState = { status: 'connected', message: `Tunnel ready on 127.0.0.1:${config.localForwardPort}.` };
      mainWindow?.webContents.send('ssh:state', sshState);
      resolve(sshState);
    }, 900);
    child.stderr.on('data', (chunk) => { errorText = `${errorText}${chunk.toString('utf8')}`.slice(-2000); });
    child.once('error', (error) => {
      clearTimeout(readyTimer);
      sshProcess = null;
      sshState = { status: 'error', message: error.code === 'ENOENT' ? 'OpenSSH client was not found on this computer.' : error.message };
      mainWindow?.webContents.send('ssh:state', sshState);
      reject(new Error(sshState.message));
    });
    child.once('exit', (code) => {
      clearTimeout(readyTimer);
      if (sshProcess === child) sshProcess = null;
      if (sshState.status === 'connecting') {
        const detail = errorText.trim().split(/\r?\n/).slice(-1)[0] || `ssh.exe exited with code ${code}.`;
        sshState = { status: 'error', message: `SSH tunnel could not start: ${detail}` };
        reject(new Error(sshState.message));
      } else if (sshState.status === 'connected') {
        sshState = { status: 'disconnected', message: `SSH tunnel closed with code ${code}.` };
      }
      mainWindow?.webContents.send('ssh:state', sshState);
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#101415',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('state:read', readState);
ipcMain.handle('state:write', (_event, state) => writeState(state));
ipcMain.handle('secret:setApiKey', (_event, value) => storeApiKey(String(value || '')));
ipcMain.handle('secret:hasApiKey', async () => Boolean(await readApiKey()));
ipcMain.handle('file:chooseKey', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Choose an SSH private key', properties: ['openFile'], filters: [{ name: 'Private keys', extensions: ['pem', 'key', 'ppk'] }, { name: 'All files', extensions: ['*'] }] });
  return result.canceled ? '' : result.filePaths[0];
});
ipcMain.handle('file:export', async (_event, { suggestedName, content }) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: suggestedName, properties: ['createDirectory', 'showOverwriteConfirmation'] });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, content, 'utf8');
  return { canceled: false, filePath: result.filePath };
});
ipcMain.handle('server:request', (_event, request) => apiRequest(request.serverUrl, request.endpoint, request));
ipcMain.handle('ssh:start', (_event, config) => startSshTunnel(config));
ipcMain.handle('ssh:stop', stopSshTunnel);
ipcMain.handle('ssh:state', () => sshState);

app.whenReady().then(createWindow);
app.on('before-quit', () => { if (sshProcess) sshProcess.kill('SIGTERM'); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
