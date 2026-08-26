'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');

async function source(relativePath) {
  return (await fs.readFile(path.join(repositoryRoot, relativePath), 'utf8')).replace(/\r\n/g, '\n');
}

test('main process resolves service requests from complete sync mode and live tunnel state', async () => {
  const main = await source('app/main.js');
  assert.match(main, /^const \{ buildSshArguments \} = require\('\.\/core\/ssh'\);$/m);
  assert.match(main, /^  const policy = resolveServiceSecurityContext\(request\.sync, sshState\);$/m);
  assert.match(main, /^  const url = new URL\(endpoint, policy\.baseUrl\);$/m);
  assert.doesNotMatch(main, /^  const base = validatedServerUrl\(request\.serverUrl\);$/m);
});

test('renderer validates a complete pull before assigning and sends bounded sync routing data', async () => {
  const renderer = await source('app/renderer/app.js');
  const pullStart = renderer.indexOf("$('#server-pull').addEventListener");
  const pullEnd = renderer.indexOf("$('#choose-ssh-key').addEventListener", pullStart);
  assert.ok(pullStart >= 0 && pullEnd > pullStart, 'server pull handler boundaries must exist');
  const pullHandler = renderer.slice(pullStart, pullEnd);
  const validation = pullHandler.indexOf('const candidate = Hair.preparePulledSnapshot(result);');
  const assignment = pullHandler.indexOf('state = { ...state, ...candidate };');
  assert.ok(validation >= 0 && assignment > validation, 'pulled data must validate before live assignment');
  assert.doesNotMatch(pullHandler, /state\.profile\s*=\s*result\.profile/);
  assert.doesNotMatch(pullHandler, /state\.haircuts\s*=\s*result\.haircuts/);

  const requestStart = renderer.indexOf('function serviceSyncSettings');
  const requestEnd = renderer.indexOf('async function checkOllama', requestStart);
  const requestHandler = renderer.slice(requestStart, requestEnd);
  assert.match(requestHandler, /mode: state\.settings\.sync\.mode/);
  assert.match(requestHandler, /serverUrl: state\.settings\.sync\.serverUrl/);
  assert.match(requestHandler, /ssh:\s*\{\s*host: state\.settings\.sync\.ssh\.host/);
  assert.match(requestHandler, /remoteApiPort: state\.settings\.sync\.ssh\.remoteApiPort/);
  assert.match(requestHandler, /localForwardPort: state\.settings\.sync\.ssh\.localForwardPort/);
  assert.match(requestHandler, /sync: serviceSyncSettings\(\)/);
  assert.doesNotMatch(requestHandler, /bridge\.server\.request\(\{ serverUrl:/);
});

test('every haircut mutation path invokes pure baseline reconciliation', async () => {
  const renderer = await source('app/renderer/app.js');
  assert.match(renderer, /state\.haircuts = Hair\.sortHaircutsNewest\(state\.haircuts\.filter/);
  assert.match(renderer, /const nextHaircuts = existing >= 0/);
  const reconciliationCalls = renderer.match(/state\.profile = Hair\.reconcileBaseline\(/g) || [];
  assert.ok(reconciliationCalls.length >= 3, `expected at least 3 live reconciliation calls, received ${reconciliationCalls.length}`);
  assert.match(renderer, /state\.manualBaseline = Hair\.manualBaselineFromProfile\(requestedProfile\)/);
});

test('main process drains serialized state and local history before orderly quit', async () => {
  const main = await source('app/main.js');
  assert.match(main, /^  stateStore = new StateStore\(\{$/m);
  assert.match(main, /^    \.then\(\(\) => drainStateAndHistory\(stateStore, localHistory\)\)$/m);
  assert.match(main, /^    \.then\(\(\) => stopSshTunnel\(\)\)$/m);
  assert.match(main, /^      shutdownReady = true;$/m);
  assert.match(main, /^      app\.quit\(\);$/m);
});

test('renderer surfaces explicit local-history degradation without invalidating the primary save', async () => {
  const renderer = await source('app/renderer/app.js');
  assert.match(renderer, /^    bridge\.history\.onError\(\(value\) => notify\('Local history degraded', `\$\{value\.message\} The primary state save remains valid\.`, 'warning', false\)\);$/m);
});

test('history restore saves primary state before reporting the appended history revision', async () => {
  const main = await source('app/main.js');
  const start = main.indexOf("registerIpcHandler('history:restore'");
  const end = main.indexOf("registerIpcHandler('history:label'", start);
  assert.ok(start >= 0 && end > start, 'history restore handler boundaries must exist');
  const handler = main.slice(start, end);
  const read = handler.indexOf('localHistory.read(commit, { credential })');
  const save = handler.indexOf("writeStateWithHistory(restored, 'Restored local history revision')");
  assert.ok(read >= 0 && save > read, 'restored state must be read and then persisted through the authoritative state queue');
  assert.doesNotMatch(handler, /localHistory\.restore\(/);
  assert.match(handler, /recorded: result\.history\.recorded/);
});
