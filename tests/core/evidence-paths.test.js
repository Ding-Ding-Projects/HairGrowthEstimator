'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

function evidencePaths() {
  return require('../../app/core/evidence-paths');
}

function makeSandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-evidence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function ownedRoots(t) {
  const root = makeSandbox(t);
  const taskRoot = path.join(root, '.hair-growth-evidence-task');
  const appData = path.join(taskRoot, 'app-data');
  const userData = path.join(taskRoot, 'user-data');
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  return { root, taskRoot, appData, userData };
}

function evidenceArgs(appData, userData) {
  return [
    '--evidence-mode',
    `--evidence-app-data=${appData}`,
    `--evidence-user-data=${userData}`
  ];
}

test('normal mode is inactive and ignores ordinary arguments without touching the filesystem', () => {
  const { validateEvidencePathArguments } = evidencePaths();
  const noReadFs = new Proxy({}, {
    get() {
      throw new Error('normal mode must not inspect the filesystem');
    }
  });
  const result = validateEvidencePathArguments(['--inspect=9229', 'hair-log.json'], { fs: noReadFs });
  assert.deepEqual(result, { active: false, paths: null });
  assert.equal(Object.isFrozen(result), true);
});

test('evidence mode requires the exact mode switch exactly once', (t) => {
  const { validateEvidencePathArguments } = evidencePaths();
  const { appData, userData } = ownedRoots(t);
  assert.deepEqual(
    validateEvidencePathArguments([
      '--evidence-mode=true',
      `--evidence-app-data=${appData}`,
      `--evidence-user-data=${userData}`
    ]),
    { active: false, paths: null }
  );
  assert.throws(
    () => validateEvidencePathArguments(['--evidence-mode', ...evidenceArgs(appData, userData)]),
    /evidence mode switch.*exactly once/i
  );
});

test('evidence mode requires both exact data switches', (t) => {
  const { validateEvidencePathArguments } = evidencePaths();
  const { appData, userData } = ownedRoots(t);
  assert.throws(
    () => validateEvidencePathArguments(['--evidence-mode', `--evidence-user-data=${userData}`]),
    /--evidence-app-data.*exactly once/i
  );
  assert.throws(
    () => validateEvidencePathArguments(['--evidence-mode', `--evidence-app-data=${appData}`]),
    /--evidence-user-data.*exactly once/i
  );
  assert.throws(
    () => validateEvidencePathArguments([
      '--evidence-mode',
      `--evidence-app-data-path=${appData}`,
      `--evidence-user-data=${userData}`
    ]),
    /--evidence-app-data.*exactly once/i
  );
});

test('unexpected repeated data switches are rejected instead of choosing a winner', (t) => {
  const { validateEvidencePathArguments } = evidencePaths();
  const { appData, userData } = ownedRoots(t);
  assert.throws(
    () => validateEvidencePathArguments([
      ...evidenceArgs(appData, userData),
      `--evidence-app-data=${appData}`
    ]),
    /--evidence-app-data.*exactly once/i
  );
  assert.throws(
    () => validateEvidencePathArguments([
      ...evidenceArgs(appData, userData),
      `--evidence-user-data=${userData}`
    ]),
    /--evidence-user-data.*exactly once/i
  );
});

test('relative data paths and filesystem roots are rejected', (t) => {
  const { validateEvidencePathArguments } = evidencePaths();
  const { appData, userData } = ownedRoots(t);
  const filesystemRoot = path.parse(appData).root;
  assert.throws(
    () => validateEvidencePathArguments(evidenceArgs(path.join('.hair-growth-evidence-task', 'app-data'), userData)),
    /absolute/i
  );
  assert.throws(
    () => validateEvidencePathArguments(evidenceArgs(appData, filesystemRoot)),
    /filesystem root/i
  );
});

test('same, ancestor, and descendant data roots are rejected', (t) => {
  const { validateEvidencePathArguments } = evidencePaths();
  const { taskRoot, appData, userData } = ownedRoots(t);
  assert.throws(() => validateEvidencePathArguments(evidenceArgs(appData, appData)), /overlap/i);
  assert.throws(() => validateEvidencePathArguments(evidenceArgs(taskRoot, appData)), /overlap/i);
  assert.throws(() => validateEvidencePathArguments(evidenceArgs(userData, path.join(userData, 'nested'))), /overlap/i);
});

test('existing nonempty directories and existing files are rejected', (t) => {
  const { validateEvidencePathArguments } = evidencePaths();
  const { taskRoot, appData, userData } = ownedRoots(t);
  fs.writeFileSync(path.join(appData, 'unexpected.json'), '{}', 'utf8');
  assert.throws(() => validateEvidencePathArguments(evidenceArgs(appData, userData)), /must be empty/i);

  const filePath = path.join(taskRoot, 'not-a-directory');
  fs.writeFileSync(filePath, 'not a directory', 'utf8');
  assert.throws(() => validateEvidencePathArguments(evidenceArgs(filePath, userData)), /directory/i);
});

test('an exact ownership-marker segment authorizes two empty sibling roots', (t) => {
  const { EVIDENCE_OWNERSHIP_MARKER, validateEvidencePathArguments } = evidencePaths();
  const { appData, userData } = ownedRoots(t);
  const result = validateEvidencePathArguments(evidenceArgs(
    path.join(appData, '..', 'app-data'),
    path.join(userData, '.', '')
  ));
  assert.equal(EVIDENCE_OWNERSHIP_MARKER, '.hair-growth-evidence-task');
  assert.deepEqual(result, {
    active: true,
    paths: {
      appData: path.resolve(appData),
      userData: path.resolve(userData)
    }
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.paths), true);
});

test('ownership marker lookalikes do not authorize a path', (t) => {
  const { validateEvidencePathArguments } = evidencePaths();
  const root = makeSandbox(t);
  const lookalike = path.join(root, '.hair-growth-evidence-task-copy');
  const appData = path.join(lookalike, 'app-data');
  const userData = path.join(lookalike, 'user-data');
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  assert.throws(() => validateEvidencePathArguments(evidenceArgs(appData, userData)), /task ownership/i);
});

test('the ownership marker authorizes normal evidence mode only beneath the operating-system temporary root', () => {
  const { validateEvidencePathArguments } = evidencePaths();
  const taskRoot = path.join(process.cwd(), '.hair-growth-evidence-task', 'outside-temporary-storage');
  assert.throws(() => validateEvidencePathArguments(evidenceArgs(
    path.join(taskRoot, 'app-data'),
    path.join(taskRoot, 'user-data')
  )), /temporary/i);
});

test('caller-supplied approved parents authorize strict descendants', (t) => {
  const { validateEvidencePathArguments } = evidencePaths();
  const root = makeSandbox(t);
  const approvedParent = path.join(root, 'approved-evidence-parent');
  const appData = path.join(approvedParent, 'app-data');
  const userData = path.join(approvedParent, 'user-data');
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  assert.deepEqual(
    validateEvidencePathArguments(evidenceArgs(appData, userData), { approvedParents: [approvedParent] }).paths,
    { appData: path.resolve(appData), userData: path.resolve(userData) }
  );
  assert.throws(
    () => validateEvidencePathArguments(evidenceArgs(approvedParent, userData), { approvedParents: [approvedParent] }),
    /strict descendant/i
  );
});

test('relative and filesystem-root approved parents are rejected', (t) => {
  const { validateEvidencePathArguments } = evidencePaths();
  const { appData, userData } = ownedRoots(t);
  assert.throws(
    () => validateEvidencePathArguments(evidenceArgs(appData, userData), { approvedParents: ['relative-parent'] }),
    /approved parent.*absolute/i
  );
  assert.throws(
    () => validateEvidencePathArguments(evidenceArgs(appData, userData), { approvedParents: [path.parse(appData).root] }),
    /approved parent.*filesystem root/i
  );
});

test('a symlink or reparse component in either data path is rejected', (t) => {
  const { validateEvidencePathArguments } = evidencePaths();
  const { taskRoot, userData } = ownedRoots(t);
  const realRoot = path.join(taskRoot, 'real-root');
  const linkedRoot = path.join(taskRoot, 'linked-root');
  const appData = path.join(linkedRoot, 'app-data');
  fs.mkdirSync(path.join(realRoot, 'app-data'), { recursive: true });
  fs.symlinkSync(realRoot, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => validateEvidencePathArguments(evidenceArgs(appData, userData)), /symlink or reparse/i);
});

test('nonexistent authorized sibling roots are normalized without being created', (t) => {
  const { validateEvidencePathArguments } = evidencePaths();
  const root = makeSandbox(t);
  const taskRoot = path.join(root, '.hair-growth-evidence-task');
  fs.mkdirSync(taskRoot, { recursive: true });
  const appData = path.join(taskRoot, 'future-app-data');
  const userData = path.join(taskRoot, 'future-user-data');
  const result = validateEvidencePathArguments(evidenceArgs(appData, userData));
  assert.deepEqual(result.paths, { appData: path.resolve(appData), userData: path.resolve(userData) });
  assert.equal(fs.existsSync(appData), false);
  assert.equal(fs.existsSync(userData), false);
});

test('receipt hashes normalized roots without retaining raw paths', (t) => {
  const { createEvidenceIsolationReceipt, validateEvidencePathArguments } = evidencePaths();
  const { taskRoot } = ownedRoots(t);
  const decomposed = `re\u0301ceipt`;
  const appData = path.join(taskRoot, `${decomposed}-app-data`);
  const userData = path.join(taskRoot, `${decomposed}-user-data`);
  fs.mkdirSync(appData);
  fs.mkdirSync(userData);
  const validated = validateEvidencePathArguments(evidenceArgs(appData, userData));
  const canonicalPath = value => {
    let result = path.resolve(value).normalize('NFC').replace(/\\/g, '/');
    if (process.platform === 'win32') result = result.toLowerCase();
    return result;
  };
  const digest = value => crypto.createHash('sha256').update(canonicalPath(value), 'utf8').digest('hex');
  const receipt = createEvidenceIsolationReceipt(validated);
  assert.notEqual(canonicalPath(appData), path.resolve(appData));
  assert.deepEqual(receipt, {
    schemaVersion: 1,
    mode: true,
    appDataPathSha256: digest(path.resolve(appData)),
    userDataPathSha256: digest(path.resolve(userData)),
    distinct: true,
    initializedBeforeReady: true
  });
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(JSON.stringify(receipt).includes(path.resolve(appData)), false);
  assert.equal(JSON.stringify(receipt).includes(path.resolve(userData)), false);
  assert.throws(
    () => createEvidenceIsolationReceipt({ active: false, paths: null }),
    /active evidence-path validation/i
  );
});
