import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  LIMITS,
  assertObject,
  assertPinnedArtifact,
  assertPinnedSource,
  assertPublicReceiptValue,
  atomicWriteJson,
  boundedString,
  canonicalHash,
  fail,
  inspectPng,
  readJson,
  safeRelative,
  strictChild
} from './common.mjs';

const STEP_STATUSES = new Set(['pending', 'running', 'captured', 'failed', 'completed']);
const STEP_PHASES = new Set(['pending', 'pre_captured', 'input_intent', 'input_applied', 'post_captured', 'completed']);

function boundedValue(value, label) {
  assertPublicReceiptValue(value, label);
  return value;
}

function validateTuple(tuple) {
  assertObject(tuple, 'capture tuple');
  if (!Number.isInteger(tuple.viewport?.width) || tuple.viewport.width < 320 || tuple.viewport.width > 8_192 ||
      !Number.isInteger(tuple.viewport?.height) || tuple.viewport.height < 240 || tuple.viewport.height > 8_192) {
    fail('INVALID_TUPLE', 'Capture viewport is outside the supported bounds.');
  }
  if (typeof tuple.scale !== 'number' || tuple.scale < 0.5 || tuple.scale > 4) fail('INVALID_TUPLE', 'Capture scale is outside the supported bounds.');
  boundedString(tuple.theme, 'capture theme', { max: 64, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
  boundedString(tuple.language, 'capture language', { max: 64, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
  return {
    viewport: { width: tuple.viewport.width, height: tuple.viewport.height },
    capturePixelSize: {
      width: Math.round(tuple.viewport.width * tuple.scale),
      height: Math.round(tuple.viewport.height * tuple.scale)
    },
    scale: tuple.scale,
    theme: tuple.theme,
    language: tuple.language
  };
}

function validateArtifactBinding(binding) {
  assertObject(binding, 'artifact binding');
  const primary = assertObject(binding.primary, 'primary artifact');
  const normalized = {
    primary: {
      id: boundedString(primary.id, 'primary artifact id', { max: 80, pattern: /^[a-z0-9][a-z0-9._-]*$/ }),
      sha256: boundedString(primary.sha256, 'primary artifact SHA-256', { pattern: /^[a-f0-9]{64}$/ })
    },
    components: []
  };
  if (!Array.isArray(binding.components) || binding.components.length > 16) fail('INVALID_ARTIFACT_BINDING', 'Artifact component inventory is invalid.');
  const ids = new Set([normalized.primary.id]);
  for (const component of binding.components) {
    assertObject(component, 'artifact component');
    const id = boundedString(component.id, 'artifact component id', { max: 80, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
    if (ids.has(id)) fail('DUPLICATE_ARTIFACT_ID', 'Artifact component ids must be unique.');
    ids.add(id);
    normalized.components.push({ id, sha256: boundedString(component.sha256, 'artifact component SHA-256', { pattern: /^[a-f0-9]{64}$/ }) });
  }
  return normalized;
}

function validateStepDefinition(step, index) {
  assertObject(step, `step ${index}`);
  const id = boundedString(step.id, `step ${index} id`, { max: 96, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
  const targetSelector = boundedString(step.targetSelector, `step ${id} target selector`, { max: 1_024 });
  const targetAccessibilityName = boundedString(step.targetAccessibilityName, `step ${id} accessible name`, { max: 256 });
  const inputMethod = boundedString(step.inputMethod, `step ${id} input method`, { max: 64, pattern: /^(?:mouse_click|win_send_keys)$/ });
  const input = boundedValue(step.input, `step ${id} input`);
  if (input?.method !== inputMethod) fail('INPUT_METHOD_MISMATCH', 'Step input does not match its registered method.');
  const expectedTransition = boundedString(step.expectedTransition, `step ${id} expected transition`, { max: 1_024 });
  const semanticProbe = boundedValue(step.semanticProbe, `step ${id} semantic probe`);
  const expectedPreState = boundedValue(step.expectedPreState, `step ${id} expected pre-action semantic state`);
  const expectedSemanticState = boundedValue(step.expectedSemanticState, `step ${id} expected semantic state`);
  return {
    id,
    order: index,
    status: 'pending',
    phase: 'pending',
    attempts: 0,
    targetSelector,
    targetAccessibilityName,
    inputMethod,
    input: structuredClone(input),
    expectedTransition,
    semanticProbe: structuredClone(semanticProbe),
    expectedPreState: structuredClone(expectedPreState),
    expectedSemanticState: structuredClone(expectedSemanticState),
    binding: null,
    startedAt: null,
    capturedAt: null,
    completedAt: null,
    failureCode: null,
    failurePhase: null,
    inputArmedAt: null,
    inputAppliedAt: null,
    preState: null,
    postState: null,
    semanticPostState: null,
    inputReceipt: null,
    captures: { pre: null, post: null },
    automatedPrivacyVerdict: null,
    privacyVerdict: null,
    completionMarker: null
  };
}

export function createLedgerDocument({ runId, sourceSha, artifact, tuple, steps }) {
  boundedString(runId, 'run id', { max: 128, pattern: /^[A-Za-z0-9._-]+$/ });
  boundedString(sourceSha, 'source SHA', { pattern: /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/ });
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > LIMITS.steps) fail('INVALID_STEP_INVENTORY', 'Step inventory must contain one through 512 explicit steps.');
  const normalizedSteps = steps.map(validateStepDefinition);
  if (new Set(normalizedSteps.map((step) => step.id)).size !== normalizedSteps.length) fail('DUPLICATE_STEP_ID', 'Step ids must be unique.');
  return {
    schemaVersion: 1,
    runId,
    route: 'cheap-lowlevel-headless',
    captureKind: 'window',
    source: { sha: sourceSha.toLowerCase() },
    artifact: validateArtifactBinding(artifact),
    tuple: validateTuple(tuple),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completed: false,
    steps: normalizedSteps
  };
}

export async function initLedger(ledgerPath, definition, { repoRoot, artifactPaths }) {
  try {
    await fsp.access(ledgerPath);
    fail('LEDGER_EXISTS', 'Evidence ledger already exists.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const ledger = createLedgerDocument(definition);
  await assertFreshBindings(ledger, { repoRoot, artifactPaths });
  assertPublicReceiptValue(ledger, 'evidence ledger');
  await atomicWriteJson(ledgerPath, ledger);
  return ledger;
}

export async function readLedger(ledgerPath) {
  const ledger = await readJson(ledgerPath);
  if (ledger?.schemaVersion !== 1 || ledger.route !== 'cheap-lowlevel-headless' || ledger.captureKind !== 'window' || !Array.isArray(ledger.steps)) {
    fail('INVALID_LEDGER', 'Evidence ledger has an unsupported contract.');
  }
  validateArtifactBinding(ledger.artifact);
  validateTuple(ledger.tuple);
  if (!ledger.steps.every((step, index) => step?.order === index && STEP_STATUSES.has(step.status) && Number.isInteger(step.attempts) && step.attempts >= 0 && step.attempts <= 3) ||
      new Set(ledger.steps.map((step) => step.id)).size !== ledger.steps.length) fail('INVALID_LEDGER', 'Evidence ledger step sequence is invalid.');
  for (const step of ledger.steps) {
    if (!STEP_PHASES.has(step.phase)) fail('INVALID_LEDGER', 'Evidence ledger contains an invalid durable phase.');
    const allowed = (step.status === 'pending' && step.phase === 'pending') ||
      (step.status === 'running' && ['pre_captured', 'input_intent', 'input_applied'].includes(step.phase)) ||
      (step.status === 'captured' && step.phase === 'post_captured') ||
      (step.status === 'failed' && step.failurePhase === step.phase) ||
      (step.status === 'completed' && step.phase === 'completed');
    if (!allowed) fail('INVALID_LEDGER', 'Evidence ledger status and durable phase disagree.');
  }
  assertPublicReceiptValue(ledger, 'evidence ledger');
  return ledger;
}

function ledgerPlanProjection(value) {
  return {
    runId: value.runId,
    sourceSha: value.sourceSha ?? value.source?.sha,
    artifact: validateArtifactBinding(value.artifact),
    tuple: validateTuple(value.tuple),
    steps: value.steps.map((step) => ({
      id: step.id,
      targetSelector: step.targetSelector,
      targetAccessibilityName: step.targetAccessibilityName,
      inputMethod: step.inputMethod,
      input: step.input,
      expectedTransition: step.expectedTransition,
      semanticProbe: step.semanticProbe,
      expectedPreState: step.expectedPreState,
      expectedSemanticState: step.expectedSemanticState
    }))
  };
}

export function assertLedgerPlanBinding(ledger, definition) {
  if (canonicalHash(ledgerPlanProjection(ledger)) !== canonicalHash(ledgerPlanProjection(definition))) {
    fail('LEDGER_PLAN_MISMATCH', 'Evidence ledger does not match the exact run plan.');
  }
  return true;
}

function expectedArtifacts(ledger) {
  return [ledger.artifact.primary, ...ledger.artifact.components];
}

export async function assertFreshBindings(ledger, { repoRoot, artifactPaths }) {
  assertPinnedSource(repoRoot, ledger.source.sha);
  assertObject(artifactPaths, 'artifact path map');
  const expected = expectedArtifacts(ledger);
  if (Object.keys(artifactPaths).length !== expected.length) fail('ARTIFACT_SET_MISMATCH', 'Artifact path map must match the exact bound artifact set.');
  for (const artifact of expected) {
    if (typeof artifactPaths[artifact.id] !== 'string') fail('ARTIFACT_SET_MISMATCH', 'Artifact path map is missing a bound artifact id.');
    await assertPinnedArtifact(artifactPaths[artifact.id], artifact.sha256);
  }
  return { sourceSha: ledger.source.sha, artifactSha: ledger.artifact.primary.sha256, components: ledger.artifact.components.length };
}

async function captureReceipt(capture, outputRoot) {
  assertObject(capture, 'capture receipt input');
  const relativePath = safeRelative(capture.path, 'capture path');
  const resolved = (await strictChild(path.resolve(outputRoot, relativePath), outputRoot, 'capture path')).child;
  const inspected = await inspectPng(resolved, { requireNonblank: true });
  if (capture.sha256 && capture.sha256 !== inspected.sha256) fail('STALE_CAPTURE', 'Capture SHA-256 does not match the captured file.');
  if ((capture.width && capture.width !== inspected.width) || (capture.height && capture.height !== inspected.height)) fail('STALE_CAPTURE', 'Capture dimensions do not match the captured file.');
  return {
    path: relativePath,
    sha256: inspected.sha256,
    width: inspected.width,
    height: inspected.height,
    mimeType: inspected.mimeType
  };
}

function findStep(ledger, stepId) {
  const step = ledger.steps.find((item) => item.id === stepId);
  if (!step) fail('UNKNOWN_STEP', 'Evidence step id is not registered.');
  return step;
}

function ensurePriorComplete(ledger, step) {
  if (ledger.steps.slice(0, step.order).some((item) => item.status !== 'completed')) {
    fail('STEP_ORDER_VIOLATION', 'Every earlier evidence step must be completed first.');
  }
}

export async function startStep(ledgerPath, stepId, details, context) {
  const ledger = await readLedger(ledgerPath);
  await assertFreshBindings(ledger, context);
  const step = findStep(ledger, stepId);
  ensurePriorComplete(ledger, step);
  if (step.status !== 'pending') fail('STEP_STATE_VIOLATION', 'Only a pending evidence step may start.');
  if (step.attempts >= 3) fail('RETRY_LIMIT', 'Evidence step exhausted its bounded retry allowance.');
  const pre = await captureReceipt(details.preCapture, context.outputRoot);
  if (pre.width !== ledger.tuple.capturePixelSize.width || pre.height !== ledger.tuple.capturePixelSize.height) {
    fail('VIEWPORT_MISMATCH', 'Pre-action capture dimensions do not match the declared viewport.');
  }
  step.status = 'running';
  step.phase = 'pre_captured';
  step.attempts += 1;
  step.startedAt = new Date().toISOString();
  step.binding = {
    sourceSha: ledger.source.sha,
    artifactSha: ledger.artifact.primary.sha256,
    componentShas: ledger.artifact.components.map((item) => ({ id: item.id, sha256: item.sha256 }))
  };
  const preState = boundedValue(details.preState, 'pre-action semantic state');
  if (canonicalHash(preState) !== canonicalHash(step.expectedPreState)) fail('SEMANTIC_PRE_STATE_MISMATCH', 'Semantic pre-action state does not match the registered expectation.');
  step.preState = structuredClone(preState);
  step.captures.pre = pre;
  ledger.updatedAt = new Date().toISOString();
  assertPublicReceiptValue(ledger, 'evidence ledger');
  await atomicWriteJson(ledgerPath, ledger);
  return step;
}

export async function armStepInput(ledgerPath, stepId, context) {
  const ledger = await readLedger(ledgerPath);
  await assertFreshBindings(ledger, context);
  const step = findStep(ledger, stepId);
  ensurePriorComplete(ledger, step);
  if (step.status !== 'running' || step.phase !== 'pre_captured' || !step.captures.pre) {
    fail('STEP_STATE_VIOLATION', 'Only a pre-captured running step may arm input.');
  }
  step.phase = 'input_intent';
  step.inputArmedAt = new Date().toISOString();
  ledger.updatedAt = new Date().toISOString();
  assertPublicReceiptValue(ledger, 'evidence ledger');
  await atomicWriteJson(ledgerPath, ledger);
  return step;
}

function validateInputReceipt(step, rawReceipt) {
  const inputReceipt = assertObject(rawReceipt, 'input receipt');
  if (inputReceipt.method !== step.inputMethod) fail('INPUT_METHOD_MISMATCH', 'Input receipt does not match the registered step method.');
  if (inputReceipt.accessibleName !== step.targetAccessibilityName) fail('ACCESSIBLE_NAME_MISMATCH', 'Input receipt does not match the registered accessibility name.');
  const expectedInput = step.inputMethod === 'mouse_click'
    ? { method: step.input.method, x: step.input.x, y: step.input.y, button: step.input.button, clicks: step.input.clicks }
    : { method: step.input.method, keys: step.input.keys };
  const observedInput = step.inputMethod === 'mouse_click'
    ? { method: inputReceipt.method, x: inputReceipt.x, y: inputReceipt.y, button: inputReceipt.button, clicks: inputReceipt.clicks }
    : { method: inputReceipt.method, keys: inputReceipt.keys };
  if (canonicalHash(expectedInput) !== canonicalHash(observedInput)) fail('INPUT_TARGET_MISMATCH', 'Input receipt does not match the exact registered input.');
  return boundedValue(inputReceipt, 'input receipt');
}

export async function recordStepInputApplied(ledgerPath, stepId, details, context) {
  const ledger = await readLedger(ledgerPath);
  await assertFreshBindings(ledger, context);
  const step = findStep(ledger, stepId);
  ensurePriorComplete(ledger, step);
  if (step.status !== 'running' || step.phase !== 'input_intent') {
    fail('STEP_STATE_VIOLATION', 'Only an input-armed running step may record applied input.');
  }
  step.inputReceipt = structuredClone(validateInputReceipt(step, details.inputReceipt));
  step.phase = 'input_applied';
  step.inputAppliedAt = new Date().toISOString();
  ledger.updatedAt = new Date().toISOString();
  assertPublicReceiptValue(ledger, 'evidence ledger');
  await atomicWriteJson(ledgerPath, ledger);
  return step;
}

export async function recordStepCaptured(ledgerPath, stepId, details, context) {
  const ledger = await readLedger(ledgerPath);
  await assertFreshBindings(ledger, context);
  const step = findStep(ledger, stepId);
  ensurePriorComplete(ledger, step);
  if (step.status !== 'running' || step.phase !== 'input_applied' || step.attempts < 1 || !step.captures.pre || !step.inputReceipt) fail('STEP_STATE_VIOLATION', 'Only an input-applied running evidence step with a pre-action capture may complete.');
  const post = await captureReceipt(details.postCapture, context.outputRoot);
  if (post.width !== ledger.tuple.capturePixelSize.width || post.height !== ledger.tuple.capturePixelSize.height) {
    fail('VIEWPORT_MISMATCH', 'Post-action capture dimensions do not match the declared viewport.');
  }
  const privacy = assertObject(details.automatedPrivacyVerdict, 'automated privacy verdict');
  const requiredPrivacy = ['visibleDesktopUntouched', 'expectedSurfaceOnly', 'unrelatedTargetsObserved', 'mocked', 'handEdited', 'rendererScanPassed', 'networkPassed', 'listenerOwned', 'postActionRevalidated'];
  if (requiredPrivacy.some((key) => typeof privacy[key] !== 'boolean')) fail('INVALID_PRIVACY_VERDICT', 'Automated privacy verdict is missing required boolean fields.');
  if (!privacy.visibleDesktopUntouched || !privacy.expectedSurfaceOnly || privacy.unrelatedTargetsObserved || privacy.mocked || privacy.handEdited || !privacy.rendererScanPassed || !privacy.networkPassed || !privacy.listenerOwned || !privacy.postActionRevalidated) {
    fail('PRIVACY_VERDICT_FAILED', 'Automated privacy verdict does not permit evidence capture.');
  }
  if (canonicalHash(details.postState) !== canonicalHash(step.expectedSemanticState)) fail('SEMANTIC_STATE_MISMATCH', 'Semantic state after the post-action capture does not match the registered expectation.');
  if (canonicalHash(details.semanticPostState) !== canonicalHash(step.expectedSemanticState)) fail('SEMANTIC_STATE_MISMATCH', 'Semantic post-action state does not match the registered expectation.');
  step.postState = boundedValue(details.postState, 'post-action state');
  step.semanticPostState = boundedValue(details.semanticPostState, 'semantic post-action state');
  step.captures.post = post;
  step.automatedPrivacyVerdict = { ...privacy };
  step.status = 'captured';
  step.phase = 'post_captured';
  step.capturedAt = new Date().toISOString();
  step.failureCode = null;
  step.failurePhase = null;
  ledger.completed = false;
  ledger.updatedAt = new Date().toISOString();
  assertPublicReceiptValue(ledger, 'evidence ledger');
  await atomicWriteJson(ledgerPath, ledger);
  return step;
}

export async function completeStep(ledgerPath, stepId, inspectionVerdict, context) {
  const ledger = await readLedger(ledgerPath);
  await assertFreshBindings(ledger, context);
  const step = findStep(ledger, stepId);
  ensurePriorComplete(ledger, step);
  if (step.status !== 'captured' || !step.captures.pre || !step.captures.post || !step.automatedPrivacyVerdict) {
    fail('STEP_STATE_VIOLATION', 'Only a captured step with both original images may complete inspection.');
  }
  const pre = await captureReceipt(step.captures.pre, context.outputRoot);
  const post = await captureReceipt(step.captures.post, context.outputRoot);
  if (pre.sha256 !== step.captures.pre.sha256 || post.sha256 !== step.captures.post.sha256) fail('STALE_CAPTURE', 'Captured bytes changed before inspection completed.');
  const inspection = assertObject(inspectionVerdict, 'inspection verdict');
  const requiredInspection = ['pixelsInspected', 'sensitiveDataReviewed', 'targetVisible', 'expectedStateVisible', 'noClipping'];
  if (requiredInspection.some((key) => typeof inspection[key] !== 'boolean') || typeof inspection.reviewer !== 'string') {
    fail('INVALID_INSPECTION_VERDICT', 'Inspection verdict is missing required fields.');
  }
  boundedString(inspection.reviewer, 'inspection reviewer', { max: 128 });
  if (requiredInspection.some((key) => inspection[key] !== true)) fail('INSPECTION_FAILED', 'Original image inspection did not approve every required property.');
  step.privacyVerdict = {
    visibleDesktopUntouched: step.automatedPrivacyVerdict.visibleDesktopUntouched,
    expectedSurfaceOnly: step.automatedPrivacyVerdict.expectedSurfaceOnly,
    sensitiveDataReviewed: inspection.sensitiveDataReviewed,
    unrelatedTargetsObserved: step.automatedPrivacyVerdict.unrelatedTargetsObserved,
    mocked: step.automatedPrivacyVerdict.mocked,
    handEdited: step.automatedPrivacyVerdict.handEdited,
    rendererScanPassed: step.automatedPrivacyVerdict.rendererScanPassed,
    networkPassed: step.automatedPrivacyVerdict.networkPassed,
    listenerOwned: step.automatedPrivacyVerdict.listenerOwned,
    postActionRevalidated: step.automatedPrivacyVerdict.postActionRevalidated,
    pixelsInspected: inspection.pixelsInspected,
    targetVisible: inspection.targetVisible,
    expectedStateVisible: inspection.expectedStateVisible,
    noClipping: inspection.noClipping,
    reviewer: inspection.reviewer
  };
  step.status = 'completed';
  step.phase = 'completed';
  step.completedAt = new Date().toISOString();
  step.completionMarker = completionMarkerFor(step);
  ledger.completed = ledger.steps.every((item) => item.status === 'completed');
  ledger.updatedAt = new Date().toISOString();
  assertPublicReceiptValue(ledger, 'evidence ledger');
  await atomicWriteJson(ledgerPath, ledger);
  return step;
}

function completionMarkerFor(step) {
  return `sha256:${canonicalHash({
    id: step.id,
    order: step.order,
    status: step.status,
    phase: step.phase,
    attempts: step.attempts,
    startedAt: step.startedAt,
    inputArmedAt: step.inputArmedAt,
    inputAppliedAt: step.inputAppliedAt,
    capturedAt: step.capturedAt,
    completedAt: step.completedAt,
    targetSelector: step.targetSelector,
    targetAccessibilityName: step.targetAccessibilityName,
    inputMethod: step.inputMethod,
    input: step.input,
    expectedTransition: step.expectedTransition,
    semanticProbe: step.semanticProbe,
    expectedPreState: step.expectedPreState,
    expectedSemanticState: step.expectedSemanticState,
    binding: step.binding,
    preState: step.preState,
    postState: step.postState,
    semanticPostState: step.semanticPostState,
    inputReceipt: step.inputReceipt,
    captures: step.captures,
    automatedPrivacyVerdict: step.automatedPrivacyVerdict,
    privacyVerdict: step.privacyVerdict
  })}`;
}

export async function failStep(ledgerPath, stepId, failureCode) {
  const ledger = await readLedger(ledgerPath);
  const step = findStep(ledger, stepId);
  if (!['running', 'captured', 'pending'].includes(step.status)) fail('STEP_STATE_VIOLATION', 'Only a pending, running, or captured evidence step may fail.');
  step.status = 'failed';
  step.failureCode = boundedString(failureCode, 'failure code', { max: 96, pattern: /^[A-Z0-9_]+$/ });
  step.failurePhase = step.phase;
  step.completedAt = null;
  step.completionMarker = null;
  ledger.completed = false;
  ledger.updatedAt = new Date().toISOString();
  assertPublicReceiptValue(ledger, 'evidence ledger');
  await atomicWriteJson(ledgerPath, ledger);
  return step;
}

export async function resetStepForRetry(ledgerPath, stepId, context = null) {
  const ledger = await readLedger(ledgerPath);
  if (context) await assertFreshBindings(ledger, context);
  const step = findStep(ledger, stepId);
  if (!['failed', 'running'].includes(step.status) || !['pending', 'pre_captured'].includes(step.phase)) {
    fail('AMBIGUOUS_INPUT_RECOVERY', 'A step may reset only before input intent is durably recorded. Start a fresh isolated run after ambiguous input.');
  }
  if (step.attempts >= 3) fail('RETRY_LIMIT', 'Evidence step exhausted its bounded retry allowance.');
  if (ledger.steps.slice(step.order + 1).some((item) => item.status === 'completed')) fail('DOWNSTREAM_EVIDENCE_EXISTS', 'A step cannot reset while downstream evidence remains completed.');
  Object.assign(step, {
    status: 'pending',
    phase: 'pending',
    startedAt: null,
    capturedAt: null,
    completedAt: null,
    failureCode: null,
    failurePhase: null,
    inputArmedAt: null,
    inputAppliedAt: null,
    preState: null,
    postState: null,
    semanticPostState: null,
    inputReceipt: null,
    captures: { pre: null, post: null },
    automatedPrivacyVerdict: null,
    privacyVerdict: null,
    completionMarker: null,
    binding: null
  });
  ledger.completed = false;
  ledger.updatedAt = new Date().toISOString();
  assertPublicReceiptValue(ledger, 'evidence ledger');
  await atomicWriteJson(ledgerPath, ledger);
  return step;
}

export async function resumeStatus(ledgerPath, context) {
  const ledger = await readLedger(ledgerPath);
  await assertFreshBindings(ledger, context);
  for (const step of ledger.steps) {
    if (step.status === 'captured') {
      const pre = await captureReceipt(step.captures.pre, context.outputRoot);
      const post = await captureReceipt(step.captures.post, context.outputRoot);
      if (pre.sha256 !== step.captures.pre.sha256 || post.sha256 !== step.captures.post.sha256) fail('STALE_CAPTURE', 'Captured step bytes changed before inspection.');
      return { reusable: step.order, resumeFrom: step.id, status: step.status, phase: step.phase, action: 'inspect', completed: false };
    }
    if (step.status !== 'completed') {
      if (['input_intent', 'input_applied', 'post_captured'].includes(step.phase)) {
        return { reusable: step.order, resumeFrom: step.id, status: step.status, phase: step.phase, action: 'restart_run', completed: false };
      }
      const action = step.status === 'failed' || step.status === 'running' ? 'reset' : 'capture';
      return { reusable: step.order, resumeFrom: step.id, status: step.status, phase: step.phase, action, completed: false };
    }
    const marker = step.completionMarker;
    if (typeof marker !== 'string' || marker !== completionMarkerFor(step)) fail('STALE_STEP', 'Completed step is missing or does not match its exact completion marker.');
    const pre = await captureReceipt(step.captures.pre, context.outputRoot);
    const post = await captureReceipt(step.captures.post, context.outputRoot);
    if (pre.sha256 !== step.captures.pre.sha256 || post.sha256 !== step.captures.post.sha256) fail('STALE_CAPTURE', 'Completed step capture bytes changed after completion.');
  }
  return { reusable: ledger.steps.length, resumeFrom: null, status: 'completed', phase: 'completed', completed: true };
}
