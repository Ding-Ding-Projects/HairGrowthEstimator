'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');

test('hand-written universal inventory is complete and every non-implemented row names its gap', async () => {
  const module = await import(pathToFileURL(path.join(root, 'scripts', 'core', 'check-universal-inventory.mjs')).href);
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'core', 'universal-feature-inventory.json'), 'utf8'));
  const result = module.validateInventory(inventory);
  assert.ok(result.rows >= 45);
  assert.ok(result.implemented > 10);
  assert.ok(result.gaps > 0, 'Yum Tong gaps must remain explicit instead of being hidden.');
});

test('inventory negative regression turns red when an exact canonical row disappears', async () => {
  const module = await import(pathToFileURL(path.join(root, 'scripts', 'core', 'check-universal-inventory.mjs')).href);
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'core', 'universal-feature-inventory.json'), 'utf8'));
  inventory.features = inventory.features.filter((item) => item.id !== 'front-screen-provenance');
  assert.throws(() => module.validateInventory(inventory), /front-screen-provenance/);
});

test('inventory negative regression turns red when a referenced test file disappears', async () => {
  const module = await import(pathToFileURL(path.join(root, 'scripts', 'core', 'check-universal-inventory.mjs')).href);
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'core', 'universal-feature-inventory.json'), 'utf8'));
  const feature = inventory.features.find((item) => item.id === 'animated-real-image-progression');
  feature.tests = ['tests/core/removed-image-test.js'];
  assert.throws(() => module.validateInventory(inventory), /Inventory test file is missing for animated-real-image-progression/);
});

test('renderer registers the canonical interactive surfaces at exact boundaries', () => {
  const html = fs.readFileSync(path.join(root, 'app', 'renderer', 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'app', 'renderer', 'app.js'), 'utf8');
  const requiredHtmlIds = [
    'front-provenance', 'tab-strip', 'growth-portrait', 'profile-form', 'haircut-form', 'regex-workbench',
    'file-converter', 'authenticator', 'server-sync', 'ssh-tunnel', 'ollama-manager', 'command-palette',
    'context-menu', 'regex-popover', 'appearance-dialog', 'lock-dialog', 'unlock-dialog', 'support-dialog',
    'super-confirm-dialog', 'notification-dialog'
  ];
  for (const id of requiredHtmlIds) assert.match(html, new RegExp(`id="${id}"`), `missing exact renderer ID ${id}`);
  assert.match(script, /^\s*function ensureElementIds\(\)/m);
  assert.match(script, /^\s*function openRegexBuilder\(trigger\)/m);
  assert.match(script, /^\s*function openSuperConfirm\(title, description, action\)/m);
  assert.match(script, /event\.ctrlKey && event\.shiftKey && event\.key\.toLowerCase\(\) === 'f'/);
});

test('renderer negative regression detects an absent front-screen provenance boundary', () => {
  const html = fs.readFileSync(path.join(root, 'app', 'renderer', 'index.html'), 'utf8');
  const frontProvenanceSection = /<section\b(?=[^>]*\sid="front-provenance"(?:\s|>))[^>]*>/;
  const broken = html.replace('id="front-provenance"', 'id="front-provenance-removed"');
  assert.doesNotMatch(broken, frontProvenanceSection);
  assert.match(html, frontProvenanceSection);
});

test('all committed search fields carry an adjacent regex trigger', () => {
  const html = fs.readFileSync(path.join(root, 'app', 'renderer', 'index.html'), 'utf8');
  const fields = [...html.matchAll(/<label class="search-field[^>]*>([\s\S]*?)<\/label>/g)];
  assert.ok(fields.length >= 8, `expected at least 8 search fields, received ${fields.length}`);
  for (const field of fields) assert.match(field[1], /class="regex-trigger"/, 'search field lacks its adjacent builder trigger');
});

test('six toy-lock policies and both PIN input routes are explicit', () => {
  const html = fs.readFileSync(path.join(root, 'app', 'renderer', 'index.html'), 'utf8');
  const policies = ['pin', 'password', 'pin+password', 'password+totp', 'pin+totp', 'password+pin+totp'];
  for (const policy of policies) assert.match(html, new RegExp(`value="${policy.replace(/[+]/g, '\\+')}"`));
  assert.match(html, /id="lock-pin"/);
  assert.match(html, /id="lock-keypad"/);
});
