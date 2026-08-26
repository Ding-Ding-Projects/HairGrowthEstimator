'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('service requests derive transport and credential scope in the main process', () => {
  const main = read('app', 'main.js');
  const preload = read('app', 'preload.js');
  const vault = read('app', 'core', 'vault.js');

  assert.match(main, /resolveServiceSecurityContext\(request\.sync, sshState\)/);
  assert.match(main, /isPublicServiceEndpoint\(endpoint\)/);
  assert.match(main, /localVault\.apiKeyForScope\(policy\.credentialScope\)/);
  assert.match(main, /createServiceCredentialRecord\(policy, apiKey\)/);
  assert.match(main, /serviceCredentialHeaders\(policy, endpoint, credential\)/);
  assert.match(main, /secret:setApiKey[\s\S]{0,500}setApiKeyForScope\(policy\.credentialScope, value\)/);
  assert.match(preload, /setApiKey:\s*\(sync, value\)\s*=>\s*ipcRenderer\.invoke\('secret:setApiKey',\s*\{ sync, value \}\)/);
  assert.match(vault, /apiKeys:\s*\{\}/);
  assert.match(vault, /async setApiKeyForScope\(scope, value\)/);
  assert.match(vault, /async apiKeyForScope\(scope\)/);
  assert.doesNotMatch(main, /localVault\.apiKey\(\)/);
});

test('public probes cannot receive a service credential header', () => {
  const main = read('app', 'main.js');
  const requestStart = main.indexOf('async function apiRequest');
  const requestEnd = main.indexOf('\nfunction sendSshState', requestStart);
  assert.ok(requestStart >= 0 && requestEnd > requestStart, 'apiRequest source boundary is missing');
  const apiRequest = main.slice(requestStart, requestEnd);

  assert.match(apiRequest, /const apiKey = isPublicServiceEndpoint\(endpoint\)\s*\?\s*''\s*:\s*await localVault\.apiKeyForScope\(policy\.credentialScope\)/);
  assert.match(apiRequest, /const credential = apiKey \? createServiceCredentialRecord\(policy, apiKey\) : null/);
  assert.match(apiRequest, /\.\.\.serviceCredentialHeaders\(policy, endpoint, credential\)/);
  assert.doesNotMatch(apiRequest, /headers:\s*\{[\s\S]{0,300}'x-api-key'/);
});

test('updater feed selection and restart authority stay in the trusted main frame', () => {
  const main = read('app', 'main.js');
  const preload = read('app', 'preload.js');
  const renderer = read('app', 'renderer', 'app.js');
  const state = read('app', 'core', 'state.js');

  assert.match(main, /assertTrustedIpcSender\(event\)/);
  assert.match(main, /registerIpcHandler\('update:check', \(\) => checkForUpdates\(\)\)/);
  assert.match(main, /registerIpcHandler\('update:restart', \(\) => restartVerifiedUpdate\(\)\)/);
  assert.match(main, /autoUpdater\.setFeedURL\(\{ url: CANONICAL_UPDATE_FEED_URL \}\)/);
  assert.match(main, /const ready = updateAuthorization\.snapshot\(\)\.ready/);
  assert.match(main, /updateAuthorization\.consumeRestart\(ready\)/);
  assert.match(main, /createObservedDownloadedUpdate\(\{/);
  assert.match(preload, /check:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('update:check'\)/);
  assert.match(renderer, /bridge\.updates\.check\(\)/);
  assert.doesNotMatch(renderer, /settings\.updateFeedUrl/);
  assert.doesNotMatch(state, /updateFeedUrl/);
  assert.doesNotMatch(main, /checkForUpdates\(feedUrl\)/);
  assert.doesNotMatch(main, /ipcMain\.handle\('update:restart',\s*\(\)\s*=>\s*autoUpdater\.quitAndInstall\(\)\)/);
});

test('all renderer search regex and workbench evaluation crosses the killable worker bridge', () => {
  const main = read('app', 'main.js');
  const preload = read('app', 'preload.js');
  const renderer = read('app', 'renderer', 'app.js');

  assert.match(main, /registerIpcHandler\('regex:evaluate',[\s\S]{0,500}regexScheduler\.schedule/);
  assert.match(preload, /regex:\s*Object\.freeze\(\{\s*evaluate:\s*async \(envelope\)/);
  assert.match(renderer, /async function filterBySearch\(input, candidates,/);
  assert.match(renderer, /bridge\.regex\.evaluate\(regexScheduleEnvelope\(\{\s*operation:\s*'filter'/);
  assert.match(renderer, /async function runRegexWorkbench\(\)/);
  assert.match(renderer, /bridge\.regex\.evaluate\(regexScheduleEnvelope\(\{ operation: 'workbench'/);
  assert.match(renderer, /bridge\.regex\.evaluate\(regexScheduleEnvelope\(\{ operation: 'validate'/);
  assert.doesNotMatch(renderer, /function matcherFor\(/);
  assert.doesNotMatch(renderer, /function matchesSearch\(/);

  const requiredSearchBoundaries = [
    ['haircuts', /filterBySearch\(\$\('#haircut-search'\), state\.haircuts/],
    ['command palette', /filterBySearch\(input, entries, \(entry\) =>/],
    ['converter adapters', /filterBySearch\(\$\('input', search\), category\.adapters/],
    ['offline documentation', /const available = filterSchoolRestrictedContent\(docs\);[\s\S]{0,200}filterBySearch\(\$\('#docs-search'\), available/],
    ['changelog', /filterBySearch\(\$\('#changelog-search'\), dated/],
    ['local history', /filterBySearch\(search, filteredHistoryItems/],
    ['notifications', /filterBySearch\(\$\('#notification-search'\), state\.notifications/],
    ['support tickets', /filterBySearch\(\$\('#support-search'\), statusCandidates/],
    ['tab strip', /filterBySearch\(input, tabs, \(tab\) =>/],
    ['settings', /filterBySearch\(input, cards, schoolSafeElementText\)/],
    ['appearance properties', /filterBySearch\(input, rows, \(row\) =>/],
    ['context menu', /filterBySearch\(input, items, \(item\) =>/]
  ];
  for (const [name, boundary] of requiredSearchBoundaries) {
    assert.match(renderer, boundary, `${name} search must use the bounded worker-aware filter`);
  }

  const searchStart = renderer.indexOf('async function filterBySearch');
  const searchEnd = renderer.indexOf('\n  function openRegexBuilder', searchStart);
  assert.ok(searchStart >= 0 && searchEnd > searchStart, 'filterBySearch source boundary is missing');
  assert.doesNotMatch(renderer.slice(searchStart, searchEnd), /new RegExp\(/);

  const workbenchStart = renderer.indexOf('async function runRegexWorkbench');
  const workbenchEnd = renderer.indexOf('\n  function renderConverter', workbenchStart);
  assert.ok(workbenchStart >= 0 && workbenchEnd > workbenchStart, 'workbench source boundary is missing');
  assert.doesNotMatch(renderer.slice(workbenchStart, workbenchEnd), /new RegExp\(|\.matchAll\(|\.replace\(expression/);

  const constructors = renderer.match(/new RegExp\(/g) || [];
  assert.equal(constructors.length, 1, 'only the fixed personal-vocabulary replacement constructor may remain');
  assert.match(renderer, /const pattern = new RegExp\(keys\.map\(escapeVocabularyPattern\)\.join\('\|'\), 'g'\)/);
  assert.match(renderer, /deadlineMs:\s*250/);
});
