'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const main = fs.readFileSync(path.join(root, 'app', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'app', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'app', 'renderer', 'app.js'), 'utf8');

test('main owns one central regex scheduler and derives caller identity from WebContents', () => {
  assert.match(main, /const regexScheduler = createRegexScheduler\(/);
  assert.match(main, /registerIpcHandler\('regex:evaluate', \(event, envelope\) => regexScheduler\.schedule\(\{/);
  assert.match(main, /ownerId: `web-contents:\$\{event\.sender\.id\}`/);
  assert.match(main, /coalescingKey: envelope\.coalescingKey/);
  assert.match(main, /generation: envelope\.generation/);
  assert.match(main, /request: envelope\.request/);
  assert.doesNotMatch(main, /evaluateRegexInWorker\(request\)/);
  assert.match(main, /regexScheduler\.releaseOwner\(/);
});

test('preload accepts only a scheduling envelope and unwraps explicit scheduler outcomes', () => {
  assert.match(preload, /evaluate: async \(envelope\) => \{/);
  assert.match(preload, /ipcRenderer\.invoke\('regex:evaluate', envelope\)/);
  assert.match(preload, /outcome\.ok === true/);
  assert.match(preload, /outcome\.error\.code/);
  assert.doesNotMatch(preload, /evaluate: \(request\) => ipcRenderer\.invoke\('regex:evaluate', request\)/);
});

test('every renderer regex route supplies a stable coalescing key and monotonic generation', () => {
  assert.match(renderer, /function regexScheduleEnvelope\(request, coalescingKey, generation\)/);
  assert.match(renderer, /bridge\.regex\.evaluate\(regexScheduleEnvelope\(\{\s*operation: 'filter'/);
  assert.match(renderer, /search:\$\{stableRegexTargetId\(input\)\}/);
  assert.match(renderer, /bridge\.regex\.evaluate\(regexScheduleEnvelope\(\{ operation: 'validate'/);
  assert.match(renderer, /builder:\$\{stableRegexTargetId\(input\)\}/);
  assert.match(renderer, /bridge\.regex\.evaluate\(regexScheduleEnvelope\(\{ operation: 'workbench'/);
  assert.match(renderer, /'workbench:primary'/);
});
