import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EvidenceError,
  assertExactKeys,
  assertFrozenDirectory,
  assertObject,
  assertPinnedArtifact,
  atomicWriteJson,
  boundedString,
  canonicalHash,
  fail,
  freezeDirectory,
  inspectPng,
  readJson,
  strictChild,
  toPublicFailure
} from './common.mjs';
import { assertSingleCdpTarget, connectExactCdp } from './cdp-client.mjs';
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
} from './ledger.mjs';
import {
  assertWindowCaptureEnvelope,
  captureWindow,
  connectMcp,
  discoverWindow,
  performBackgroundInput,
  preflight,
  resolveOwnedWindow
} from './mcp-client.mjs';
import {
  buildApplicationArguments,
  completeRunInitialization,
  initializeRunRoot,
  ledgerDefinition,
  loadPlan,
  verifyRunOwnership,
  verifyIsolationReceipt,
  verifyPackagedReceipt
} from './plan.mjs';
import {
  assertCdpListenerOwned,
  assertCdpPortVacant,
  captureProcessTree,
  childFirst,
  expandOwnedProcessTree,
  processesForExecutableSince,
  processTreeFromInventory,
  revalidateProcessTree,
  sameProcessIdentity,
  selectEvidenceLaunchRoot,
  windowsCommandLine,
  windowsEvidenceProcessCandidates,
  windowsProcessInventory,
  windowsTcpListenerInventory
} from './process-identity.mjs';
import { acquireRunLock, recoverRunLock, withRunLock } from './run-lock.mjs';

const RUNTIME_FILE = 'runtime-state.json';
const LEDGER_FILE = 'per-click-ledger.json';

function runtimePath(plan) {
  return path.join(plan.runRoot, RUNTIME_FILE);
}

function ledgerPath(plan) {
  return path.join(plan.runRoot, LEDGER_FILE);
}

function desktopName(runId) {
  return `HGE-${canonicalHash(runId).slice(0, 24)}`;
}

function desktopExists(inventory, name) {
  return Array.isArray(inventory) && inventory.some((item) => item === name || item?.name === name || item?.desktop === name);
}

async function waitForWindow(client, plan, rootPid, savedTree, executablePath) {
  const deadline = Date.now() + plan.window.timeoutMs;
  let tree = savedTree;
  do {
    tree = await revalidateProcessTree(tree, rootPid, executablePath);
    const result = await client.callTool('list_headless_windows', { name: desktopName(plan.runId) });
    try {
      const windowValue = resolveOwnedWindow(Array.isArray(result.windows) ? result.windows : [], {
        ownedProcessIds: tree.map((item) => item.pid),
        titlePattern: plan.window.titlePattern,
        classPattern: plan.window.classPattern
      });
      return { window: windowValue, processTree: tree };
    } catch (error) {
      if (!(error instanceof EvidenceError) || error.code !== 'WINDOW_NOT_FOUND') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  fail('WINDOW_TIMEOUT', 'No unique owned application window appeared before the deadline.');
}

async function waitForProcessTree(rootPid, executablePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      return await captureProcessTree(rootPid, executablePath);
    } catch (error) {
      if (!(error instanceof EvidenceError) || error.code !== 'PROCESS_PROOF_FAILED') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  fail('PROCESS_PROOF_FAILED', 'Launched process identity did not become provable before the deadline.');
}

async function waitForOwnedCdpListener(plan, processTree, rootPid, executablePath) {
  const deadline = Date.now() + plan.cdp.timeoutMs;
  let tree = processTree;
  do {
    tree = await revalidateProcessTree(tree, rootPid, executablePath);
    try {
      const listener = assertCdpListenerOwned(await windowsTcpListenerInventory(plan.cdp.port), plan.cdp.port, tree.map((item) => item.pid));
      return { listener, processTree: tree };
    } catch (error) {
      if (!(error instanceof EvidenceError) || error.code !== 'CDP_LISTENER_OWNERSHIP_FAILED') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  fail('CDP_LISTENER_TIMEOUT', 'No exact owned loopback CDP listener appeared before the deadline.');
}

function assertSameWindow(expected, observed) {
  if (!expected || !observed || expected.hwnd !== observed.hwnd || expected.processId !== observed.processId ||
      expected.width !== observed.width || expected.height !== observed.height || expected.className !== observed.className) {
    fail('WINDOW_IDENTITY_CHANGED', 'The exact owned application window identity changed during evidence collection.');
  }
  return observed;
}

async function waitForIsolationReceipt(plan, paths) {
  const deadline = Date.now() + plan.window.timeoutMs;
  do {
    try {
      return await verifyIsolationReceipt(plan, paths);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  fail('ISOLATION_RECEIPT_TIMEOUT', 'Application isolation receipt did not appear before the deadline.');
}

function runtimeDocument(plan, paths, pid, processTree, windowValue, frozenPackage, applicationExecutablePath, cdpListener = null) {
  return {
    schemaVersion: 1,
    runId: plan.runId,
    route: plan.route,
    captureKind: plan.captureKind,
    desktop: desktopName(plan.runId),
    pid,
    processTree,
    cdpListener,
    hwnd: windowValue?.hwnd ?? null,
    window: windowValue ? {
      title: windowValue.title,
      className: windowValue.className,
      processId: windowValue.processId,
      width: windowValue.width,
      height: windowValue.height,
      dpi: windowValue.dpi
    } : null,
    applicationExecutablePath,
    frozenPackage,
    appDataPath: paths.appDataPath,
    userDataPath: paths.userDataPath,
    cdp: { endpoint: plan.cdp.endpoint, expectedUrl: plan.cdp.expectedUrl },
    sourceSha: plan.sourceSha,
    artifact: plan.artifact,
    createdAt: new Date().toISOString(),
    prepared: false,
    cleaned: false,
    cleanup: null
  };
}

function validateRuntimeDocument(plan, state, { allowUnprepared = false } = {}) {
  if (state?.schemaVersion !== 1 || state.runId !== plan.runId || state.route !== plan.route || state.captureKind !== 'window') {
    fail('INVALID_RUNTIME_STATE', 'Runtime state does not match the evidence plan.');
  }
  if (state.cleaned === true) fail('RUNTIME_CLEANED', 'Runtime state has already been cleaned.');
  if (!Number.isInteger(state.pid) || !Array.isArray(state.processTree)) fail('INVALID_RUNTIME_STATE', 'Runtime state is missing process identity proof.');
  if (!allowUnprepared && state.prepared !== true) fail('PREPARE_INCOMPLETE', 'Evidence runtime has not completed prepare.');
  if (state.prepared === true && (!state.cdpListener || state.cdpListener.port !== plan.cdp.port || !Number.isInteger(state.cdpListener.owningPid))) {
    fail('INVALID_RUNTIME_STATE', 'Prepared runtime state is missing exact CDP listener ownership proof.');
  }
  const expectedExecutable = path.join(plan.runRoot, 'frozen-package', path.basename(plan.application.executablePath));
  if (path.resolve(state.applicationExecutablePath) !== path.resolve(expectedExecutable) || state.sourceSha !== plan.sourceSha || canonicalHash(state.artifact) !== canonicalHash(plan.artifact)) {
    fail('STALE_RUNTIME_STATE', 'Runtime state no longer matches source or packaged artifact bindings.');
  }
  if (state.desktop !== desktopName(plan.runId) || path.resolve(state.appDataPath) !== path.resolve(plan.runRoot, plan.isolation.appDataDirectory) ||
      path.resolve(state.userDataPath) !== path.resolve(plan.runRoot, plan.isolation.userDataDirectory)) {
    fail('STALE_RUNTIME_STATE', 'Runtime desktop or isolated profile paths no longer match the plan.');
  }
  return state;
}

async function readRuntime(plan, options = {}) {
  await verifyRunOwnership(plan);
  const state = validateRuntimeDocument(plan, await readJson(runtimePath(plan)), options);
  await assertFrozenDirectory(state.frozenPackage);
  await assertPinnedArtifact(state.applicationExecutablePath, plan.artifact.primary.sha256);
  return state;
}

async function freezePackagedApplication(plan) {
  const sourceRoot = path.dirname(plan.application.executablePath);
  const destinationRoot = (await strictChild(path.join(plan.runRoot, 'frozen-package'), plan.runRoot, 'frozen package directory')).child;
  const frozenPackage = await freezeDirectory(sourceRoot, destinationRoot);
  const executablePath = (await strictChild(path.join(destinationRoot, path.basename(plan.application.executablePath)), destinationRoot, 'frozen packaged executable')).child;
  const appAsarRelative = path.relative(sourceRoot, plan.artifactPaths['app-asar']);
  const appAsarPath = (await strictChild(path.join(destinationRoot, appAsarRelative), destinationRoot, 'frozen packaged app.asar')).child;
  await assertPinnedArtifact(executablePath, plan.artifact.primary.sha256);
  await assertPinnedArtifact(appAsarPath, plan.artifact.components.find((item) => item.id === 'app-asar').sha256);
  return { frozenPackage, executablePath };
}

async function prepare(plan) {
  await assertFreshBindings({ source: { sha: plan.sourceSha }, artifact: plan.artifact }, { repoRoot: plan.repoRoot, artifactPaths: plan.artifactPaths });
  await verifyPackagedReceipt(plan);
  const client = await connectMcp(plan.mcp.endpoint, { timeoutMs: plan.mcp.timeoutMs });
  await preflight(client);
  const desktop = desktopName(plan.runId);
  const existing = await client.callTool('list_headless_desktops', {});
  if (desktopExists(existing.desktops, desktop)) fail('DESKTOP_EXISTS', 'Owned hidden desktop name already exists.');
  assertCdpPortVacant(await windowsTcpListenerInventory(plan.cdp.port), plan.cdp.port);
  const baselineProcesses = await windowsProcessInventory();
  const initializationOwner = baselineProcesses.find((item) => item.pid === process.pid);
  if (!initializationOwner?.creationDate || !initializationOwner?.executablePath) {
    fail('RUN_LOCK_IDENTITY_FAILED', 'Prepare process identity is not provable before run initialization.');
  }
  const paths = await initializeRunRoot(plan, { retainInitializationBarrier: true, initializationOwner });
  const prepareLock = await acquireRunLock(plan, 'prepare');
  try {
    await completeRunInitialization(plan);
    const frozen = await freezePackagedApplication(plan);
    return await prepareLocked(plan, client, desktop, paths, baselineProcesses, frozen);
  } finally {
    await prepareLock.release();
  }
}

async function prepareLocked(plan, client, desktop, paths, baselineProcesses, frozen) {
  await verifyRunOwnership(plan);
  await assertFrozenDirectory(frozen.frozenPackage);
  const argumentsValue = buildApplicationArguments(plan, paths);
  const command = windowsCommandLine(frozen.executablePath, argumentsValue);
  const recoveryMarkerPath = path.join(plan.runRoot, 'launch-recovery.json');
  const launchStartedAt = new Date().toISOString();
  await atomicWriteJson(recoveryMarkerPath, {
    schemaVersion: 1,
    runId: plan.runId,
    desktop,
    state: 'armed',
    pid: null,
    launchStartedAt,
    launchReturnedAt: null,
    pidAbsentBeforeLaunch: null,
    sourceSha: plan.sourceSha,
    executableSha256: plan.artifact.primary.sha256,
    applicationExecutablePath: frozen.executablePath,
    frozenPackage: frozen.frozenPackage,
    processTree: null
  });
  let launched = null;
  let state = null;
  let launchReturnedAt = null;
  let pidAbsentBeforeLaunch = null;
  try {
    launched = await client.callTool('launch_on_headless_desktop', { name: desktop, command });
    if (!Number.isInteger(launched.pid) || launched.pid <= 0) fail('INVALID_LAUNCH_RESULT', 'Hidden-desktop launch did not return a positive PID.');
    launchReturnedAt = new Date().toISOString();
    pidAbsentBeforeLaunch = !baselineProcesses.some((item) => item.pid === launched.pid);
    await atomicWriteJson(recoveryMarkerPath, {
      schemaVersion: 1,
      runId: plan.runId,
      desktop,
      state: 'pid_observed',
      pid: launched.pid,
      launchStartedAt,
      launchReturnedAt,
      pidAbsentBeforeLaunch,
      sourceSha: plan.sourceSha,
      executableSha256: plan.artifact.primary.sha256,
      applicationExecutablePath: frozen.executablePath,
      frozenPackage: frozen.frozenPackage,
      processTree: null
    });
    if (!pidAbsentBeforeLaunch) fail('LAUNCH_PID_COLLISION', 'Launch returned a PID that existed before the owned launch attempt.');
    await assertFrozenDirectory(frozen.frozenPackage);
    let processTree = await waitForProcessTree(launched.pid, frozen.executablePath, plan.window.timeoutMs);
    state = runtimeDocument(plan, paths, launched.pid, processTree, null, frozen.frozenPackage, frozen.executablePath);
    await atomicWriteJson(recoveryMarkerPath, {
      schemaVersion: 1,
      runId: plan.runId,
      desktop,
      state: 'identity_captured',
      pid: launched.pid,
      launchStartedAt,
      launchReturnedAt,
      pidAbsentBeforeLaunch,
      sourceSha: plan.sourceSha,
      executableSha256: plan.artifact.primary.sha256,
      applicationExecutablePath: frozen.executablePath,
      frozenPackage: frozen.frozenPackage,
      processTree
    });
    await atomicWriteJson(runtimePath(plan), state);
    let windowValue;
    ({ window: windowValue, processTree } = await waitForWindow(client, plan, launched.pid, processTree, frozen.executablePath));
    assertWindowCaptureEnvelope(windowValue, plan.tuple);
    state.processTree = processTree;
    state.hwnd = windowValue.hwnd;
    state.window = {
      title: windowValue.title,
      className: windowValue.className,
      processId: windowValue.processId,
      width: windowValue.width,
      height: windowValue.height,
      dpi: windowValue.dpi
    };
    const listenerProof = await waitForOwnedCdpListener(plan, processTree, launched.pid, frozen.executablePath);
    processTree = listenerProof.processTree;
    state.processTree = processTree;
    state.cdpListener = listenerProof.listener;
    await atomicWriteJson(runtimePath(plan), state);
    await waitForIsolationReceipt(plan, paths);
    const cdp = await connectExactCdp(plan.cdp.endpoint, plan.cdp.expectedUrl, { timeoutMs: plan.cdp.timeoutMs, allowedOrigins: plan.allowedNetworkOrigins });
    try {
      await cdp.assertLiveTuple(plan.tuple);
      await cdp.privacyScan(plan.privacyPatterns);
      await resourcePrivacyCount(cdp, plan.allowedNetworkOrigins);
      await assertCdpContinuity(plan, cdp);
    } finally {
      await cdp.close();
    }
    state.prepared = true;
    await atomicWriteJson(runtimePath(plan), state);
    await initLedger(ledgerPath(plan), ledgerDefinition(plan), {
      repoRoot: plan.repoRoot,
      artifactPaths: plan.artifactPaths,
      outputRoot: plan.outputRoot
    });
    await fsp.rm(recoveryMarkerPath, { force: true });
    return { ok: true, runId: plan.runId, pid: launched.pid, desktop, prepared: true, captured: false };
  } catch (error) {
    if (state) {
      try {
        await cleanupOwnedState(plan, state, client);
        await fsp.rm(recoveryMarkerPath, { force: true });
      } catch (cleanupError) {
        await atomicWriteJson(path.join(plan.runRoot, 'prepare-cleanup-failure.json'), {
          schemaVersion: 1,
          runId: plan.runId,
          prepareFailureCode: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR',
          cleanupFailureCode: typeof cleanupError?.code === 'string' ? cleanupError.code : 'UNEXPECTED_ERROR',
          manualRecoveryRequired: true
        });
      }
    } else if (launched?.pid) {
      launchReturnedAt ||= new Date().toISOString();
      pidAbsentBeforeLaunch ??= !baselineProcesses.some((item) => item.pid === launched.pid);
      await atomicWriteJson(recoveryMarkerPath, {
        schemaVersion: 1,
        runId: plan.runId,
        desktop,
        state: 'pid_observed',
        pid: launched.pid,
        launchStartedAt,
        launchReturnedAt,
        pidAbsentBeforeLaunch,
        sourceSha: plan.sourceSha,
        executableSha256: plan.artifact.primary.sha256,
        applicationExecutablePath: frozen.executablePath,
        frozenPackage: frozen.frozenPackage,
        processTree: null
      }).catch(() => {});
      let cleanupFailureCode = 'IDENTITY_NOT_CAPTURED';
      if (pidAbsentBeforeLaunch) {
        try {
          const processTree = await waitForProcessTree(launched.pid, frozen.executablePath, plan.window.timeoutMs);
          const recoveryState = runtimeDocument(plan, paths, launched.pid, processTree, null, frozen.frozenPackage, frozen.executablePath);
          await cleanupOwnedState(plan, recoveryState, client);
          await fsp.rm(recoveryMarkerPath, { force: true });
          cleanupFailureCode = null;
        } catch (cleanupError) {
          cleanupFailureCode = typeof cleanupError?.code === 'string' ? cleanupError.code : 'UNEXPECTED_ERROR';
        }
      }
      if (cleanupFailureCode) {
        await atomicWriteJson(path.join(plan.runRoot, 'prepare-cleanup-failure.json'), {
          schemaVersion: 1,
          runId: plan.runId,
          prepareFailureCode: typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR',
          cleanupFailureCode,
          manualRecoveryRequired: true
        }).catch(() => {});
      }
    }
    throw error;
  }
}

function stepOutputNames(step, order, attempt) {
  const prefix = `${String(order + 1).padStart(3, '0')}-${step.id}-attempt-${attempt}`;
  return {
    pre: `steps/${prefix}-pre.png`,
    post: `steps/${prefix}-post.png`
  };
}

async function resourcePrivacyCount(cdp, allowedOrigins) {
  const expression = `(() => { const a = new Set(${JSON.stringify(allowedOrigins)}); const local = new Set(['file:', 'data:', 'blob:']); return performance.getEntriesByType('resource').filter(e => { try { const u = new URL(e.name); return !local.has(u.protocol) && !a.has(u.origin); } catch { return true; } }).length; })()`;
  const count = await cdp.evaluate(expression);
  if (!Number.isInteger(count) || count < 0) fail('INVALID_PRIVACY_RESULT', 'Resource privacy probe returned an invalid count.');
  if (count > 0) fail('UNEXPECTED_NETWORK_RESOURCE', 'Renderer loaded one or more resources outside the allowlisted origins.');
  return count;
}

async function assertCdpContinuity(plan, cdp) {
  const target = await assertSingleCdpTarget(plan.cdp.endpoint, plan.cdp.expectedUrl, plan.cdp.timeoutMs);
  if (target.webSocketDebuggerUrl !== cdp.url) fail('CDP_TARGET_CHANGED', 'The sole exact CDP page changed during evidence collection.');
  return target;
}

async function revalidateEvidenceBoundary({ plan, state, client, cdp, processTree, expectedWindow }) {
  await assertFrozenDirectory(state.frozenPackage);
  const tree = await revalidateProcessTree(processTree, state.pid, state.applicationExecutablePath);
  if (canonicalHash(tree) !== canonicalHash(state.processTree)) {
    state.processTree = tree;
    await atomicWriteJson(runtimePath(plan), state);
  }
  const listener = assertCdpListenerOwned(await windowsTcpListenerInventory(plan.cdp.port), plan.cdp.port, tree.map((item) => item.pid));
  if (state.cdpListener && (listener.owningPid !== state.cdpListener.owningPid || listener.port !== state.cdpListener.port)) {
    fail('CDP_LISTENER_OWNERSHIP_FAILED', 'CDP listener ownership changed after prepare.');
  }
  await assertCdpContinuity(plan, cdp);
  await cdp.assertLiveTuple(plan.tuple);
  const privacy = await cdp.privacyScan(plan.privacyPatterns);
  await resourcePrivacyCount(cdp, plan.allowedNetworkOrigins);
  const windowValue = await discoverWindow(client, state.desktop, {
    ownedProcessIds: tree.map((item) => item.pid),
    titlePattern: plan.window.titlePattern,
    classPattern: plan.window.classPattern
  });
  if (expectedWindow) assertSameWindow(expectedWindow, windowValue);
  assertWindowCaptureEnvelope(windowValue, plan.tuple);
  return { processTree: tree, listener, privacy, window: windowValue };
}

async function runStep(plan, stepId) {
  const state = await readRuntime(plan);
  if (state.prepared !== true) fail('PREPARE_INCOMPLETE', 'Evidence runtime has not completed isolation and exact-target preflight.');
  const ledger = await readLedger(ledgerPath(plan));
  assertLedgerPlanBinding(ledger, ledgerDefinition(plan));
  await assertFreshBindings(ledger, { repoRoot: plan.repoRoot, artifactPaths: plan.artifactPaths, outputRoot: plan.outputRoot });
  await verifyPackagedReceipt(plan);
  const step = plan.steps.find((item) => item.id === stepId);
  const ledgerStep = ledger.steps.find((item) => item.id === stepId);
  if (!step || !ledgerStep) fail('UNKNOWN_STEP', 'Step id is not registered in both plan and ledger.');
  if (ledgerStep.status !== 'pending') fail('STEP_STATE_VIOLATION', 'Only a pending step can run.');
  const client = await connectMcp(plan.mcp.endpoint, { timeoutMs: plan.mcp.timeoutMs });
  await preflight(client);
  let processTree = await revalidateProcessTree(state.processTree, state.pid, state.applicationExecutablePath);
  assertCdpListenerOwned(await windowsTcpListenerInventory(plan.cdp.port), plan.cdp.port, processTree.map((item) => item.pid));
  const cdp = await connectExactCdp(plan.cdp.endpoint, plan.cdp.expectedUrl, { timeoutMs: plan.cdp.timeoutMs, allowedOrigins: plan.allowedNetworkOrigins });
  let started = false;
  try {
    let boundary = await revalidateEvidenceBoundary({ plan, state, client, cdp, processTree, expectedWindow: null });
    processTree = boundary.processTree;
    const windowValue = boundary.window;
    if (state.hwnd !== windowValue.hwnd || state.window?.processId !== windowValue.processId) {
      fail('WINDOW_IDENTITY_CHANGED', 'The prepared window no longer matches the exact dynamically resolved HWND and process.');
    }
    if (step.input.method === 'mouse_click' && (step.input.x >= plan.tuple.capturePixelSize.width || step.input.y >= plan.tuple.capturePixelSize.height)) fail('INVALID_INPUT', 'Mouse target lies outside the live client bounds.');
    const accessible = await cdp.accessibleTarget(step.target.selector);
    if (accessible.name !== step.target.accessibleName) fail('ACCESSIBLE_NAME_MISMATCH', 'Live target accessible name does not match the registered step.');
    await cdp.assertInputTarget(step.target.selector, step.input, plan.tuple.scale);
    const preState = await cdp.semanticProbe(step.semantic.probe);
    const attempt = ledgerStep.attempts + 1;
    const names = stepOutputNames(step, ledgerStep.order, attempt);
    const prePath = (await strictChild(path.join(plan.outputRoot, names.pre), plan.outputRoot, 'pre-action capture')).child;
    const postPath = (await strictChild(path.join(plan.outputRoot, names.post), plan.outputRoot, 'post-action capture')).child;
    await fsp.mkdir(path.dirname(prePath), { recursive: true });
    await captureWindow(client, { hwnd: windowValue.hwnd, outputPath: prePath, clientOnly: true });
    const preMedia = await inspectPng(prePath, { requireNonblank: true });
    boundary = await revalidateEvidenceBoundary({ plan, state, client, cdp, processTree, expectedWindow: windowValue });
    processTree = boundary.processTree;
    await startStep(ledgerPath(plan), step.id, {
      preState,
      preCapture: { path: names.pre, sha256: preMedia.sha256, width: preMedia.width, height: preMedia.height }
    }, { repoRoot: plan.repoRoot, artifactPaths: plan.artifactPaths, outputRoot: plan.outputRoot });
    started = true;
    const bindingContext = { repoRoot: plan.repoRoot, artifactPaths: plan.artifactPaths, outputRoot: plan.outputRoot };
    await armStepInput(ledgerPath(plan), step.id, bindingContext);
    const inputReceipt = await performBackgroundInput(client, windowValue.hwnd, step.input);
    const boundInputReceipt = { ...inputReceipt, accessibleName: accessible.name, accessibleRole: accessible.role };
    await recordStepInputApplied(ledgerPath(plan), step.id, { inputReceipt: boundInputReceipt }, bindingContext);
    const semanticPostState = await cdp.pollProbe(step.semantic.probe, step.semantic.afterEquals, {
      intervalMs: step.semantic.pollIntervalMs,
      timeoutMs: step.semantic.timeoutMs
    });
    boundary = await revalidateEvidenceBoundary({ plan, state, client, cdp, processTree, expectedWindow: windowValue });
    processTree = boundary.processTree;
    const preCaptureState = await cdp.semanticProbe(step.semantic.probe);
    if (canonicalHash(preCaptureState) !== canonicalHash(step.semantic.afterEquals)) {
      fail('SEMANTIC_STATE_MISMATCH', 'Semantic state changed before the post-action capture.');
    }
    await captureWindow(client, { hwnd: windowValue.hwnd, outputPath: postPath, clientOnly: true });
    const postMedia = await inspectPng(postPath, { requireNonblank: true });
    boundary = await revalidateEvidenceBoundary({ plan, state, client, cdp, processTree, expectedWindow: windowValue });
    processTree = boundary.processTree;
    const postState = await cdp.semanticProbe(step.semantic.probe);
    const network = cdp.networkSummary();
    if (!network.passed) fail('UNEXPECTED_NETWORK_REQUEST', 'Unexpected network activity occurred during the interaction.');
    await recordStepCaptured(ledgerPath(plan), step.id, {
      postState,
      semanticPostState,
      postCapture: { path: names.post, sha256: postMedia.sha256, width: postMedia.width, height: postMedia.height },
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
    }, { repoRoot: plan.repoRoot, artifactPaths: plan.artifactPaths, outputRoot: plan.outputRoot });
    return { ok: true, runId: plan.runId, stepId: step.id, status: 'captured', inspectionRequired: true };
  } catch (error) {
    if (started) await failStep(ledgerPath(plan), step.id, typeof error?.code === 'string' ? error.code : 'UNEXPECTED_ERROR').catch(() => {});
    throw error;
  } finally {
    await cdp.close();
  }
}

async function inspectStep(plan, stepId, inspectionPath) {
  await verifyRunOwnership(plan);
  const inspection = await readJson(inspectionPath, 64 * 1024);
  assertExactKeys(assertObject(inspection, 'inspection receipt'), new Set([
    'schemaVersion', 'stepId', 'preSha256', 'postSha256', 'pixelsInspected',
    'sensitiveDataReviewed', 'targetVisible', 'expectedStateVisible', 'noClipping', 'reviewer'
  ]), 'inspection receipt');
  if (inspection.schemaVersion !== 1 || inspection.stepId !== stepId) fail('INVALID_INSPECTION_VERDICT', 'Inspection receipt does not match the requested step.');
  const ledger = await readLedger(ledgerPath(plan));
  assertLedgerPlanBinding(ledger, ledgerDefinition(plan));
  await verifyPackagedReceipt(plan);
  const step = ledger.steps.find((item) => item.id === stepId);
  if (!step || step.status !== 'captured' || inspection.preSha256 !== step.captures.pre?.sha256 || inspection.postSha256 !== step.captures.post?.sha256) {
    fail('INVALID_INSPECTION_VERDICT', 'Inspection receipt does not bind both original capture hashes.');
  }
  const completed = await completeStep(ledgerPath(plan), stepId, inspection, {
    repoRoot: plan.repoRoot,
    artifactPaths: plan.artifactPaths,
    outputRoot: plan.outputRoot
  });
  return { ok: true, runId: plan.runId, stepId, status: completed.status, completionMarker: completed.completionMarker };
}

async function resetStep(plan, stepId) {
  await verifyRunOwnership(plan);
  const ledger = await readLedger(ledgerPath(plan));
  assertLedgerPlanBinding(ledger, ledgerDefinition(plan));
  await verifyPackagedReceipt(plan);
  const result = await resetStepForRetry(ledgerPath(plan), stepId, {
    repoRoot: plan.repoRoot,
    artifactPaths: plan.artifactPaths,
    outputRoot: plan.outputRoot
  });
  return { ok: true, runId: plan.runId, stepId, status: result.status, attempts: result.attempts };
}

async function status(plan) {
  await verifyRunOwnership(plan);
  const ledger = await readLedger(ledgerPath(plan));
  assertLedgerPlanBinding(ledger, ledgerDefinition(plan));
  await verifyPackagedReceipt(plan);
  return { ok: true, runId: plan.runId, ...(await resumeStatus(ledgerPath(plan), {
    repoRoot: plan.repoRoot,
    artifactPaths: plan.artifactPaths,
    outputRoot: plan.outputRoot
  })) };
}

async function waitForIdentityGone(identity, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const live = (await windowsProcessInventory()).find((candidate) => candidate.pid === identity.pid);
    if (!live || !sameProcessIdentity(identity, live)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  fail('PROCESS_TERMINATION_FAILED', 'An owned process identity remained live after bounded termination.');
}

async function terminateOwnedIdentity(client, identity) {
  const live = (await windowsProcessInventory()).find((candidate) => candidate.pid === identity.pid);
  if (!live) return false;
  if (!sameProcessIdentity(identity, live)) fail('PROCESS_PROOF_FAILED', 'Cleanup process identity changed before termination.');
  let result;
  try {
    result = await client.callTool('kill_process', { pid: identity.pid, force: false });
  } catch (error) {
    const after = (await windowsProcessInventory()).find((candidate) => candidate.pid === identity.pid);
    if (!after || !sameProcessIdentity(identity, after)) return false;
    throw error;
  }
  if (result.count !== 1 || !Array.isArray(result.killed) || result.killed.length !== 1 || result.killed[0]?.pid !== identity.pid || (Array.isArray(result.errors) && result.errors.length)) {
    fail('PROCESS_TERMINATION_FAILED', 'Owned process termination did not confirm exactly one matching PID.');
  }
  await waitForIdentityGone(identity);
  return true;
}

export function validateCleanupWindowOwnership(visibleWindows, ownedProcessIds) {
  if (!Array.isArray(visibleWindows) || !Array.isArray(ownedProcessIds) ||
      !ownedProcessIds.every((pid) => Number.isInteger(pid) && pid > 0)) {
    fail('INVALID_CLEANUP_INVENTORY', 'Cleanup window ownership inventory is invalid.');
  }
  const owned = new Set(ownedProcessIds);
  if (visibleWindows.some((item) => !owned.has(item?.process_id))) {
    fail('UNRELATED_WINDOW', 'Cleanup stopped because the hidden desktop contains an unowned visible window.');
  }
  return { shouldResolveWindow: owned.size > 0, ownedProcessIds: [...owned] };
}

async function cleanupOwnedState(plan, rawState, providedClient = null) {
  await verifyRunOwnership(plan);
  const state = validateRuntimeDocument(plan, rawState, { allowUnprepared: true });
  const client = providedClient || await connectMcp(plan.mcp.endpoint, { timeoutMs: plan.mcp.timeoutMs });
  await preflight(client);
  const processInventory = await windowsProcessInventory();
  const currentByPid = new Map(processInventory.map((item) => [item.pid, item]));
  const savedRoot = state.processTree.find((item) => item.pid === state.pid);
  const rootCurrent = currentByPid.get(state.pid);
  let tree = expandOwnedProcessTree(processInventory, state.processTree);
  if (rootCurrent) {
    if (!sameProcessIdentity(savedRoot, rootCurrent)) fail('PROCESS_PROOF_FAILED', 'Cleanup root PID no longer identifies the launched process.');
    tree = expandOwnedProcessTree(processInventory, await captureProcessTree(state.pid, state.applicationExecutablePath));
  }
  const ownedLive = new Set(tree
    .filter((identity) => sameProcessIdentity(identity, currentByPid.get(identity.pid)))
    .map((identity) => identity.pid));
  for (const identity of tree) ownedLive.add(identity.pid);
  const inventoryBefore = await client.callTool('list_headless_windows', { name: state.desktop });
  const visibleBefore = Array.isArray(inventoryBefore.windows)
    ? inventoryBefore.windows.filter((item) => item?.width > 0 && item?.height > 0 && item?.handle > 0)
    : [];
  const cleanupWindowOwnership = validateCleanupWindowOwnership(visibleBefore, [...ownedLive]);
  let windowValue = null;
  if (cleanupWindowOwnership.shouldResolveWindow) {
    try {
      windowValue = resolveOwnedWindow(visibleBefore, {
        ownedProcessIds: cleanupWindowOwnership.ownedProcessIds,
        titlePattern: plan.window.titlePattern,
        classPattern: plan.window.classPattern
      });
    } catch (error) {
      if (!(error instanceof EvidenceError) || error.code !== 'WINDOW_NOT_FOUND') throw error;
    }
  }
  if (windowValue) {
    await client.callTool('win_send_keys', { hwnd: windowValue.hwnd, keys: ['alt', 'f4'] });
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  const afterCloseInventory = await windowsProcessInventory();
  const afterCloseByPid = new Map(afterCloseInventory.map((item) => [item.pid, item]));
  const rootAfterClose = afterCloseByPid.get(state.pid);
  if (rootAfterClose && !sameProcessIdentity(savedRoot, rootAfterClose)) fail('PROCESS_PROOF_FAILED', 'Cleanup root PID changed identity after the graceful close attempt.');
  tree = expandOwnedProcessTree(afterCloseInventory, state.processTree);
  for (const item of childFirst(tree, state.pid)) {
    await terminateOwnedIdentity(client, item);
  }
  const windowsAfter = await client.callTool('list_headless_windows', { name: state.desktop });
  const visibleAfter = Array.isArray(windowsAfter.windows) ? windowsAfter.windows.filter((item) => item?.width > 0 && item?.height > 0) : [];
  if (visibleAfter.length) fail('WINDOWS_REMAIN', 'Cleanup stopped because visible windows remain on the owned desktop.');
  const closed = await client.callTool('close_headless_desktop', { name: state.desktop });
  if (closed.closed !== true) fail('DESKTOP_CLOSE_FAILED', 'Owned hidden desktop did not report closed=true.');
  await verifyRunOwnership(plan);
  const appData = await strictChild(state.appDataPath, plan.runRoot, 'isolated appData directory');
  const userData = await strictChild(state.userDataPath, plan.runRoot, 'isolated userData directory');
  if (path.basename(appData.child) !== plan.isolation.appDataDirectory || path.basename(userData.child) !== plan.isolation.userDataDirectory) {
    fail('PROFILE_CLEANUP_REFUSED', 'Isolated data directory identity changed before cleanup.');
  }
  await fsp.rm(appData.child, { recursive: true, force: true });
  await fsp.rm(userData.child, { recursive: true, force: true });
  const cleanedState = {
    schemaVersion: 1,
    runId: plan.runId,
    route: plan.route,
    captureKind: plan.captureKind,
    sourceSha: plan.sourceSha,
    artifact: plan.artifact,
    cleaned: true,
    cleanup: {
      completedAt: new Date().toISOString(),
      ownedOnly: true,
      desktopClosed: true,
      isolatedProfilesPurged: true,
      evidenceRetained: true
    }
  };
  await atomicWriteJson(runtimePath(plan), cleanedState);
  return { ok: true, runId: plan.runId, cleaned: true, isolatedProfilesPurged: true, evidenceRetained: true };
}

async function cleanup(plan) {
  return cleanupOwnedState(plan, await readRuntime(plan, { allowUnprepared: true }));
}

export function validateLaunchRecoveryMarker(plan, value) {
  const marker = assertObject(value, 'launch recovery marker');
  assertExactKeys(marker, new Set([
    'schemaVersion', 'runId', 'desktop', 'state', 'pid', 'launchStartedAt', 'launchReturnedAt',
    'pidAbsentBeforeLaunch', 'sourceSha', 'executableSha256', 'applicationExecutablePath', 'frozenPackage', 'processTree'
  ]), 'launch recovery marker');
  if (marker.schemaVersion !== 1 || marker.runId !== plan.runId || marker.desktop !== desktopName(plan.runId) ||
      marker.sourceSha !== plan.sourceSha || marker.executableSha256 !== plan.artifact.primary.sha256 ||
      path.resolve(marker.applicationExecutablePath || '') !== path.resolve(plan.runRoot, 'frozen-package', path.basename(plan.application.executablePath)) ||
      !marker.frozenPackage || path.resolve(marker.frozenPackage.root || '') !== path.resolve(plan.runRoot, 'frozen-package') ||
      !['armed', 'pid_observed', 'identity_captured'].includes(marker.state) ||
      typeof marker.launchStartedAt !== 'string' || !Number.isFinite(Date.parse(marker.launchStartedAt))) {
    fail('RECOVERY_IDENTITY_FAILED', 'Launch recovery marker is incomplete or does not bind the exact owned launch.');
  }
  if (marker.state === 'armed') {
    if (marker.pid !== null || marker.launchReturnedAt !== null || marker.pidAbsentBeforeLaunch !== null || marker.processTree !== null) {
      fail('RECOVERY_IDENTITY_FAILED', 'Armed launch recovery marker has an invalid pre-PID state.');
    }
  } else if (!Number.isInteger(marker.pid) || marker.pid <= 0 || marker.pidAbsentBeforeLaunch !== true ||
      typeof marker.launchReturnedAt !== 'string' || !Number.isFinite(Date.parse(marker.launchReturnedAt))) {
    fail('RECOVERY_IDENTITY_FAILED', 'Observed launch recovery marker is missing exact PID identity proof.');
  }
  return marker;
}

async function recoverLaunch(plan) {
  await verifyRunOwnership(plan);
  const markerPath = path.join(plan.runRoot, 'launch-recovery.json');
  const marker = validateLaunchRecoveryMarker(plan, await readJson(markerPath, 256 * 1024));
  await assertFrozenDirectory(marker.frozenPackage);
  await assertPinnedArtifact(marker.applicationExecutablePath, plan.artifact.primary.sha256);
  const inventory = await windowsProcessInventory();
  const paths = {
    appDataPath: path.join(plan.runRoot, plan.isolation.appDataDirectory),
    userDataPath: path.join(plan.runRoot, plan.isolation.userDataDirectory)
  };
  if (marker.state === 'armed') {
    const requiredArguments = [
      '--evidence-mode',
      `--evidence-app-data=${paths.appDataPath}`,
      `--evidence-user-data=${paths.userDataPath}`,
      `--remote-debugging-port=${plan.cdp.port}`
    ];
    const candidates = await windowsEvidenceProcessCandidates(marker.applicationExecutablePath, requiredArguments, marker.launchStartedAt);
    if (candidates.length > 0) {
      const root = selectEvidenceLaunchRoot(candidates);
      const processTree = processTreeFromInventory(inventory, root.pid, marker.applicationExecutablePath);
      const state = runtimeDocument(plan, paths, root.pid, processTree, null, marker.frozenPackage, marker.applicationExecutablePath);
      const result = await cleanupOwnedState(plan, state);
      await fsp.rm(markerPath, { force: true });
      return { ...result, recoveredLaunch: true, recoveryState: 'armed_process_resolved' };
    }
    if (processesForExecutableSince(inventory, marker.applicationExecutablePath, marker.launchStartedAt).length > 0) {
      fail('RECOVERY_IDENTITY_FAILED', 'A recent packaged process exists, but its exact evidence arguments are not uniquely provable.');
    }
    assertCdpPortVacant(await windowsTcpListenerInventory(plan.cdp.port), plan.cdp.port);
    const client = await connectMcp(plan.mcp.endpoint, { timeoutMs: plan.mcp.timeoutMs });
    await preflight(client);
    const desktops = await client.callTool('list_headless_desktops', {});
    if (desktopExists(desktops.desktops, marker.desktop)) {
      const windows = await client.callTool('list_headless_windows', { name: marker.desktop });
      const visible = Array.isArray(windows.windows) ? windows.windows.filter((item) => item?.width > 0 && item?.height > 0 && item?.handle > 0) : [];
      if (visible.length > 0) fail('RECOVERY_IDENTITY_FAILED', 'Armed launch recovery found a visible window without an exact owned process identity.');
      const closed = await client.callTool('close_headless_desktop', { name: marker.desktop });
      if (closed.closed !== true) fail('DESKTOP_CLOSE_FAILED', 'Armed launch recovery could not close the exact task desktop.');
    }
    await verifyRunOwnership(plan);
    const appData = await strictChild(paths.appDataPath, plan.runRoot, 'isolated appData directory');
    const userData = await strictChild(paths.userDataPath, plan.runRoot, 'isolated userData directory');
    await fsp.rm(appData.child, { recursive: true, force: true });
    await fsp.rm(userData.child, { recursive: true, force: true });
    await atomicWriteJson(runtimePath(plan), {
      schemaVersion: 1,
      runId: plan.runId,
      route: plan.route,
      captureKind: plan.captureKind,
      sourceSha: plan.sourceSha,
      artifact: plan.artifact,
      cleaned: true,
      cleanup: {
        completedAt: new Date().toISOString(),
        ownedOnly: true,
        desktopClosed: true,
        isolatedProfilesPurged: true,
        evidenceRetained: true,
        noLivePackagedProcessProved: true
      }
    });
    await fsp.rm(markerPath, { force: true });
    return { ok: true, runId: plan.runId, cleaned: true, recoveredLaunch: true, recoveryState: 'armed_no_process', isolatedProfilesPurged: true, evidenceRetained: true };
  }
  let processTree;
  if (marker.state === 'identity_captured') {
    if (!Array.isArray(marker.processTree) || !marker.processTree.length) fail('RECOVERY_IDENTITY_FAILED', 'Captured recovery identity is missing.');
    processTree = marker.processTree;
    const liveRoot = inventory.find((item) => item.pid === marker.pid);
    const savedRoot = processTree.find((item) => item.pid === marker.pid);
    if (liveRoot && !sameProcessIdentity(savedRoot, liveRoot)) fail('RECOVERY_IDENTITY_FAILED', 'Saved recovery process identity no longer matches the live PID.');
    if (liveRoot) processTree = processTreeFromInventory(inventory, marker.pid, marker.applicationExecutablePath);
  } else {
    const liveRoot = inventory.find((item) => item.pid === marker.pid);
    if (!liveRoot) processTree = [];
    else {
      const createdAt = Date.parse(liveRoot.creationDate);
      const startedAt = Date.parse(marker.launchStartedAt);
      const returnedAt = Date.parse(marker.launchReturnedAt);
      if (![createdAt, startedAt, returnedAt].every(Number.isFinite) || createdAt < startedAt - 5_000 || createdAt > returnedAt + 5_000) {
        fail('RECOVERY_IDENTITY_FAILED', 'Live PID creation time does not fit the exact owned launch interval.');
      }
      processTree = processTreeFromInventory(inventory, marker.pid, marker.applicationExecutablePath);
    }
  }
  const state = runtimeDocument(plan, paths, marker.pid, processTree, null, marker.frozenPackage, marker.applicationExecutablePath);
  const result = await cleanupOwnedState(plan, state);
  await fsp.rm(markerPath, { force: true });
  return { ...result, recoveredLaunch: true };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const command = process.argv[2];
  if (command === 'self-test') {
    return { ok: true, contract: 'window-only-evidence-v1', commands: ['prepare', 'step', 'inspect', 'reset', 'status', 'recover-launch', 'recover-lock', 'cleanup'] };
  }
  const planFile = argumentValue('--plan');
  if (!planFile) fail('MISSING_PLAN', 'Command requires --plan.');
  const plan = await loadPlan(planFile);
  if (command === 'prepare') return prepare(plan);
  if (command === 'step') {
    const stepId = boundedString(argumentValue('--step'), 'step id', { max: 96, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
    return withRunLock(plan, `step:${stepId}`, () => runStep(plan, stepId));
  }
  if (command === 'inspect') {
    const stepId = boundedString(argumentValue('--step'), 'step id', { max: 96, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
    const inspectionFile = argumentValue('--inspection');
    if (!inspectionFile || !path.isAbsolute(inspectionFile)) fail('MISSING_INSPECTION', 'Inspect requires an absolute --inspection file path.');
    return withRunLock(plan, `inspect:${stepId}`, () => inspectStep(plan, stepId, inspectionFile));
  }
  if (command === 'reset') {
    const stepId = boundedString(argumentValue('--step'), 'step id', { max: 96, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
    return withRunLock(plan, `reset:${stepId}`, () => resetStep(plan, stepId));
  }
  if (command === 'status') return status(plan);
  if (command === 'recover-launch') return withRunLock(plan, 'recover-launch', () => recoverLaunch(plan));
  if (command === 'recover-lock') return recoverRunLock(plan);
  if (command === 'cleanup') return withRunLock(plan, 'cleanup', () => cleanup(plan));
  fail('UNKNOWN_COMMAND', 'Evidence helper command is unsupported.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stdout.write(`${JSON.stringify(toPublicFailure(error))}\n`);
    process.exitCode = 1;
  });
}

export { cleanup, inspectStep, prepare, recoverLaunch, runStep, status };
