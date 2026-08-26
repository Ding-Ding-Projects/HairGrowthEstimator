import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { EvidenceError } from '../../scripts/evidence/common.mjs';
import { initializeRunRoot, validatePlan } from '../../scripts/evidence/plan.mjs';
import {
  initialRecordingProgress,
  recordingStatus,
  recordingCompletionMarker,
  resetRecording,
  validateRecordingActionReceipts,
  validateRecordingPlan,
  validateRecordingPrivacy
} from '../../scripts/evidence/record-window.mjs';
import {
  assertCdpListenerOwned,
  assertCdpPortVacant,
  childFirst,
  expandOwnedProcessTree,
  processesForExecutableSince,
  processTreeFromInventory,
  selectEvidenceLaunchRoot,
  sameProcessIdentity,
  windowsCommandLine
} from '../../scripts/evidence/process-identity.mjs';
import { createPlanFixture } from './fixtures.mjs';

const hash = 'a'.repeat(64);

function recording(overrides = {}) {
  return {
    schemaVersion: 1,
    recordingId: 'main-walkthrough',
    frameRate: 2,
    durationSeconds: 2,
    outputFile: 'recordings/main-walkthrough.webp',
    encoder: { kind: 'ffmpeg', path: path.resolve('tools', 'ffmpeg.exe'), sha256: hash },
    actions: [{
      atFrame: 1,
      target: { selector: '#settings', accessibleName: 'Settings' },
      input: { method: 'mouse_click', x: 20, y: 20, button: 'left', clicks: 1 },
      semantic: {
        probe: { kind: 'attribute', selector: '#settings', name: 'aria-selected' },
        beforeEquals: 'false',
        afterEquals: 'true',
        timeoutMs: 5_000,
        intervalMs: 100
      }
    }],
    ...overrides
  };
}

test('recording plan is window-output only, bounded, and action ordered', () => {
  const valid = validateRecordingPlan(recording());
  assert.deepEqual({ frameCount: valid.frameCount, outputFile: valid.outputFile, encoder: valid.encoder.kind }, {
    frameCount: 4, outputFile: 'recordings/main-walkthrough.webp', encoder: 'ffmpeg'
  });
  assert.throws(() => validateRecordingPlan(recording({ outputFile: 'recordings/main-walkthrough.mp4' })), (error) => error instanceof EvidenceError && error.code === 'INVALID_RECORDING_PLAN');
  assert.throws(() => validateRecordingPlan(recording({ frameRate: 20 })), (error) => error instanceof EvidenceError && error.code === 'INVALID_RECORDING_PLAN');
  assert.throws(() => validateRecordingPlan(recording({
    actions: [recording().actions[0], { ...recording().actions[0], atFrame: 1 }]
  })), (error) => error instanceof EvidenceError && error.code === 'INVALID_RECORDING_ACTION');
});

test('completed recording receipt refuses altered privacy, role, or semantic evidence', () => {
  const plan = validateRecordingPlan(recording());
  const action = plan.actions[0];
  const receiptAction = {
    atFrame: action.atFrame,
    targetSelector: action.target.selector,
    targetAccessibilityName: action.target.accessibleName,
    targetAccessibilityRole: 'tab',
    input: action.input,
    semanticProbe: action.semantic.probe,
    semanticPreState: action.semantic.beforeEquals,
    semanticExpectedPreState: action.semantic.beforeEquals,
    semanticExpectedState: action.semantic.afterEquals,
    semanticPostState: action.semantic.afterEquals,
    semanticFrameState: action.semantic.afterEquals
  };
  assert.equal(validateRecordingActionReceipts(plan, [receiptAction]), true);
  assert.throws(() => validateRecordingActionReceipts(plan, [{ ...receiptAction, semanticPostState: 'false' }]), (error) => error instanceof EvidenceError && error.code === 'RECORDING_PLAN_MISMATCH');
  assert.throws(() => validateRecordingActionReceipts(plan, [{ ...receiptAction, semanticFrameState: 'false' }]), (error) => error instanceof EvidenceError && error.code === 'RECORDING_PLAN_MISMATCH');
  assert.throws(() => validateRecordingActionReceipts(plan, [{ ...receiptAction, targetAccessibilityRole: '' }]), (error) => error instanceof EvidenceError && error.code === 'INVALID_STRING');

  const privacy = {
    visibleDesktopUntouched: true,
    expectedSurfaceOnly: true,
    unrelatedTargetsObserved: false,
    sensitiveDataReviewed: true,
    mocked: false,
    handEdited: false,
    everyFrameInspected: true,
    rendererScanPassed: true,
    networkPassed: true,
    listenerOwned: true,
    postActionRevalidated: true,
    everyFramePostCaptureRevalidated: true,
    unexpectedNetworkRequests: 0
  };
  assert.equal(validateRecordingPrivacy(privacy, true), privacy);
  assert.throws(() => validateRecordingPrivacy({ ...privacy, postActionRevalidated: false }, true), (error) => error instanceof EvidenceError && error.code === 'PRIVACY_VERDICT_FAILED');

  const completed = {
    recordingId: plan.recordingId,
    route: 'cheap-lowlevel-headless',
    captureKind: 'window',
    sourceSha: '1'.repeat(40),
    artifactSha: hash,
    componentShas: [],
    tuple: { viewport: { width: 320, height: 240 }, capturePixelSize: { width: 320, height: 240 }, scale: 1, theme: 'dark', language: 'en' },
    encoder: { kind: 'ffmpeg', sha256: hash },
    timing: { frameRate: 2, durationSeconds: 2, frameCount: 4 },
    frames: [],
    actions: [receiptAction],
    output: { path: plan.outputFile, sha256: hash, width: 320, height: 240, frames: 4, mimeType: 'image/webp', decoderRoundTrip: true },
    privacy,
    inspection: {
      outputSha256: hash,
      frameInventorySha256: 'b'.repeat(64),
      everyFrameInspected: true,
      sensitiveDataReviewed: true,
      expectedSurfaceOnly: true,
      expectedFlowVisible: true,
      noClipping: true,
      reviewer: 'reviewer',
      inspectedAt: '2026-08-25T00:00:00.000Z'
    },
    pendingInspection: false,
    completed: true,
    capturedAt: '2026-08-25T00:00:00.000Z'
  };
  const marker = recordingCompletionMarker(completed);
  assert.match(marker, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(marker, recordingCompletionMarker({ ...completed, actions: [{ ...receiptAction, semanticPostState: 'false' }] }));
});

test('recording progress resets only before durable input intent and otherwise requires a fresh run', async (t) => {
  const fixture = await createPlanFixture();
  t.after(() => fixture.cleanup());
  const plan = validatePlan(fixture.plan);
  await initializeRunRoot(plan);
  const recordingPlan = validateRecordingPlan(recording());
  const progressPath = path.join(plan.outputRoot, 'recordings', `${recordingPlan.recordingId}.progress.json`);
  const frameDirectory = path.join(plan.outputRoot, 'recording-frames', recordingPlan.recordingId);
  await fsp.mkdir(path.dirname(progressPath), { recursive: true });
  await fsp.mkdir(frameDirectory, { recursive: true });
  await fsp.writeFile(path.join(frameDirectory, 'partial.png'), 'partial', 'utf8');
  await fsp.writeFile(progressPath, `${JSON.stringify(initialRecordingProgress(plan, recordingPlan), null, 2)}\n`, 'utf8');
  assert.equal((await recordingStatus(plan, recordingPlan)).action, 'reset');
  assert.equal((await resetRecording(plan, recordingPlan)).reset, true);
  assert.equal(await fsp.stat(progressPath).catch(() => null), null);
  assert.equal(await fsp.stat(frameDirectory).catch(() => null), null);

  const armed = initialRecordingProgress(plan, recordingPlan);
  armed.actions[0].phase = 'input_intent';
  armed.actions[0].preState = recordingPlan.actions[0].semantic.beforeEquals;
  armed.actions[0].inputArmedAt = new Date().toISOString();
  await fsp.writeFile(progressPath, `${JSON.stringify(armed, null, 2)}\n`, 'utf8');
  assert.deepEqual({ action: (await recordingStatus(plan, recordingPlan)).action, inputMayHaveOccurred: (await recordingStatus(plan, recordingPlan)).inputMayHaveOccurred }, {
    action: 'restart_run', inputMayHaveOccurred: true
  });
  await assert.rejects(resetRecording(plan, recordingPlan), (error) => error instanceof EvidenceError && error.code === 'AMBIGUOUS_INPUT_RECOVERY');
});

test('process ownership proof rejects incomplete or duplicate identities', () => {
  const executablePath = path.resolve('package', 'Hair Growth Estimator.exe');
  const root = { pid: 100, parentPid: 10, creationDate: '2026-08-25T05:00:00.000Z', executablePath };
  const child = { pid: 101, parentPid: 100, creationDate: '2026-08-25T05:00:01.000Z', executablePath };
  const grandchild = { pid: 102, parentPid: 101, creationDate: '2026-08-25T05:00:02.000Z', executablePath };
  const tree = processTreeFromInventory([root, child, grandchild], 100, executablePath);
  assert.deepEqual(tree.map((item) => item.pid), [100, 101, 102]);
  assert.deepEqual(childFirst(tree, 100).map((item) => item.pid), [102, 101, 100]);
  assert.equal(sameProcessIdentity(root, { ...root }), true);
  assert.equal(sameProcessIdentity(root, { ...root, creationDate: '2026-08-25T05:00:03.000Z' }), false);
  assert.throws(() => processTreeFromInventory([root, { ...child, executablePath: null }], 100, executablePath), (error) => error instanceof EvidenceError && error.code === 'PROCESS_PROOF_FAILED');
  assert.throws(() => processTreeFromInventory([root, { ...root }], 100, executablePath), (error) => error instanceof EvidenceError && error.code === 'PROCESS_PROOF_FAILED');
  assert.equal(selectEvidenceLaunchRoot([root, child]).pid, root.pid);
  assert.throws(() => selectEvidenceLaunchRoot([root, { ...root, pid: 200, parentPid: 10 }]), (error) => error instanceof EvidenceError && error.code === 'RECOVERY_IDENTITY_FAILED');
  assert.deepEqual(processesForExecutableSince([root, child, grandchild], executablePath, '2026-08-25T05:00:00.000Z').map((item) => item.pid), [100, 101, 102]);
  const late = { pid: 103, parentPid: 102, creationDate: '2026-08-25T05:00:03.000Z', executablePath };
  assert.deepEqual(expandOwnedProcessTree([grandchild, late], [root, child, grandchild]).map((item) => item.pid), [100, 101, 102, 103]);
  assert.throws(() => expandOwnedProcessTree([{ ...root, creationDate: '2026-08-25T05:01:00.000Z' }], [root]), (error) => error instanceof EvidenceError && error.code === 'PROCESS_PROOF_FAILED');
});

test('CDP port must be vacant before launch and owned by one launched loopback process afterward', () => {
  assert.deepEqual(assertCdpPortVacant([], 45_678), { passed: true, port: 45_678, listeners: 0 });
  assert.throws(() => assertCdpPortVacant([{ localAddress: '127.0.0.1', localPort: 45_678, owningPid: 99 }], 45_678), (error) => error instanceof EvidenceError && error.code === 'CDP_PORT_OCCUPIED');
  assert.deepEqual(assertCdpListenerOwned([
    { localAddress: '127.0.0.1', localPort: 45_678, owningPid: 101 }
  ], 45_678, [100, 101]), {
    passed: true, port: 45_678, owningPid: 101, addresses: ['127.0.0.1']
  });
  assert.throws(() => assertCdpListenerOwned([
    { localAddress: '127.0.0.1', localPort: 45_678, owningPid: 999 }
  ], 45_678, [100, 101]), (error) => error instanceof EvidenceError && error.code === 'CDP_LISTENER_OWNERSHIP_FAILED');
  assert.throws(() => assertCdpListenerOwned([
    { localAddress: '0.0.0.0', localPort: 45_678, owningPid: 101 }
  ], 45_678, [100, 101]), (error) => error instanceof EvidenceError && error.code === 'CDP_LISTENER_OWNERSHIP_FAILED');
});

test('Windows command-line builder quotes spaces and embedded quotes without a shell', () => {
  const executablePath = path.resolve('package with spaces', 'Hair Growth Estimator.exe');
  const command = windowsCommandLine(executablePath, ['--evidence-mode', '--label=Hair "Growth"', 'C:\\evidence root\\']);
  assert.equal(command.startsWith(`"${executablePath}" --evidence-mode `), true);
  assert.match(command, /--label=Hair/);
  assert.match(command, /evidence root/);
  assert.equal(command.includes('\n'), false);
});
