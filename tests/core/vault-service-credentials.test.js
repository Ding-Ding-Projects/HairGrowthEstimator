'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { LocalVault } = require('../../app/core/vault');

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value, 'utf8'),
  decryptString: (value) => Buffer.from(value).toString('utf8')
};

async function createVault(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-vault-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'credentials.bin');
  return { filePath, vault: new LocalVault({ filePath, safeStorage }) };
}

test('service API keys are isolated by their exact canonical scope', async (t) => {
  const { vault } = await createVault(t);
  const firstKey = 'a'.repeat(24);
  const secondKey = 'b'.repeat(24);

  await vault.setApiKeyForScope('https://first.example', firstKey);
  await vault.setApiKeyForScope('https://second.example:8443', secondKey);

  assert.equal(await vault.apiKeyForScope('https://first.example'), firstKey);
  assert.equal(await vault.apiKeyForScope('https://second.example:8443'), secondKey);
  assert.equal(await vault.apiKeyForScope('https://third.example'), '');
  assert.equal(await vault.hasApiKeyForScope('https://first.example'), true);

  await vault.setApiKeyForScope('https://first.example', '');
  assert.equal(await vault.apiKeyForScope('https://first.example'), '');
  assert.equal(await vault.apiKeyForScope('https://second.example:8443'), secondKey);
});

test('a legacy global API key is discarded instead of being sent to a new origin', async (t) => {
  const { filePath, vault } = await createVault(t);
  const legacy = {
    schemaVersion: 1,
    apiKey: 'legacy-key-that-must-not-migrate',
    locks: {},
    authenticators: {},
    historyAccess: null
  };
  await fs.writeFile(filePath, safeStorage.encryptString(JSON.stringify(legacy)));

  assert.equal(await vault.apiKeyForScope('https://first.example'), '');
  const value = await vault.read();
  assert.equal(value.schemaVersion, 3);
  assert.deepEqual(value.apiKeys, {});
  assert.deepEqual(value.externalSettingTokens, {});
  assert.equal(Object.hasOwn(value, 'apiKey'), false);
});

test('external setting access tokens stay bound to their exact canonical source scope', async (t) => {
  const { vault } = await createVault(t);
  const first = 'first-local-access-value';
  const second = 'second-local-access-value';

  await vault.setExternalSettingToken('home-assistant:https://one.example/|input_boolean.mode|home-assistant-primary', first);
  await vault.setExternalSettingToken('home-assistant:https://two.example/|input_boolean.mode|home-assistant-primary', second);

  assert.equal(await vault.externalSettingToken('home-assistant:https://one.example/|input_boolean.mode|home-assistant-primary'), first);
  assert.equal(await vault.externalSettingToken('home-assistant:https://two.example/|input_boolean.mode|home-assistant-primary'), second);
  assert.equal(await vault.hasExternalSettingToken('home-assistant:https://three.example/|input_boolean.mode|home-assistant-primary'), false);

  await vault.setExternalSettingToken('home-assistant:https://one.example/|input_boolean.mode|home-assistant-primary', '');
  assert.equal(await vault.hasExternalSettingToken('home-assistant:https://one.example/|input_boolean.mode|home-assistant-primary'), false);
  assert.equal(await vault.externalSettingToken('home-assistant:https://two.example/|input_boolean.mode|home-assistant-primary'), second);
});

test('external setting access tokens are bounded and control characters are rejected', async (t) => {
  const { vault } = await createVault(t);
  const scope = 'home-assistant:https://one.example/|input_boolean.mode|home-assistant-primary';
  await assert.rejects(vault.setExternalSettingToken(scope, 'short'), /16 to 2048/);
  await assert.rejects(vault.setExternalSettingToken(scope, 'x'.repeat(2049)), /16 to 2048/);
  await assert.rejects(vault.setExternalSettingToken(scope, `${'x'.repeat(16)}\n`), /control characters/);
});

test('credential scopes and key values are bounded before persistence', async (t) => {
  const { vault } = await createVault(t);

  await assert.rejects(vault.setApiKeyForScope('', 'a'.repeat(24)), /scope/i);
  await assert.rejects(vault.setApiKeyForScope('__proto__', 'a'.repeat(24)), /scope/i);
  await assert.rejects(vault.setApiKeyForScope('x'.repeat(2049), 'a'.repeat(24)), /scope/i);
  await assert.rejects(vault.setApiKeyForScope('https://first.example', 'short'), /24 to 512/);
  await assert.rejects(vault.setApiKeyForScope('https://first.example', 'x'.repeat(513)), /24 to 512/);
  await assert.rejects(vault.setApiKeyForScope('https://first.example', `${'x'.repeat(24)}\n`), /control characters/);
});
