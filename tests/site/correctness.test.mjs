import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

async function loadContract() {
  const source = await readFile(join(root, 'site', 'state-contract.js'), 'utf8');
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    structuredClone
  });
  vm.runInContext(source, context, { filename: 'state-contract.js' });
  assert.ok(context.HairGrowthStateContract, 'state contract must be exposed to the browser');
  return context.HairGrowthStateContract;
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function createExclusiveLocks() {
  let queue = Promise.resolve();
  return {
    request(_name, _options, callback) {
      const result = queue.then(callback);
      queue = result.catch(() => {});
      return result;
    }
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n') {
      row.push(value);
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else if (character !== '\r') value += character;
  }
  return rows;
}

function rebuildNormalizedRows(rows) {
  const root = {};
  for (const row of rows) {
    const segments = row.path.slice(1).split('/').map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
    let target = root;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      const nextIsIndex = /^\d+$/.test(segments[index + 1]);
      if (target[segment] === undefined) target[segment] = nextIsIndex ? [] : {};
      target = target[segment];
    }
    target[segments.at(-1)] = JSON.parse(row.valueJson);
  }
  return root;
}

function auditCorrectnessBoundaries({ app, template, contract, inventory }) {
  const required = [
    [template, '<script src="state-contract.js" defer></script>', 'state contract script'],
    [app, 'reconcileEstimatorBaseline()', 'baseline reconciliation'],
    [app, "window.addEventListener('storage', handleStateStorageEvent)", 'storage event reconciliation'],
    [app, 'validateDateNotFuture(', 'future date validation'],
    [app, "serializeDelimitedExport(record, format)", 'faithful delimited export'],
    [contract, 'createStateCoordinator', 'state transaction coordinator'],
    [contract, 'withIndexedDbLock', 'IndexedDB transaction fallback'],
    [inventory, 'Monotonic cross-tab browser state revisions', 'cross-tab inventory row'],
    [inventory, 'Normalized CSV and TSV record export', 'delimited export inventory row']
  ];
  for (const [source, token, label] of required) {
    if (!source.includes(token)) throw new Error(`Missing exact ${label} boundary: ${token}`);
  }
}

test('newest remaining haircut controls the active baseline while manual fallback is retained', async () => {
  const { reconcileBaseline } = await loadContract();
  const estimator = {
    baselineDate: '2026-01-10',
    baselineLengthCm: 2,
    manualBaselineDate: '2026-01-10',
    manualBaselineLengthCm: 2
  };
  const first = { id: 'first', date: '2026-02-01', postCutLengthCm: 0.8, updatedAt: '2026-02-01T12:00:00Z' };
  const newest = { id: 'newest', date: '2026-03-01', postCutLengthCm: 0.4, updatedAt: '2026-03-01T12:00:00Z' };

  const created = reconcileBaseline(estimator, [first, newest], '2026-03-10');
  assert.equal(created.source.kind, 'haircut');
  assert.equal(created.source.id, 'newest');
  assert.equal(created.estimator.baselineDate, '2026-03-01');
  assert.equal(created.estimator.baselineLengthCm, 0.4);
  assert.equal(created.estimator.manualBaselineDate, '2026-01-10');
  assert.equal(created.estimator.manualBaselineLengthCm, 2);

  const edited = reconcileBaseline(created.estimator, [{ ...newest, date: '2026-01-01' }, first], '2026-03-10');
  assert.equal(edited.source.id, 'first');
  assert.equal(edited.estimator.baselineDate, '2026-02-01');

  const deletedNewest = reconcileBaseline(edited.estimator, [{ ...newest, date: '2026-01-01' }], '2026-03-10');
  assert.equal(deletedNewest.source.id, 'newest');
  assert.equal(deletedNewest.estimator.baselineDate, '2026-01-01');

  const deletedAll = reconcileBaseline(deletedNewest.estimator, [], '2026-03-10');
  assert.equal(deletedAll.source.kind, 'manual');
  assert.equal(deletedAll.estimator.baselineDate, '2026-01-10');
  assert.equal(deletedAll.estimator.baselineLengthCm, 2);
});

test('future baselines are rejected and future haircut records cannot become active', async () => {
  const { reconcileBaseline, validateDateNotFuture } = await loadContract();
  const future = validateDateNotFuture('2026-08-26', '2026-08-25');
  assert.equal(future.valid, false);
  assert.equal(future.message, 'Choose today or an earlier date.');
  const today = validateDateNotFuture('2026-08-25', '2026-08-25');
  assert.equal(today.valid, true);
  assert.equal(today.message, '');

  const result = reconcileBaseline(
    { baselineDate: '2026-08-20', baselineLengthCm: 1, manualBaselineDate: '2026-08-20', manualBaselineLengthCm: 1 },
    [
      { id: 'future', date: '2026-08-26', postCutLengthCm: 0.2, updatedAt: '2026-08-25T01:00:00Z' },
      { id: 'valid', date: '2026-08-24', postCutLengthCm: 0.5, updatedAt: '2026-08-24T01:00:00Z' }
    ],
    '2026-08-25'
  );
  assert.equal(result.source.id, 'valid');
  assert.deepEqual(Array.from(result.ignoredFutureIds), ['future']);
});

test('exclusive transactions create monotonic revisions and refuse a stale concurrent writer', async () => {
  const { createStateCoordinator } = await loadContract();
  const storage = createMemoryStorage();
  const locks = createExclusiveLocks();
  const common = { storage, stateKey: 'state', lockName: 'state-lock', navigatorLocks: locks, indexedDB: null };
  const first = createStateCoordinator({ ...common, writerId: 'writer-a', now: () => '2026-08-25T10:00:00.000Z' });
  const second = createStateCoordinator({ ...common, writerId: 'writer-b', now: () => '2026-08-25T10:00:01.000Z' });

  const [left, right] = await Promise.all([
    first.commit({ baseRevision: 0, state: { schemaVersion: 1, value: 'left' } }),
    second.commit({ baseRevision: 0, state: { schemaVersion: 1, value: 'right' } })
  ]);
  const accepted = left.ok ? left : right;
  const refused = left.ok ? right : left;
  assert.equal(accepted.revision, 1);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'stale-write');
  assert.equal(refused.current.revision, 1);
  assert.ok(['writer-a', 'writer-b'].includes(refused.current.writerId));

  const next = await first.commit({ baseRevision: 1, state: { schemaVersion: 1, value: 'next' } });
  assert.equal(next.ok, true);
  assert.equal(next.revision, 2);
  assert.equal(first.read({ schemaVersion: 1 }).revision, 2);

  const unsupportedStorage = createMemoryStorage();
  const unsupported = createStateCoordinator({
    storage: unsupportedStorage,
    stateKey: 'state',
    lockName: 'state-lock',
    writerId: 'writer-without-locking',
    navigatorLocks: null,
    indexedDB: null
  });
  const refusedWithoutLock = await unsupported.commit({ baseRevision: 0, state: { schemaVersion: 1, value: 'unsafe' } });
  assert.equal(refusedWithoutLock.ok, false);
  assert.equal(refusedWithoutLock.reason, 'locking-unavailable');
  assert.equal(unsupportedStorage.getItem('state'), null);
});

test('CSV and TSV exports preserve normalized redacted records and explicit metadata', async () => {
  const { serializeDelimitedExport } = await loadContract();
  const record = {
    schemaVersion: 1,
    exportedAt: '2026-08-25T10:00:00.000Z',
    encoding: 'UTF-8',
    omissions: ['Authenticator secrets', 'Private vocabulary mappings'],
    state: {
      estimator: { baselineDate: '2026-08-20', baselineLengthCm: 1 },
      haircuts: [
        { id: 'cut-1', date: '2026-08-21', postCutLengthCm: 0.5, note: 'Comma, quote " and newline\nkept' },
        { id: 'cut-2', date: '2026-08-22', postCutLengthCm: 0.4, note: 'Tab\tkept' }
      ],
      notifications: []
    }
  };

  const csv = serializeDelimitedExport(record, 'CSV');
  const rows = parseCsv(csv.text);
  const header = rows[0];
  const objects = rows.slice(1).map((row) => Object.fromEntries(header.map((name, index) => [name, row[index]])));
  assert.ok(objects.some((row) => row.recordType === 'haircuts' && row.recordId === 'cut-1' && row.path === '/state/haircuts/0/note' && JSON.parse(row.valueJson).includes('newline\nkept')));
  assert.ok(objects.some((row) => row.recordId === 'cut-2' && row.path === '/state/haircuts/1/note'));
  assert.ok(objects.every((row) => row.representation.includes('JSON Pointer')));
  assert.ok(objects.every((row) => row.privacy.includes('Authenticator secrets')));
  assert.doesNotMatch(csv.text, /haircutCount,historyCount,notificationCount/);
  assert.deepEqual(rebuildNormalizedRows(Array.from(csv.rows)), record);

  const tsv = serializeDelimitedExport(record, 'TSV');
  assert.match(tsv.text, /^schemaVersion\texportedAt\tencoding\tlineEndings\trepresentation\tprivacy\trecordType\trecordId\tpath\tvalueJson\n/);
  assert.match(tsv.text, /\/state\/haircuts\/0\/note/);
  const expectedTsvValue = JSON.stringify('Tab\tkept').replace(/\\/g, '\\\\');
  assert.ok(tsv.text.includes(expectedTsvValue));
});

test('correctness boundary regression turns red and restores green', async () => {
  const [app, template, contract, inventory] = await Promise.all([
    readFile(join(root, 'site', 'app.js'), 'utf8'),
    readFile(join(root, 'site', 'index.template.html'), 'utf8'),
    readFile(join(root, 'site', 'state-contract.js'), 'utf8'),
    readFile(join(root, 'docs', 'inventory', 'site-universal-features.md'), 'utf8')
  ]);
  const sources = { app, template, contract, inventory };
  assert.doesNotThrow(() => auditCorrectnessBoundaries(sources));
  assert.match(app, /function createWriterIdentity\(\) \{\s+const created = crypto\.randomUUID\(\);/);
  assert.doesNotMatch(app, /sessionStorage\.getItem\(WRITER_SESSION_KEY\)/);
  assert.doesNotMatch(app, /localStorage\.setItem\(STATE_KEY/);
  const broken = { ...sources, app: app.replace("window.addEventListener('storage', handleStateStorageEvent)", "window.addEventListener('storage-disabled', handleStateStorageEvent)") };
  assert.throws(() => auditCorrectnessBoundaries(broken), /storage event reconciliation/);
  assert.doesNotThrow(() => auditCorrectnessBoundaries(sources));
});
