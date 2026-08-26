'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

let loaded = null;
try {
  loaded = require('../../app/core/network-approvals');
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND') throw error;
}

function subject() {
  assert.ok(loaded, 'The network approval store module must exist.');
  return loaded;
}

function approval(overrides = {}) {
  return {
    canonicalSourceScope: 'api:https://settings.hair.lan:8443/v1/current?profile=work',
    origin: 'https://settings.hair.lan:8443',
    addresses: ['192.168.50.233', 'fd00::23'],
    ...overrides
  };
}

function storedApproval(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    ...approval(),
    approvedAt: '2026-08-25T12:00:00.000Z',
    ...overrides
  };
}

function documentWith(records = [storedApproval()]) {
  return { schemaVersion: 1, approvals: records };
}

async function temporaryStore(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-network-approvals-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'network-approvals.json');
  const { createNetworkApprovalStore } = subject();
  return {
    directory,
    filePath,
    store: createNetworkApprovalStore({ filePath, ...options })
  };
}

test('exports a bounded versioned approval contract', () => {
  const api = subject();
  assert.equal(api.NETWORK_APPROVAL_SCHEMA_VERSION, 1);
  assert.equal(api.MAX_NETWORK_APPROVALS, 64);
  assert.equal(api.MAX_NETWORK_APPROVAL_ADDRESSES, 16);
  assert.equal(typeof api.validateNetworkApprovalDocument, 'function');
  assert.equal(typeof api.createNetworkApprovalStore, 'function');
});

test('reads a missing approval file as an immutable empty document', async (t) => {
  const { store } = await temporaryStore(t);
  const result = await store.read();
  assert.deepEqual(result, { schemaVersion: 1, approvals: [] });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.approvals), true);
});

test('sets one exact approval through the atomic writer and persists generated provenance', async (t) => {
  const writes = [];
  const { filePath, store } = await temporaryStore(t, {
    now: () => '2026-08-25T12:00:00.000Z',
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
    writeJson: async (...args) => { writes.push(args); await require('../../app/core/atomic').atomicWriteJson(...args); }
  });
  const result = await store.set(approval());
  assert.deepEqual(result, storedApproval());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], filePath);
  assert.equal(writes[0][2].maxBytes, 64 * 1024);
  assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), documentWith());
});

test('treats the address list as a canonical set and makes identical approval idempotent', async (t) => {
  let writes = 0;
  const { store } = await temporaryStore(t, {
    now: () => '2026-08-25T12:00:00.000Z',
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
    writeJson: async (...args) => { writes += 1; await require('../../app/core/atomic').atomicWriteJson(...args); }
  });
  const first = await store.set(approval({ addresses: ['fd00::23', '192.168.50.233'] }));
  const second = await store.set(approval());
  assert.deepEqual(second, first);
  assert.deepEqual(first.addresses, ['192.168.50.233', 'fd00::23']);
  assert.equal(writes, 1);
});

test('gets an approval only through its exact scope, origin, and complete address set', async (t) => {
  const { store } = await temporaryStore(t, {
    now: () => '2026-08-25T12:00:00.000Z',
    randomUUID: () => '11111111-1111-4111-8111-111111111111'
  });
  await store.set(approval());
  assert.deepEqual(await store.get(approval({ addresses: ['fd00::23', '192.168.50.233'] })), storedApproval());
  assert.equal(await store.get(approval({
    canonicalSourceScope: 'api:https://other.hair.lan/v1/current',
    origin: 'https://other.hair.lan',
    addresses: ['192.168.50.242']
  })), null);
});

test('rejects an origin mismatch for an existing source scope', async (t) => {
  const { store } = await temporaryStore(t);
  await store.set(approval());
  await assert.rejects(
    store.get(approval({ origin: 'https://settings.hair.lan:9443' })),
    (error) => error?.code === 'ERR_NETWORK_APPROVAL_LOOKUP_MISMATCH'
  );
});

test('rejects an address mismatch for an existing source scope', async (t) => {
  const { store } = await temporaryStore(t);
  await store.set(approval());
  await assert.rejects(
    store.get(approval({ addresses: ['192.168.50.242'] })),
    (error) => error?.code === 'ERR_NETWORK_APPROVAL_LOOKUP_MISMATCH'
  );
});

test('removes only an exact approval and writes the bounded empty document', async (t) => {
  const { filePath, store } = await temporaryStore(t);
  const created = await store.set(approval());
  assert.deepEqual(await store.remove(approval()), created);
  assert.equal(await store.get(approval()), null);
  assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), documentWith([]));
});

test('rejects unknown input fields before any write', async (t) => {
  let writes = 0;
  const { store } = await temporaryStore(t, { writeJson: async () => { writes += 1; } });
  await assert.rejects(
    store.set({ ...approval(), note: 'not part of the contract' }),
    (error) => error?.code === 'ERR_NETWORK_APPROVAL_FIELDS'
  );
  assert.equal(writes, 0);
});

test('rejects duplicate, public, noncanonical, and excessive address lists', async (t) => {
  const { store } = await temporaryStore(t);
  await assert.rejects(store.set(approval({ addresses: ['192.168.50.233', '192.168.50.233'] })));
  await assert.rejects(store.set(approval({ addresses: ['8.8.8.8'] })));
  await assert.rejects(store.set(approval({ addresses: ['fd00:0000:0000:0000:0000:0000:0000:0023'] })));
  await assert.rejects(store.set(approval({ addresses: Array.from({ length: 17 }, (_, index) => `10.0.0.${index + 1}`) })));
});

test('rejects noncanonical, insecure, and overlong scope or origin values', async (t) => {
  const { store } = await temporaryStore(t);
  await assert.rejects(store.set(approval({ canonicalSourceScope: 'api:https://SETTINGS.hair.lan:8443/v1/current?profile=work' })));
  await assert.rejects(store.set(approval({ canonicalSourceScope: 'api:http://settings.hair.lan:8443/v1/current', origin: 'http://settings.hair.lan:8443' })));
  await assert.rejects(store.set(approval({ origin: 'https://settings.hair.lan:8443/' })));
  await assert.rejects(store.set(approval({ canonicalSourceScope: `api:https://settings.hair.lan/${'x'.repeat(2100)}` })));
});

test('validates Home Assistant canonical source scopes against their exact origin', async (t) => {
  const { store } = await temporaryStore(t, {
    now: () => '2026-08-25T12:00:00.000Z',
    randomUUID: () => '11111111-1111-4111-8111-111111111111'
  });
  const input = approval({
    canonicalSourceScope: 'home-assistant:https://home.hair.lan:8123/|input_boolean.hair_work_mode|home-assistant:primary',
    origin: 'https://home.hair.lan:8123',
    addresses: ['192.168.50.193']
  });
  const record = await store.set(input);
  assert.equal(record.canonicalSourceScope, input.canonicalSourceScope);
  await assert.rejects(store.set({ ...input, origin: 'https://other.hair.lan:8123' }));
});

test('rejects malformed JSON, unknown document fields, unsafe keys, and unknown versions', async (t) => {
  const { filePath, store } = await temporaryStore(t);
  for (const raw of [
    '{',
    JSON.stringify({ schemaVersion: 2, approvals: [] }),
    JSON.stringify({ schemaVersion: 1, approvals: [], extra: true }),
    '{"schemaVersion":1,"approvals":[],"__proto__":{"polluted":true}}'
  ]) {
    await fs.writeFile(filePath, raw, 'utf8');
    await assert.rejects(store.read());
  }
});

test('rejects duplicate stored scopes and an approval count above the fixed limit', () => {
  const { validateNetworkApprovalDocument, MAX_NETWORK_APPROVALS } = subject();
  assert.throws(() => validateNetworkApprovalDocument(documentWith([storedApproval(), storedApproval({ id: '22222222-2222-4222-8222-222222222222' })])));
  const many = Array.from({ length: MAX_NETWORK_APPROVALS + 1 }, (_, index) => storedApproval({
    id: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
    canonicalSourceScope: `api:https://host-${index}.hair.lan/v1/current`,
    origin: `https://host-${index}.hair.lan`,
    addresses: [`10.0.0.${(index % 250) + 1}`]
  }));
  assert.throws(() => validateNetworkApprovalDocument(documentWith(many)));
});

test('rejects malformed stored identifiers and timestamps', () => {
  const { validateNetworkApprovalDocument } = subject();
  assert.throws(() => validateNetworkApprovalDocument(documentWith([storedApproval({ id: 'not-a-uuid' })])));
  assert.throws(() => validateNetworkApprovalDocument(documentWith([storedApproval({ approvedAt: '2026-08-25' })])));
});

test('preserves the last valid file when a later atomic write fails', async (t) => {
  const setup = await temporaryStore(t, {
    now: () => '2026-08-25T12:00:00.000Z',
    randomUUID: () => '11111111-1111-4111-8111-111111111111'
  });
  await setup.store.set(approval());
  const before = await fs.readFile(setup.filePath, 'utf8');
  const { createNetworkApprovalStore } = subject();
  const failing = createNetworkApprovalStore({
    filePath: setup.filePath,
    writeJson: async () => { throw Object.assign(new Error('injected write failure'), { code: 'EIO' }); }
  });
  await assert.rejects(failing.set(approval({
    canonicalSourceScope: 'api:https://other.hair.lan/v1/current',
    origin: 'https://other.hair.lan',
    addresses: ['192.168.50.242']
  })), (error) => error?.code === 'EIO');
  assert.equal(await fs.readFile(setup.filePath, 'utf8'), before);
});

test('returns only the bounded main-process store surface', async (t) => {
  const { store } = await temporaryStore(t);
  assert.deepEqual(Object.keys(store).sort(), ['get', 'read', 'remove', 'set']);
  assert.equal('export' in store, false);
  assert.equal('logger' in store, false);
});
