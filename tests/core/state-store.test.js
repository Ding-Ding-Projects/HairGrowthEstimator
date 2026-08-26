'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { atomicWriteJson } = require('../../app/core/atomic');
const { createDefaultState, validateState } = require('../../app/core/state');
const { StateStore, drainStateAndHistory } = require('../../app/core/state-store');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('state writes serialize and reject a stale candidate against the authoritative revision', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-state-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'state.json');
  const writeStarted = deferred();
  const releaseWrite = deferred();
  let writeCount = 0;
  const history = { record: async () => ({ recorded: true, commit: 'a'.repeat(40) }), flush: async () => {} };
  const store = new StateStore({
    filePath,
    history,
    today: () => '2026-08-25',
    now: () => '2026-08-25T12:00:00.000Z',
    writeJson: async (...args) => {
      writeCount += 1;
      if (writeCount === 1) {
        writeStarted.resolve();
        await releaseWrite.promise;
      }
      return atomicWriteJson(...args);
    }
  });
  const initial = await store.read();
  const firstCandidate = structuredClone(initial);
  firstCandidate.settings.displayName = 'First serialized value';
  const staleCandidate = structuredClone(initial);
  staleCandidate.settings.displayName = 'Stale value';

  const firstWrite = store.write(firstCandidate, 'First write');
  await writeStarted.promise;
  const staleWrite = store.write(staleCandidate, 'Stale write');
  releaseWrite.resolve();

  const firstResult = await firstWrite;
  assert.equal(firstResult.state.revision, 1);
  await assert.rejects(staleWrite, (error) => error?.code === 'ERR_STALE_STATE');
  const persisted = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(persisted.revision, 1);
  assert.equal(persisted.settings.displayName, 'First serialized value');

  const freshCandidate = structuredClone(firstResult.state);
  freshCandidate.settings.displayName = 'Second serialized value';
  const secondResult = await store.write(freshCandidate, 'Second write');
  assert.equal(secondResult.state.revision, 2);
  assert.equal((await store.read()).settings.displayName, 'Second serialized value');
});

test('a local-history failure degrades explicitly after the primary state save', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-state-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'state.json');
  let historyFlushes = 0;
  const history = {
    record: async () => { throw new Error('injected history failure'); },
    flush: async () => { historyFlushes += 1; }
  };
  const store = new StateStore({
    filePath,
    history,
    today: () => '2026-08-25',
    now: () => '2026-08-25T12:00:00.000Z'
  });
  const candidate = createDefaultState('2026-08-25');
  candidate.settings.displayName = 'Saved despite history failure';
  const result = await store.write(candidate, 'History failure boundary');

  assert.equal(result.history.status, 'degraded');
  assert.match(result.history.message, /injected history failure/);
  const persisted = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(persisted.settings.displayName, 'Saved despite history failure');
  await store.flush();
  assert.equal(historyFlushes, 1);
});

test('orderly drain waits for state work before the history queue', async () => {
  const calls = [];
  await drainStateAndHistory(
    { flush: async () => { calls.push('state'); } },
    { flush: async () => { calls.push('history'); } }
  );
  assert.deepEqual(calls, ['state', 'history']);
});

test('state validation preserves authoritative revision and reconciles the retained fallback', () => {
  const state = createDefaultState('2026-08-25');
  state.revision = 7;
  state.manualBaseline = { baselineDate: '2026-01-15', baselineLengthCm: 1.5 };
  state.haircuts = [
    { id: 'cut-older-one', date: '2026-04-01', preCutLengthCm: 5, postCutLengthCm: 2, note: '' },
    { id: 'cut-newer-one', date: '2026-07-01', preCutLengthCm: 6, postCutLengthCm: 0.7, note: '' }
  ];
  const validated = validateState(state, '2026-08-25');
  assert.equal(validated.revision, 7);
  assert.equal(validated.profile.baselineDate, '2026-07-01');
  assert.equal(validated.profile.baselineLengthCm, 0.7);
  assert.deepEqual(validated.manualBaseline, state.manualBaseline);
  assert.equal(validateState(validated, '2026-08-25').revision, 7);
});
