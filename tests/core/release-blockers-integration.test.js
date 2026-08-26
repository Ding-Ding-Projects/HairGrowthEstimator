'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const main = fs.readFileSync(path.join(root, 'app', 'main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'app', 'renderer', 'app.js'), 'utf8');

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist.`);
  const parametersOpen = source.indexOf('(', start);
  let parameterDepth = 0;
  let parametersClose = -1;
  for (let index = parametersOpen; index < source.length; index += 1) {
    if (source[index] === '(') parameterDepth += 1;
    if (source[index] === ')') {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        parametersClose = index;
        break;
      }
    }
  }
  assert.notEqual(parametersClose, -1, `${name} must have balanced parameters.`);
  const open = source.indexOf('{', parametersClose);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`${name} must have a balanced function body.`);
}

test('one centralized wrapper authorizes every registered IPC channel', () => {
  assert.match(main, /require\('\.\/core\/ipc-authorization'\)/);
  assert.match(main, /^function registerIpcHandler\(channel, handler\) \{/m);
  assert.equal((main.match(/ipcMain\.handle\(/g) || []).length, 1, 'Only the centralized wrapper may call ipcMain.handle.');
  const registerBody = functionBody(main, 'registerIpc');
  assert.equal((registerBody.match(/registerIpcHandler\('/g) || []).length, 53, 'All 53 exact channels must use the wrapper.');
  assert.doesNotMatch(registerBody, /assertTrustedIpcSender\(/, 'Per-handler authorization may not drift from the wrapper.');
});

test('shared record degradation retains the last valid effective restriction', () => {
  assert.match(main, /lastValidSchoolEffectiveState/);
  assert.match(main, /reconcileSchoolRecordRead/);
  const readBody = functionBody(main, 'readSchoolRecord');
  assert.doesNotMatch(readBody, /status: 'invalid'.*defaultSchoolRecord/s);
  assert.doesNotMatch(readBody, /status: 'unavailable'.*defaultSchoolRecord/s);
  assert.match(readBody, /degraded/);
});

test('renderer restores restricted preferences only for a verified disable transition', () => {
  const transitionBody = functionBody(renderer, 'applySchoolRecordTransition');
  assert.match(transitionBody, /verifiedDisable/);
  assert.doesNotMatch(transitionBody, /if \(wasEnabled && !isEnabled\) restoreSchoolPreferences\(\)/);
  assert.match(transitionBody, /wasEnabled && !isEnabled && .*verifiedDisable/);
});

test('scheduled external requests use a DNS-pinned privileged transport', () => {
  assert.match(main, /require\('\.\/core\/network-policy'\)/);
  assert.match(main, /require\('node:dns\/promises'\)/);
  assert.match(main, /^async function secureScheduledRequest\(/m);
  const requestBody = functionBody(main, 'secureScheduledRequest');
  assert.match(requestBody, /resolveAndAuthorizeNetworkPlan/);
  assert.match(requestBody, /credentialBinding/);
  const transportBody = functionBody(main, 'requestJsonThroughPinnedPlan');
  assert.match(transportBody, /lookup: NetworkPolicy\.createPinnedLookup\(plan\)/);
  assert.match(transportBody, /rejectUnauthorized: true/);
  assert.match(transportBody, /servername:/);
  assert.match(transportBody, /statusCode >= 300 && statusCode < 400/);
  assert.match(transportBody, /socket\.remoteAddress/);
  const approvalBody = functionBody(main, 'approveHomeAssistantPrivateLanSource');
  assert.match(approvalBody, /dialog\.showMessageBox/);
  assert.match(approvalBody, /scheduledNetworkApprovals\.set\(/);
  assert.match(approvalBody, /resolveAndAuthorizeNetworkPlan\(rule\)/);
  const tokenBody = functionBody(main, 'setHomeAssistantScheduleToken');
  assert.match(tokenBody, /approveHomeAssistantPrivateLanSource\(rule\)/);
  assert.match(main, /scheduled-network-approvals\.json/);
  const resolveBody = functionBody(main, 'resolveScheduledSource');
  assert.match(resolveBody, /secureScheduledRequest\(/);
  assert.doesNotMatch(resolveBody, /boundedFetch\(/);
});
