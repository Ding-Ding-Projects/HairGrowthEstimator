import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  EvidenceError,
  sha256File
} from '../../scripts/evidence/common.mjs';
import {
  BASELINE_PRIVACY_PATTERNS,
  buildApplicationArguments,
  initializeRunRoot,
  ledgerDefinition,
  normalizedPathHash,
  validatePlan,
  verifyIsolationReceipt,
  verifyPackagedReceipt,
  verifyRunOwnership
} from '../../scripts/evidence/plan.mjs';
import {
  armStepInput,
  assertFreshBindings,
  assertLedgerPlanBinding,
  completeStep,
  failStep,
  initLedger,
  readLedger,
  recordStepCaptured,
  recordStepInputApplied,
  resetStepForRetry,
  resumeStatus,
  startStep
} from '../../scripts/evidence/ledger.mjs';
import { createPlanFixture, makePng } from './fixtures.mjs';

async function fixtureForTest(t) {
  const fixture = await createPlanFixture();
  t.after(() => fixture.cleanup());
  return fixture;
}

function throwsCode(action, code) {
  assert.throws(action, (error) => error instanceof EvidenceError && error.code === code);
}

test('negative regression turns red for visible-monitor capture and green for a window-only plan', async (t) => {
  const fixture = await fixtureForTest(t);
  throwsCode(() => validatePlan({ ...fixture.plan, captureKind: 'monitor' }), 'VISIBLE_CAPTURE_FORBIDDEN');
  const plan = validatePlan(fixture.plan);
  assert.equal(plan.captureKind, 'window');
  assert.deepEqual(plan.tuple.capturePixelSize, { width: 320, height: 240 });
});

test('plan rejects caller-owned evidence switches, unbounded input, and a run root outside Temp', async (t) => {
  const fixture = await fixtureForTest(t);
  throwsCode(() => validatePlan({
    ...fixture.plan,
    application: { ...fixture.plan.application, arguments: ['--evidence-mode'] }
  }), 'DUPLICATE_EVIDENCE_SWITCH');
  throwsCode(() => validatePlan({
    ...fixture.plan,
    steps: [{ ...fixture.plan.steps[0], input: { ...fixture.plan.steps[0].input, clicks: 9 } }]
  }), 'INVALID_INPUT');
  throwsCode(() => validatePlan({
    ...fixture.plan,
    runRoot: path.join(path.parse(fixture.plan.runRoot).root, fixture.plan.runId, '.hair-growth-evidence-task')
  }), 'INVALID_RUN_ROOT');
  throwsCode(() => validatePlan({
    ...fixture.plan,
    mcp: { ...fixture.plan.mcp, endpoint: 'http://127.0.0.1:8765/other' }
  }), 'INVALID_MCP_ENDPOINT');
  throwsCode(() => validatePlan({
    ...fixture.plan,
    privacyPatterns: BASELINE_PRIVACY_PATTERNS.slice(1).map((item) => ({ ...item }))
  }), 'MISSING_BASELINE_PRIVACY_PATTERN');
  throwsCode(() => validatePlan({
    ...fixture.plan,
    steps: [{
      ...fixture.plan.steps[0],
      semantic: { beforeExpression: 'document.body.remove()', afterExpression: 'true', afterEquals: true, pollIntervalMs: 100, timeoutMs: 1_000 }
    }]
  }), 'UNEXPECTED_FIELD');
});

test('package receipt binds exact unsigned executable, app.asar, provenance, and source preservation', async (t) => {
  const fixture = await fixtureForTest(t);
  const plan = validatePlan(fixture.plan);
  const result = await verifyPackagedReceipt(plan);
  assert.deepEqual({ passed: result.passed, schemaVersion: result.schemaVersion, sourceCommit: result.sourceCommit }, {
    passed: true, schemaVersion: 2, sourceCommit: plan.sourceSha
  });

  const original = await fsp.readFile(fixture.paths.receiptPath);
  const broken = { ...fixture.receipt, executable: { ...fixture.receipt.executable, signing: 'Signed' } };
  await fsp.writeFile(fixture.paths.receiptPath, `${JSON.stringify(broken, null, 2)}\n`, 'utf8');
  await assert.rejects(verifyPackagedReceipt(plan), (error) => error instanceof EvidenceError && error.code === 'SIGNING_POLICY_VIOLATION');
  await fsp.writeFile(fixture.paths.receiptPath, original);
  const missingSourceRecord = structuredClone(fixture.receipt);
  missingSourceRecord.sourceBinding.appAsar.files = [];
  await fsp.writeFile(fixture.paths.receiptPath, `${JSON.stringify(missingSourceRecord, null, 2)}\n`, 'utf8');
  await assert.rejects(verifyPackagedReceipt(plan), (error) => error instanceof EvidenceError && error.code === 'INVALID_BUILD_RECEIPT');
  await fsp.writeFile(fixture.paths.receiptPath, original);
  assert.equal(await sha256File(fixture.paths.receiptPath), plan.artifact.components.find((item) => item.id === 'build-receipt').sha256);
  assert.equal((await verifyPackagedReceipt(plan)).passed, true);
});

test('dual evidence data roots require exact pre-ready path-hash receipts', async (t) => {
  const fixture = await fixtureForTest(t);
  const plan = validatePlan(fixture.plan);
  const paths = await initializeRunRoot(plan);
  assert.equal((await verifyRunOwnership(plan)).passed, true);
  const argumentsValue = buildApplicationArguments(plan, paths);
  assert.deepEqual(argumentsValue.slice(-5), [
    '--evidence-mode',
    `--evidence-app-data=${paths.appDataPath}`,
    `--evidence-user-data=${paths.userDataPath}`,
    `--user-data-dir=${paths.userDataPath}`,
    `--remote-debugging-port=${plan.cdp.port}`
  ]);
  const appDataPathSha256 = normalizedPathHash(paths.appDataPath);
  const userDataPathSha256 = normalizedPathHash(paths.userDataPath);
  await Promise.all([
    fsp.writeFile(path.join(paths.appDataPath, plan.isolation.appDataMarkerFile), `${JSON.stringify({ schemaVersion: 1, appDataPathSha256 })}\n`, 'utf8'),
    fsp.writeFile(path.join(paths.userDataPath, plan.isolation.receiptFile), `${JSON.stringify({
      schemaVersion: 1,
      mode: true,
      appDataPathSha256,
      userDataPathSha256,
      distinct: true,
      initializedBeforeReady: true
    })}\n`, 'utf8')
  ]);
  assert.equal((await verifyIsolationReceipt(plan, paths)).passed, true);
  await fsp.writeFile(path.join(paths.userDataPath, plan.isolation.receiptFile), `${JSON.stringify({
    schemaVersion: 1,
    mode: true,
    appDataPathSha256,
    userDataPathSha256: '0'.repeat(64),
    distinct: true,
    initializedBeforeReady: true
  })}\n`, 'utf8');
  await assert.rejects(verifyIsolationReceipt(plan, paths), (error) => error instanceof EvidenceError && error.code === 'ISOLATION_RECEIPT_FAILED');
  const ownerMarkerPath = path.join(plan.runRoot, '.evidence-run-owner.json');
  const ownerMarker = JSON.parse(await fsp.readFile(ownerMarkerPath, 'utf8'));
  await fsp.writeFile(ownerMarkerPath, `${JSON.stringify({ ...ownerMarker, planHash: '0'.repeat(64) })}\n`, 'utf8');
  await assert.rejects(verifyRunOwnership(plan), (error) => error instanceof EvidenceError && error.code === 'RUN_OWNERSHIP_FAILED');
});

test('per-click ledger resumes captured inspection and fails closed on stale artifact bytes', async (t) => {
  const fixture = await fixtureForTest(t);
  const plan = validatePlan(fixture.plan);
  const paths = await initializeRunRoot(plan);
  const ledgerPath = path.join(plan.runRoot, 'per-click-ledger.json');
  const outputRoot = plan.outputRoot;
  const context = { repoRoot: plan.repoRoot, artifactPaths: plan.artifactPaths, outputRoot };
  const preRelative = 'steps/001-open-settings-attempt-1-pre.png';
  const postRelative = 'steps/001-open-settings-attempt-1-post.png';
  await fsp.mkdir(path.join(outputRoot, 'steps'), { recursive: true });
  await Promise.all([
    fsp.writeFile(path.join(outputRoot, preRelative), makePng()),
    fsp.writeFile(path.join(outputRoot, postRelative), makePng(320, 240))
  ]);
  const preSha = await sha256File(path.join(outputRoot, preRelative));
  const postSha = await sha256File(path.join(outputRoot, postRelative));
  await initLedger(ledgerPath, ledgerDefinition(plan), context);
  await startStep(ledgerPath, 'open-settings', {
    preState: 'false',
    preCapture: { path: preRelative, sha256: preSha, width: 320, height: 240 }
  }, context);
  await armStepInput(ledgerPath, 'open-settings', context);
  await recordStepInputApplied(ledgerPath, 'open-settings', {
    inputReceipt: { method: 'mouse_click', x: 20, y: 20, button: 'left', clicks: 1, accessibleName: 'Settings', accessibleRole: 'tab' }
  }, context);
  await assert.rejects(recordStepCaptured(ledgerPath, 'open-settings', {
    postState: 'false',
    semanticPostState: 'true',
    postCapture: { path: postRelative, sha256: postSha, width: 320, height: 240 },
    automatedPrivacyVerdict: {
      visibleDesktopUntouched: true,
      expectedSurfaceOnly: true,
      unrelatedTargetsObserved: false,
      mocked: false,
      handEdited: false,
      rendererScanPassed: true,
      networkPassed: true,
      listenerOwned: true,
      postActionRevalidated: true
    }
  }, context), (error) => error instanceof EvidenceError && error.code === 'SEMANTIC_STATE_MISMATCH');
  await recordStepCaptured(ledgerPath, 'open-settings', {
    postState: 'true',
    semanticPostState: 'true',
    postCapture: { path: postRelative, sha256: postSha, width: 320, height: 240 },
    automatedPrivacyVerdict: {
      visibleDesktopUntouched: true,
      expectedSurfaceOnly: true,
      unrelatedTargetsObserved: false,
      mocked: false,
      handEdited: false,
      rendererScanPassed: true,
      networkPassed: true,
      listenerOwned: true,
      postActionRevalidated: true
    }
  }, context);
  assert.deepEqual(await resumeStatus(ledgerPath, context), {
    reusable: 0, resumeFrom: 'open-settings', status: 'captured', phase: 'post_captured', action: 'inspect', completed: false
  });
  const completed = await completeStep(ledgerPath, 'open-settings', {
    pixelsInspected: true,
    sensitiveDataReviewed: true,
    targetVisible: true,
    expectedStateVisible: true,
    noClipping: true,
    reviewer: 'evidence-reviewer'
  }, context);
  assert.match(completed.completionMarker, /^sha256:[a-f0-9]{64}$/);
  assert.equal((await resumeStatus(ledgerPath, context)).completed, true);

  const stableLedger = await readLedger(ledgerPath);
  const tamperedLedger = structuredClone(stableLedger);
  tamperedLedger.steps[0].targetSelector = '#different-target';
  assert.throws(() => assertLedgerPlanBinding(tamperedLedger, ledgerDefinition(plan)), (error) => error instanceof EvidenceError && error.code === 'LEDGER_PLAN_MISMATCH');
  tamperedLedger.steps[0].targetSelector = stableLedger.steps[0].targetSelector;
  tamperedLedger.steps[0].postState = 'tampered';
  await fsp.writeFile(ledgerPath, `${JSON.stringify(tamperedLedger, null, 2)}\n`, 'utf8');
  await assert.rejects(resumeStatus(ledgerPath, context), (error) => error instanceof EvidenceError && error.code === 'STALE_STEP');
  await fsp.writeFile(ledgerPath, `${JSON.stringify(stableLedger, null, 2)}\n`, 'utf8');

  const originalArtifact = await fsp.readFile(fixture.paths.appAsarPath);
  await fsp.writeFile(fixture.paths.appAsarPath, Buffer.concat([originalArtifact, Buffer.from('stale')]));
  await assert.rejects(assertFreshBindings(await readLedger(ledgerPath), context), (error) => error instanceof EvidenceError && error.code === 'STALE_ARTIFACT');
  await fsp.writeFile(fixture.paths.appAsarPath, originalArtifact);
  assert.equal((await assertFreshBindings(await readLedger(ledgerPath), context)).components, 2);
});

test('durable input intent refuses a retry that could double-apply a click', async (t) => {
  const fixture = await fixtureForTest(t);
  const plan = validatePlan(fixture.plan);
  await initializeRunRoot(plan);
  const ledgerPath = path.join(plan.runRoot, 'per-click-ledger.json');
  const context = { repoRoot: plan.repoRoot, artifactPaths: plan.artifactPaths, outputRoot: plan.outputRoot };
  const preRelative = 'steps/001-open-settings-attempt-1-pre.png';
  await fsp.mkdir(path.join(plan.outputRoot, 'steps'), { recursive: true });
  await fsp.writeFile(path.join(plan.outputRoot, preRelative), makePng());
  const preSha = await sha256File(path.join(plan.outputRoot, preRelative));
  await initLedger(ledgerPath, ledgerDefinition(plan), context);
  await startStep(ledgerPath, 'open-settings', {
    preState: 'false',
    preCapture: { path: preRelative, sha256: preSha, width: 320, height: 240 }
  }, context);
  assert.equal((await resumeStatus(ledgerPath, context)).action, 'reset');
  await armStepInput(ledgerPath, 'open-settings', context);
  await failStep(ledgerPath, 'open-settings', 'INTERRUPTED_AFTER_INPUT_INTENT');
  const status = await resumeStatus(ledgerPath, context);
  assert.deepEqual({ phase: status.phase, action: status.action }, { phase: 'input_intent', action: 'restart_run' });
  await assert.rejects(resetStepForRetry(ledgerPath, 'open-settings', context), (error) => error instanceof EvidenceError && error.code === 'AMBIGUOUS_INPUT_RECOVERY');
});

test('durable input-applied receipt also requires a fresh isolated run after interruption', async (t) => {
  const fixture = await fixtureForTest(t);
  const plan = validatePlan(fixture.plan);
  await initializeRunRoot(plan);
  const ledgerPath = path.join(plan.runRoot, 'per-click-ledger.json');
  const context = { repoRoot: plan.repoRoot, artifactPaths: plan.artifactPaths, outputRoot: plan.outputRoot };
  const preRelative = 'steps/001-open-settings-attempt-1-pre.png';
  await fsp.mkdir(path.join(plan.outputRoot, 'steps'), { recursive: true });
  await fsp.writeFile(path.join(plan.outputRoot, preRelative), makePng());
  const preSha = await sha256File(path.join(plan.outputRoot, preRelative));
  await initLedger(ledgerPath, ledgerDefinition(plan), context);
  await startStep(ledgerPath, 'open-settings', {
    preState: 'false',
    preCapture: { path: preRelative, sha256: preSha, width: 320, height: 240 }
  }, context);
  await armStepInput(ledgerPath, 'open-settings', context);
  await recordStepInputApplied(ledgerPath, 'open-settings', {
    inputReceipt: { method: 'mouse_click', x: 20, y: 20, button: 'left', clicks: 1, accessibleName: 'Settings', accessibleRole: 'tab' }
  }, context);
  await failStep(ledgerPath, 'open-settings', 'INTERRUPTED_AFTER_INPUT_APPLIED');
  const status = await resumeStatus(ledgerPath, context);
  assert.deepEqual({ phase: status.phase, action: status.action }, { phase: 'input_applied', action: 'restart_run' });
  await assert.rejects(resetStepForRetry(ledgerPath, 'open-settings', context), (error) => error instanceof EvidenceError && error.code === 'AMBIGUOUS_INPUT_RECOVERY');
});
