'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { LocalHistory } = require('../../app/core/history');

test('local history records append-only commits and reads the independent Git artifact', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-history-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const history = new LocalHistory(directory);
  const first = await history.record('Created profile', { profile: { baselineLengthCm: 1 } });
  const second = await history.record('Updated profile', { profile: { baselineLengthCm: 2 } });
  assert.equal(first.recorded, true);
  assert.equal(second.recorded, true);
  assert.notEqual(first.commit, second.commit);
  const list = await history.list();
  assert.equal(list[0].subject, 'Updated profile');
  const snapshot = await history.read(second.commit);
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
