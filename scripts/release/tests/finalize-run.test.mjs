import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  buildTerminalTransferReceipt,
  validatePostRunIdentity,
  validateTerminalTransferReceipt
} from '../finalize-run.mjs';

const repository = 'Ding-Ding-Projects/HairGrowthEstimator';
const commit = '1'.repeat(40);
const version = '1.0.37';
const runId = '12345';
const contextRunAttempt = 1;
const terminalRunAttempt = 2;

function bytes(value) {
  return Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fixtures() {
  return new Map([
    ['installer-manifest.json', bytes({ schemaVersion: 1, owner: 'Ding-Ding-Projects', repository: 'HairGrowthEstimator', tag: `v${version}`, target: commit, version })],
    ['release-context.json', bytes({ schemaVersion: 1, runId, runAttempt: contextRunAttempt, tag: `v${version}`, commit, version })],
    ['trusted-product-validation.json', bytes({ schemaVersion: 1, sourceCommit: commit, version, installerManifestSha256: '2'.repeat(64), containerManifestSha256: '3'.repeat(64), installerSourceBinding: {}, containerSourceBinding: {} })]
  ]);
}

function terminalReadback() {
  return {
    schemaVersion: 2,
    tag: `v${version}`,
    commit,
    runId,
    terminalWorkflowVerified: true,
    releaseNotesState: 'finalized',
    terminalRunAttempt,
    siteInstallerManifest: 'installer-manifest.json',
    workflowCompletedAt: '2026-08-25T05:04:00.000Z',
    releaseCurrentnessVerifiedAt: '2026-08-25T05:05:01.000Z'
  };
}

test('post-run identity requires one exact completed successful run and context', () => {
  const run = { id: Number(runId), run_attempt: terminalRunAttempt, run_number: 37, head_sha: commit, status: 'completed', conclusion: 'success', repository: { full_name: repository } };
  const context = { runId, commit, version, tag: `v${version}` };
  assert.deepEqual(validatePostRunIdentity({ repository, runId, commit, run, context }), { repository, runId, runAttempt: terminalRunAttempt, commit, version, tag: `v${version}` });
  assert.throws(() => validatePostRunIdentity({ repository, runId, commit, run: { ...run, conclusion: 'failure' }, context }), /completed successfully/);
  assert.throws(() => validatePostRunIdentity({ repository, runId, commit, run: { ...run, repository: { full_name: 'other/project' } }, context }), /repository identity/);
});

test('terminal transfer receipt binds the exact three sorted input files and terminal readback', () => {
  const files = fixtures();
  const readback = terminalReadback();
  const receipt = buildTerminalTransferReceipt({ repository, context: JSON.parse(files.get('release-context.json')), readback, files });
  assert.equal(receipt.contextRunAttempt, contextRunAttempt);
  assert.equal(receipt.terminalRunAttempt, terminalRunAttempt);
  assert.equal(Object.hasOwn(receipt, 'runAttempt'), false);
  assert.deepEqual(receipt.files.map((record) => record.file), ['installer-manifest.json', 'release-context.json', 'trusted-product-validation.json']);
  assert.equal(validateTerminalTransferReceipt(receipt, files), true);
  const wrongContextAttempt = structuredClone(receipt);
  wrongContextAttempt.contextRunAttempt = terminalRunAttempt;
  assert.throws(() => validateTerminalTransferReceipt(wrongContextAttempt, files), /release context attempt/);
  assert.throws(
    () => buildTerminalTransferReceipt({ repository, context: JSON.parse(files.get('release-context.json')), readback: { ...readback, terminalRunAttempt: 0 }, files }),
    /terminal readback run attempt/
  );
  const wrongHash = structuredClone(receipt);
  wrongHash.files[0].sha256 = sha256(Buffer.from('altered'));
  assert.throws(() => validateTerminalTransferReceipt(wrongHash, files), /digest/);
  const unexpected = new Map(files);
  unexpected.set('extra.json', Buffer.from('{}'));
  assert.throws(() => validateTerminalTransferReceipt(receipt, unexpected), /exact three-file inventory/);
});

test('terminal transfer attempt identities fail closed', () => {
  const files = fixtures();
  const context = JSON.parse(files.get('release-context.json'));
  const readback = terminalReadback();
  const receipt = buildTerminalTransferReceipt({ repository, context, readback, files });

  const missingContextAttempt = structuredClone(receipt);
  delete missingContextAttempt.contextRunAttempt;
  assert.throws(() => validateTerminalTransferReceipt(missingContextAttempt, files), /unexpected field inventory/);

  const legacyAttempt = structuredClone(receipt);
  delete legacyAttempt.contextRunAttempt;
  delete legacyAttempt.terminalRunAttempt;
  legacyAttempt.runAttempt = terminalRunAttempt;
  assert.throws(() => validateTerminalTransferReceipt(legacyAttempt, files), /unexpected field inventory/);

  assert.throws(
    () => validateTerminalTransferReceipt({ ...receipt, contextRunAttempt: 0 }, files),
    /terminal transfer context run attempt/
  );
  assert.throws(
    () => validateTerminalTransferReceipt({ ...receipt, terminalRunAttempt: 0 }, files),
    /terminal transfer terminal run attempt/
  );
  assert.throws(
    () => validateTerminalTransferReceipt({ ...receipt, contextRunAttempt: 2, terminalRunAttempt: 1 }, files),
    /cannot predate/
  );
  assert.throws(
    () => validateTerminalTransferReceipt({ ...receipt, contextRunAttempt: terminalRunAttempt }, files),
    /release context attempt/
  );
  assert.throws(
    () => buildTerminalTransferReceipt({ repository, context: { ...context, runAttempt: 0 }, readback, files }),
    /release context run attempt/
  );
  assert.throws(
    () => buildTerminalTransferReceipt({ repository, context, readback: { ...readback, terminalRunAttempt: undefined }, files }),
    /terminal readback run attempt/
  );
});
