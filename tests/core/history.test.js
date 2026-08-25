'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LocalHistory } = require('../../app/core/history');

const ACCESS = Object.freeze({ value: 'credential-never-returned' });

function authorizedHistory(directory, operations = []) {
  return new LocalHistory(directory, {
    authenticate: async ({ operation, credential }) => {
      operations.push(operation);
      return credential === ACCESS;
    }
  });
}

test('local history records append-only commits and reads the independent Git artifact', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-history-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const history = authorizedHistory(directory);
  const first = await history.record('Created profile', { profile: { baselineLengthCm: 1 } });
  const second = await history.record('Updated profile', { profile: { baselineLengthCm: 2 } });
  assert.equal(first.recorded, true);
  assert.equal(second.recorded, true);
  assert.notEqual(first.commit, second.commit);
  const list = await history.list({ credential: ACCESS });
  assert.equal(list[0].subject, 'Updated local history state');
  const snapshot = await history.read(second.commit, { credential: ACCESS });
  assert.equal(snapshot.state.profile.baselineLengthCm, 2);
});

test('unchanged local history state does not create a fake revision', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-history-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const history = new LocalHistory(directory);
  await history.record('Created profile', { profile: { baselineLengthCm: 1 } });
  const unchanged = await history.record('Pretend change', { profile: { baselineLengthCm: 1 } });
  assert.equal(unchanged.recorded, false);
  assert.equal(unchanged.reason, 'unchanged');
});

test('an explicit restore event appends even when the redacted state already matches', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-history-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const history = authorizedHistory(directory);
  const state = { profile: { baselineLengthCm: 1 } };
  await history.record('Created profile', state);
  const restored = await history.record('Restored local history revision', state);
  assert.equal(restored.recorded, true);
  const entries = await history.list({ credential: ACCESS, limit: 10 });
  assert.equal(entries[0].action, 'restored');
});

test('history flush waits for the complete queued record operation', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-history-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const history = authorizedHistory(directory);
  const originalEnsure = history.ensure.bind(history);
  let releaseEnsure;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const blocked = new Promise((resolve) => { releaseEnsure = resolve; });
  history.ensure = async () => {
    markStarted();
    await blocked;
    return originalEnsure();
  };

  const record = history.record('Queued profile change', { profile: { baselineLengthCm: 3 } });
  await started;
  let flushed = false;
  const flush = history.flush().then(() => { flushed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flushed, false);
  releaseEnsure();
  await Promise.all([record, flush]);
  assert.equal(flushed, true);
});

test('protected history listing filters by date, action, and text', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-history-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const operations = [];
  const history = authorizedHistory(directory, operations);
  await history.record('Recorded haircut 2026-08-25', { profile: { baselineLengthCm: 1 } });
  await history.record('Updated haircut journal', { profile: { baselineLengthCm: 2 } });
  await history.record('Notification history records deleted', { profile: { baselineLengthCm: 3 } });

  const created = await history.list({
    credential: ACCESS,
    from: '2000-01-01',
    to: '2999-12-31',
    actions: ['created'],
    query: 'baselineLengthCm',
    limit: 20
  });
  assert.equal(created.length, 1);
  assert.equal(created[0].action, 'created');
  assert.equal(created[0].subject, 'Created local history state');
  assert.deepEqual(operations, ['list']);

  const future = await history.list({ credential: ACCESS, from: '2999-01-01', limit: 20 });
  assert.deepEqual(future, []);
});

test('protected operations require an explicit successful authentication callback', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-history-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const history = new LocalHistory(directory);
  const first = await history.record('Created profile', { profile: { baselineLengthCm: 1 } });
  const second = await history.record('Updated profile', { profile: { baselineLengthCm: 2 } });

  await assert.rejects(history.list({ credential: ACCESS }), /authentication is required/i);
  await assert.rejects(history.read(first.commit, { credential: ACCESS }), /authentication is required/i);
  await assert.rejects(history.diff(first.commit, second.commit, { credential: ACCESS }), /authentication is required/i);
  await assert.rejects(history.restore(first.commit, { credential: ACCESS }), /authentication is required/i);
  await assert.rejects(history.label(first.commit, 'First length', { credential: ACCESS }), /authentication is required/i);
  await assert.rejects(history.prune({ credential: ACCESS, maxEntries: 2 }), /authentication is required/i);
  await assert.rejects(history.exportRedacted({ credential: ACCESS }), /authentication is required/i);
  const denied = new LocalHistory(directory, { authenticate: async () => false });
  await assert.rejects(
    denied.list({ credential: ACCESS }),
    /authentication was not accepted/i
  );
});

test('revision diff and redacted export never return stored secrets or private vocabulary data', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-history-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const history = authorizedHistory(directory);
  const first = await history.record('Created private-word', {
    profile: { baselineLengthCm: 1 },
    settings: {
      apiToken: 'raw-token-value',
      password: 'raw-password-value',
      customDataUrl: 'data:image/png;base64,raw-binary-value'
    },
    vocabulary: { loaded: true, cacheVersion: 7, mappings: { original: 'private-word' } }
  });
  const second = await history.record('Updated other-private-word', {
    profile: { baselineLengthCm: 2 },
    settings: { apiToken: 'next-token-value', password: 'next-password-value' },
    vocabulary: { loaded: true, cacheVersion: 7, mappings: { original: 'other-private-word' } }
  });

  const stored = await history.git(['show', `${second.commit}:snapshot.json`]);
  const subjects = await history.git(['log', '--format=%s']);
  const diff = await history.diff(first.commit, second.commit, { credential: ACCESS });
  assert.ok(diff.changes.some((change) => change.path === '/profile/baselineLengthCm'));
  const exported = await history.exportRedacted({ credential: ACCESS, limit: 20 });
  const serialized = JSON.stringify({ stored, subjects, diff, exported });
  for (const forbidden of [
    'raw-token-value',
    'raw-password-value',
    'raw-binary-value',
    'private-word',
    'next-token-value',
    'next-password-value',
    'other-private-word',
    ACCESS.value
  ]) {
    assert.equal(serialized.includes(forbidden), false, `leaked ${forbidden}`);
  }
  assert.deepEqual(exported.omitted, ['credentials', 'private vocabulary data', 'local-only binary assets']);
});

test('redacted export defaults to the complete bounded history inventory', async () => {
  const history = authorizedHistory(path.join(os.tmpdir(), 'unused-history-export'));
  let receivedOptions = null;
  history.ensure = async () => {};
  history.historyEntries = async (options) => {
    receivedOptions = options;
    return [];
  };

  const exported = await history.exportRedacted({ credential: ACCESS });
  assert.equal(receivedOptions.limit, 1000);
  assert.deepEqual(exported.entries, []);
});

test('restore appends a new revision and labels are searchable without rewriting the source revision', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-history-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const history = authorizedHistory(directory);
  const first = await history.record('Created profile', { profile: { baselineLengthCm: 1 } });
  await history.record('Updated profile', { profile: { baselineLengthCm: 2 } });
  const beforeRestore = await history.list({ credential: ACCESS, limit: 20 });
  const initialization = await history.git(['rev-list', '--max-parents=0', 'HEAD']);
  await assert.rejects(
    history.restore(initialization, { credential: ACCESS }),
    /does not contain restorable application state/i
  );

  const label = await history.label(first.commit, 'Before summer trim', { credential: ACCESS });
  assert.equal(label.label, 'Before summer trim');
  const found = await history.list({ credential: ACCESS, query: 'summer trim', limit: 20 });
  assert.equal(found.length, 1);
  assert.equal(found[0].commit, first.commit);

  const restored = await history.restore(first.commit, { credential: ACCESS });
  assert.equal(restored.recorded, true);
  assert.notEqual(restored.commit, first.commit);
  assert.equal(restored.state.profile.baselineLengthCm, 1);
  const afterRestore = await history.list({ credential: ACCESS, limit: 20 });
  assert.ok(afterRestore.length >= beforeRestore.length + 2);
  assert.equal(afterRestore[0].commit, restored.commit);
  assert.equal(afterRestore[0].action, 'restored');
  const original = await history.read(first.commit, { credential: ACCESS });
  assert.equal(original.state.profile.baselineLengthCm, 1);
  const committedHistory = await history.git(['log', '-p', '--all']);
  assert.equal(JSON.stringify({ label, found, restored, afterRestore, original, committedHistory }).includes(ACCESS.value), false);
});

test('bounded retention pruning keeps the newest state and makes removed revisions unreachable', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-history-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const history = authorizedHistory(directory);
  const revisions = [];
  for (let length = 1; length <= 6; length += 1) {
    revisions.push(await history.record(`Updated profile ${length}`, { profile: { baselineLengthCm: length } }));
  }

  const result = await history.prune({ credential: ACCESS, maxEntries: 3 });
  assert.ok(result.pruned >= 4);
  const remaining = await history.list({ credential: ACCESS, limit: 20 });
  assert.equal(remaining.length, 3);
  assert.equal((await history.read(remaining[0].commit, { credential: ACCESS })).state.profile.baselineLengthCm, 6);
  await assert.rejects(history.read(revisions[0].commit, { credential: ACCESS }));
  assert.equal(JSON.stringify({ result, remaining }).includes(ACCESS.value), false);
});
