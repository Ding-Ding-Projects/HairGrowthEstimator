import childProcess from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertExactKeys,
  assertFrozenDirectory,
  assertObject,
  assertPinnedArtifact,
  assertPinnedSource,
  assertPublicReceiptValue,
  atomicWriteJson,
  boundedString,
  canonicalHash,
  fail,
  freezeDirectory,
  inspectPng,
  inspectWebp,
  readJson,
  rejectLinkComponents,
  safeRelative,
  strictChild,
  toPublicFailure
} from './common.mjs';
import { assertSingleCdpTarget, connectExactCdp } from './cdp-client.mjs';
import { assertWindowCaptureEnvelope, captureWindow, connectMcp, discoverWindow, performBackgroundInput, preflight } from './mcp-client.mjs';
import { loadPlan, validateSemanticProbe, verifyPackagedReceipt, verifyRunOwnership } from './plan.mjs';
import { assertCdpListenerOwned, revalidateProcessTree, windowsTcpListenerInventory } from './process-identity.mjs';
import { withRunLock } from './run-lock.mjs';

const RUNTIME_FILE = 'runtime-state.json';
const RECORDING_PHASES = new Set(['pending', 'input_intent', 'input_applied', 'post_captured']);

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function validateAction(action, index, frameCount) {
  assertExactKeys(assertObject(action, `recording action ${index}`), new Set(['atFrame', 'target', 'input', 'semantic']), `recording action ${index}`);
  if (!Number.isInteger(action.atFrame) || action.atFrame < 1 || action.atFrame >= frameCount) fail('INVALID_RECORDING_ACTION', 'Recording action frame is outside the bounded recording.');
  const target = assertObject(action.target, `recording action ${index} target`);
  assertExactKeys(target, new Set(['selector', 'accessibleName']), `recording action ${index} target`);
  const input = assertObject(action.input, `recording action ${index} input`);
  if (!['mouse_click', 'win_send_keys'].includes(input.method)) fail('VISIBLE_INPUT_FORBIDDEN', 'Recording actions must use an HWND-targeted input method.');
  if (input.method === 'mouse_click') {
    assertExactKeys(input, new Set(['method', 'x', 'y', 'button', 'clicks']), `recording action ${index} input`);
    if (!Number.isInteger(input.x) || input.x < 0 || !Number.isInteger(input.y) || input.y < 0 ||
        !['left', 'right', 'middle'].includes(input.button) || !Number.isInteger(input.clicks) || input.clicks < 1 || input.clicks > 2) {
      fail('INVALID_RECORDING_ACTION', 'Recording mouse input is invalid.');
    }
  } else {
    assertExactKeys(input, new Set(['method', 'keys']), `recording action ${index} input`);
    if (!Array.isArray(input.keys) || input.keys.length < 1 || input.keys.length > 6 || !input.keys.every((key) => typeof key === 'string' && /^[a-z0-9_+-]{1,24}$/i.test(key))) {
      fail('INVALID_RECORDING_ACTION', 'Recording key input is invalid.');
    }
  }
  const semantic = assertObject(action.semantic, `recording action ${index} semantic`);
  assertExactKeys(semantic, new Set(['probe', 'beforeEquals', 'afterEquals', 'timeoutMs', 'intervalMs']), `recording action ${index} semantic`);
  const probe = validateSemanticProbe(semantic.probe, `recording action ${index} semantic probe`);
  assertPublicReceiptValue(semantic.beforeEquals, `recording action ${index} expected pre-action semantic value`);
  assertPublicReceiptValue(semantic.afterEquals, `recording action ${index} expected semantic value`);
  if (!Number.isInteger(semantic.timeoutMs) || semantic.timeoutMs < 100 || semantic.timeoutMs > 120_000 ||
      !Number.isInteger(semantic.intervalMs) || semantic.intervalMs < 50 || semantic.intervalMs > 5_000) {
    fail('INVALID_RECORDING_ACTION', 'Recording semantic polling bounds are invalid.');
  }
  return {
    atFrame: action.atFrame,
    target: {
      selector: boundedString(target.selector, 'recording target selector', { max: 1_024 }),
      accessibleName: boundedString(target.accessibleName, 'recording target accessible name', { max: 256 })
    },
    input: structuredClone(input),
    semantic: {
      probe,
      beforeEquals: structuredClone(semantic.beforeEquals),
      afterEquals: structuredClone(semantic.afterEquals),
      timeoutMs: semantic.timeoutMs,
      intervalMs: semantic.intervalMs
    }
  };
}

export function validateRecordingPlan(value) {
  assertExactKeys(assertObject(value, 'recording plan'), new Set([
    'schemaVersion', 'recordingId', 'frameRate', 'durationSeconds', 'outputFile', 'encoder', 'actions'
  ]), 'recording plan');
  if (value.schemaVersion !== 1) fail('INVALID_RECORDING_PLAN', 'Recording plan schema is unsupported.');
  const recordingId = boundedString(value.recordingId, 'recording id', { max: 96, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
  if (!Number.isInteger(value.frameRate) || value.frameRate < 1 || value.frameRate > 10 || typeof value.durationSeconds !== 'number' || value.durationSeconds < 1 || value.durationSeconds > 120) {
    fail('INVALID_RECORDING_PLAN', 'Recording must use 1 through 10 frames per second and last 1 through 120 seconds.');
  }
  const frameCount = Math.floor(value.frameRate * value.durationSeconds);
  if (frameCount < 2 || frameCount > 600) fail('INVALID_RECORDING_PLAN', 'Recording frame count must be 2 through 600.');
  const outputFile = safeRelative(value.outputFile, 'recording output');
  if (!outputFile.endsWith('.webp')) fail('INVALID_RECORDING_PLAN', 'Recording output must use the .webp extension.');
  const encoder = assertObject(value.encoder, 'recording encoder');
  assertExactKeys(encoder, new Set(['kind', 'path', 'sha256']), 'recording encoder');
  if (encoder.kind !== 'ffmpeg' || !path.isAbsolute(encoder.path)) fail('INVALID_ENCODER', 'Recording encoder must be an absolute ffmpeg executable.');
  const actions = Array.isArray(value.actions) ? value.actions.map((item, index) => validateAction(item, index, frameCount)) : null;
  if (!actions || actions.length > 64 || actions.some((action, index) => index > 0 && actions[index - 1].atFrame >= action.atFrame)) {
    fail('INVALID_RECORDING_ACTION', 'Recording actions must be strictly ordered and unique by frame.');
  }
  return {
    schemaVersion: 1,
    recordingId,
    frameRate: value.frameRate,
    durationSeconds: value.durationSeconds,
    frameCount,
    outputFile,
    encoder: {
      kind: 'ffmpeg',
      path: path.resolve(encoder.path),
      sha256: boundedString(encoder.sha256, 'encoder SHA-256', { pattern: /^[a-f0-9]{64}$/ })
    },
    actions
  };
}

function recordingBinding(plan, recording) {
  return canonicalHash({
    runId: plan.runId,
    sourceSha: plan.sourceSha,
    artifactSha: plan.artifact.primary.sha256,
    componentShas: plan.artifact.components.map((item) => ({ id: item.id, sha256: item.sha256 })),
    tuple: plan.tuple,
    recording: {
      schemaVersion: recording.schemaVersion,
      recordingId: recording.recordingId,
      frameRate: recording.frameRate,
      durationSeconds: recording.durationSeconds,
      frameCount: recording.frameCount,
      outputFile: recording.outputFile,
      encoder: { kind: recording.encoder.kind, sha256: recording.encoder.sha256 },
      actions: recording.actions
    }
  });
}

export function initialRecordingProgress(plan, recording) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId: plan.runId,
    recordingId: recording.recordingId,
    bindingSha256: recordingBinding(plan, recording),
    status: 'running',
    nextFrame: 0,
    actions: recording.actions.map((action, index) => ({
      index,
      atFrame: action.atFrame,
      phase: 'pending',
      preState: null,
      inputArmedAt: null,
      inputReceipt: null,
      inputAppliedAt: null,
      receipt: null,
      capturedAt: null
    })),
    createdAt: now,
    updatedAt: now
  };
}

export function validateRecordingProgress(plan, recording, value) {
  const progress = assertObject(value, 'recording progress');
  assertExactKeys(progress, new Set([
    'schemaVersion', 'runId', 'recordingId', 'bindingSha256', 'status', 'nextFrame', 'actions', 'createdAt', 'updatedAt'
  ]), 'recording progress');
  if (progress.schemaVersion !== 1 || progress.runId !== plan.runId || progress.recordingId !== recording.recordingId ||
      progress.bindingSha256 !== recordingBinding(plan, recording) || progress.status !== 'running' ||
      !Number.isInteger(progress.nextFrame) || progress.nextFrame < 0 || progress.nextFrame > recording.frameCount ||
      typeof progress.createdAt !== 'string' || !Number.isFinite(Date.parse(progress.createdAt)) ||
      typeof progress.updatedAt !== 'string' || !Number.isFinite(Date.parse(progress.updatedAt)) ||
      !Array.isArray(progress.actions) || progress.actions.length !== recording.actions.length) {
    fail('INVALID_RECORDING_PROGRESS', 'Recording progress does not bind the exact run, plan, or frame bounds.');
  }
  const ranks = [];
  let partialActions = 0;
  progress.actions.forEach((action, index) => {
    assertExactKeys(assertObject(action, `recording progress action ${index}`), new Set([
      'index', 'atFrame', 'phase', 'preState', 'inputArmedAt', 'inputReceipt', 'inputAppliedAt', 'receipt', 'capturedAt'
    ]), `recording progress action ${index}`);
    const planned = recording.actions[index];
    if (action.index !== index || action.atFrame !== planned.atFrame || !RECORDING_PHASES.has(action.phase)) {
      fail('INVALID_RECORDING_PROGRESS', 'Recording progress action identity or phase is invalid.');
    }
    const armed = typeof action.inputArmedAt === 'string' && Number.isFinite(Date.parse(action.inputArmedAt));
    const applied = typeof action.inputAppliedAt === 'string' && Number.isFinite(Date.parse(action.inputAppliedAt));
    const captured = typeof action.capturedAt === 'string' && Number.isFinite(Date.parse(action.capturedAt));
    if ((action.phase === 'pending' && (action.preState !== null || action.inputArmedAt !== null || action.inputReceipt !== null || action.inputAppliedAt !== null || action.receipt !== null || action.capturedAt !== null)) ||
        (action.phase === 'input_intent' && (!armed || action.inputReceipt !== null || action.inputAppliedAt !== null || action.receipt !== null || action.capturedAt !== null)) ||
        (action.phase === 'input_applied' && (!armed || !applied || !action.inputReceipt || action.receipt !== null || action.capturedAt !== null)) ||
        (action.phase === 'post_captured' && (!armed || !applied || !captured || !action.inputReceipt || !action.receipt))) {
      fail('INVALID_RECORDING_PROGRESS', 'Recording progress action fields disagree with the durable phase.');
    }
    const rank = ['pending', 'input_intent', 'input_applied', 'post_captured'].indexOf(action.phase);
    ranks.push(rank);
    if (rank === 1 || rank === 2) partialActions += 1;
  });
  if (partialActions > 1 || ranks.some((rank, index) => index > 0 && ranks[index - 1] < rank)) {
    fail('INVALID_RECORDING_PROGRESS', 'Recording action phases are not a resumable ordered prefix.');
  }
  assertPublicReceiptValue(progress, 'recording progress');
  return progress;
}

async function writeRecordingProgress(progressPath, plan, recording, progress) {
  progress.updatedAt = new Date().toISOString();
  validateRecordingProgress(plan, recording, progress);
  await atomicWriteJson(progressPath, progress);
}

async function readRecordingProgress(progressPath, plan, recording) {
  return validateRecordingProgress(plan, recording, await readJson(progressPath, 1024 * 1024));
}

async function resourcePrivacyCount(cdp, allowedOrigins) {
  const expression = `(() => { const a = new Set(${JSON.stringify(allowedOrigins)}); const local = new Set(['file:', 'data:', 'blob:']); return performance.getEntriesByType('resource').filter(e => { try { const u = new URL(e.name); return !local.has(u.protocol) && !a.has(u.origin); } catch { return true; } }).length; })()`;
  const count = await cdp.evaluate(expression);
  if (!Number.isInteger(count) || count !== 0) fail('UNEXPECTED_NETWORK_RESOURCE', 'Recording renderer loaded a resource outside the allowlisted origins.');
  return count;
}

async function readRuntime(plan) {
  await verifyRunOwnership(plan);
  const state = await readJson(path.join(plan.runRoot, RUNTIME_FILE));
  if (state?.schemaVersion !== 1 || state.runId !== plan.runId || state.prepared !== true || state.cleaned === true || !Array.isArray(state.processTree) ||
      state.desktop !== `HGE-${canonicalHash(plan.runId).slice(0, 24)}` || state.sourceSha !== plan.sourceSha ||
      canonicalHash(state.artifact) !== canonicalHash(plan.artifact) ||
      path.resolve(state.applicationExecutablePath || '') !== path.resolve(plan.runRoot, 'frozen-package', path.basename(plan.application.executablePath)) ||
      !state.cdpListener || state.cdpListener.port !== plan.cdp.port || !Number.isInteger(state.cdpListener.owningPid)) {
    fail('INVALID_RUNTIME_STATE', 'Recording requires a prepared live evidence runtime.');
  }
  await assertFrozenDirectory(state.frozenPackage);
  await assertPinnedArtifact(state.applicationExecutablePath, plan.artifact.primary.sha256);
  return state;
}

async function assertPlanBindings(plan) {
  await verifyRunOwnership(plan);
  assertPinnedSource(plan.repoRoot, plan.sourceSha);
  for (const artifact of [plan.artifact.primary, ...plan.artifact.components]) {
    await assertPinnedArtifact(plan.artifactPaths[artifact.id], artifact.sha256);
  }
  await verifyPackagedReceipt(plan);
}

function assertSameRecordingWindow(expected, observed) {
  if (!expected || !observed || expected.hwnd !== observed.hwnd || expected.processId !== observed.processId ||
      expected.width !== observed.width || expected.height !== observed.height || expected.className !== observed.className) {
    fail('WINDOW_IDENTITY_CHANGED', 'Recording stopped because the exact window identity or bounds changed.');
  }
  return observed;
}

async function assertRecordingBoundary(plan, state, client, cdp, processTree, expectedWindow) {
  await assertPlanBindings(plan);
  await assertFrozenDirectory(state.frozenPackage);
  const tree = await revalidateProcessTree(processTree, state.pid, state.applicationExecutablePath);
  if (canonicalHash(tree) !== canonicalHash(state.processTree)) {
    state.processTree = tree;
    await atomicWriteJson(path.join(plan.runRoot, RUNTIME_FILE), state);
  }
  const listener = assertCdpListenerOwned(await windowsTcpListenerInventory(plan.cdp.port), plan.cdp.port, tree.map((item) => item.pid));
  if (listener.owningPid !== state.cdpListener.owningPid) fail('CDP_LISTENER_OWNERSHIP_FAILED', 'Recording CDP listener ownership changed after prepare.');
  const target = await assertSingleCdpTarget(plan.cdp.endpoint, plan.cdp.expectedUrl, plan.cdp.timeoutMs);
  if (target.webSocketDebuggerUrl !== cdp.url) fail('CDP_TARGET_CHANGED', 'The sole exact CDP page changed during recording.');
  await cdp.assertLiveTuple(plan.tuple);
  const privacy = await cdp.privacyScan(plan.privacyPatterns);
  await resourcePrivacyCount(cdp, plan.allowedNetworkOrigins);
  const windowValue = await discoverWindow(client, state.desktop, {
    ownedProcessIds: tree.map((item) => item.pid),
    titlePattern: plan.window.titlePattern,
    classPattern: plan.window.classPattern
  });
  if (expectedWindow) assertSameRecordingWindow(expectedWindow, windowValue);
  assertWindowCaptureEnvelope(windowValue, plan.tuple);
  return { processTree: tree, listener, privacy, window: windowValue };
}

function runDecoder(encoderPath, outputPath) {
  const decoded = childProcess.spawnSync(encoderPath, [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', outputPath, '-map', '0:v:0', '-f', 'null', '-'
  ], {
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: 120_000,
    maxBuffer: 1024 * 1024
  });
  if (decoded.error || decoded.status !== 0) fail('RECORDING_DECODE_FAILED', 'Pinned decoder could not read every recording frame.');
  return true;
}

function frozenEncoderPaths(plan, recording) {
  const root = path.join(plan.runRoot, 'recording-tools', recording.recordingId);
  return {
    root,
    bindingPath: path.join(plan.runRoot, 'recording-tools', `${recording.recordingId}.json`)
  };
}

async function freezeRecordingEncoder(plan, recording) {
  const locations = frozenEncoderPaths(plan, recording);
  const sourceRoot = path.dirname(recording.encoder.path);
  const binding = await freezeDirectory(sourceRoot, locations.root);
  const relativeExecutable = safeRelative(path.relative(sourceRoot, recording.encoder.path), 'frozen encoder relative path');
  const executablePath = (await strictChild(path.join(binding.root, relativeExecutable), binding.root, 'frozen recording encoder')).child;
  await assertPinnedArtifact(executablePath, recording.encoder.sha256);
  await atomicWriteJson(locations.bindingPath, {
    schemaVersion: 1,
    recordingId: recording.recordingId,
    encoderSha256: recording.encoder.sha256,
    relativeExecutable,
    binding
  });
  return { executablePath, binding, locations };
}

async function readFrozenRecordingEncoder(plan, recording) {
  const locations = frozenEncoderPaths(plan, recording);
  const record = await readJson(locations.bindingPath, 64 * 1024);
  assertExactKeys(assertObject(record, 'frozen encoder record'), new Set(['schemaVersion', 'recordingId', 'encoderSha256', 'relativeExecutable', 'binding']), 'frozen encoder record');
  if (record.schemaVersion !== 1 || record.recordingId !== recording.recordingId || record.encoderSha256 !== recording.encoder.sha256) {
    fail('FROZEN_BYTES_CHANGED', 'Frozen recording encoder record does not bind the exact plan.');
  }
  await assertFrozenDirectory(record.binding);
  const executablePath = (await strictChild(path.join(record.binding.root, safeRelative(record.relativeExecutable, 'frozen encoder relative path')), record.binding.root, 'frozen recording encoder')).child;
  await assertPinnedArtifact(executablePath, recording.encoder.sha256);
  return { executablePath, binding: record.binding, locations };
}

function frameName(index) {
  return `frame-${String(index).padStart(6, '0')}.png`;
}

async function captureRecording(plan, recording) {
  await assertPlanBindings(plan);
  await assertPinnedArtifact(recording.encoder.path, recording.encoder.sha256);
  await rejectLinkComponents(recording.encoder.path);
  const state = await readRuntime(plan);
  const frameDirectory = (await strictChild(path.join(plan.outputRoot, 'recording-frames', recording.recordingId), plan.outputRoot, 'recording frame directory')).child;
  const outputPath = (await strictChild(path.join(plan.outputRoot, recording.outputFile), plan.outputRoot, 'recording output')).child;
  const receiptPath = (await strictChild(path.join(plan.outputRoot, 'recordings', `${recording.recordingId}.receipt.json`), plan.outputRoot, 'recording receipt')).child;
  const progressPath = (await strictChild(path.join(plan.outputRoot, 'recordings', `${recording.recordingId}.progress.json`), plan.outputRoot, 'recording progress')).child;
  try {
    await fsp.access(progressPath);
    fail('RECORDING_RECOVERY_REQUIRED', 'Recording has durable partial progress. Inspect status before retrying.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  for (const target of [frameDirectory, outputPath, receiptPath]) {
    try { await fsp.access(target); fail('RECORDING_OUTPUT_EXISTS', 'Recording output already exists. Use a fresh recording id.'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.mkdir(path.dirname(receiptPath), { recursive: true });
  const progress = initialRecordingProgress(plan, recording);
  await writeRecordingProgress(progressPath, plan, recording, progress);
  const frozenEncoder = await freezeRecordingEncoder(plan, recording);
  await fsp.mkdir(frameDirectory, { recursive: true });
  const client = await connectMcp(plan.mcp.endpoint, { timeoutMs: plan.mcp.timeoutMs });
  await preflight(client);
  const cdp = await connectExactCdp(plan.cdp.endpoint, plan.cdp.expectedUrl, { timeoutMs: plan.cdp.timeoutMs, allowedOrigins: plan.allowedNetworkOrigins });
  const frameReceipts = [];
  const actionReceipts = [];
  let processTree = state.processTree;
  const startedAt = Date.now();
  try {
    processTree = await revalidateProcessTree(processTree, state.pid, state.applicationExecutablePath);
    let boundary = await assertRecordingBoundary(plan, state, client, cdp, processTree, null);
    processTree = boundary.processTree;
    const initialWindow = boundary.window;
    if (state.hwnd !== initialWindow.hwnd || state.window?.processId !== initialWindow.processId) {
      fail('WINDOW_IDENTITY_CHANGED', 'Prepared runtime and recording window identities do not match.');
    }
    for (let index = 0; index < recording.frameCount; index += 1) {
      boundary = await assertRecordingBoundary(plan, state, client, cdp, processTree, initialWindow);
      processTree = boundary.processTree;
      const liveWindow = boundary.window;
      const action = recording.actions.find((item) => item.atFrame === index);
      let actionReceipt = null;
      if (action) {
        const progressAction = progress.actions.find((item) => item.atFrame === index);
        if (!progressAction || progressAction.phase !== 'pending') fail('INVALID_RECORDING_PROGRESS', 'Recording action progress is missing or already advanced.');
        const accessible = await cdp.accessibleTarget(action.target.selector);
        if (accessible.name !== action.target.accessibleName) fail('ACCESSIBLE_NAME_MISMATCH', 'Recording action target accessible name changed.');
        await cdp.assertInputTarget(action.target.selector, action.input, plan.tuple.scale);
        const semanticPreState = await cdp.semanticProbe(action.semantic.probe);
        if (canonicalHash(semanticPreState) !== canonicalHash(action.semantic.beforeEquals)) fail('SEMANTIC_PRE_STATE_MISMATCH', 'Recording action pre-state does not match the declared expectation.');
        progressAction.phase = 'input_intent';
        progressAction.preState = semanticPreState;
        progressAction.inputArmedAt = new Date().toISOString();
        await writeRecordingProgress(progressPath, plan, recording, progress);
        const input = await performBackgroundInput(client, liveWindow.hwnd, action.input);
        progressAction.phase = 'input_applied';
        progressAction.inputReceipt = input;
        progressAction.inputAppliedAt = new Date().toISOString();
        await writeRecordingProgress(progressPath, plan, recording, progress);
        const semantic = await cdp.pollProbe(action.semantic.probe, action.semantic.afterEquals, {
          timeoutMs: action.semantic.timeoutMs,
          intervalMs: action.semantic.intervalMs
        });
        actionReceipt = {
          atFrame: index,
          targetSelector: action.target.selector,
          targetAccessibilityName: accessible.name,
          targetAccessibilityRole: accessible.role,
          input,
          semanticProbe: action.semantic.probe,
          semanticPreState,
          semanticExpectedPreState: action.semantic.beforeEquals,
          semanticExpectedState: action.semantic.afterEquals,
          semanticPostState: semantic,
          semanticFrameState: null
        };
        boundary = await assertRecordingBoundary(plan, state, client, cdp, processTree, initialWindow);
        processTree = boundary.processTree;
      }
      const relative = `recording-frames/${recording.recordingId}/${frameName(index)}`;
      const destination = path.join(plan.outputRoot, relative);
      await captureWindow(client, { hwnd: liveWindow.hwnd, outputPath: destination, clientOnly: true });
      const media = await inspectPng(destination, { requireNonblank: true });
      if (media.width !== plan.tuple.capturePixelSize.width || media.height !== plan.tuple.capturePixelSize.height) fail('VIEWPORT_MISMATCH', 'Recording frame dimensions do not match the pinned tuple.');
      frameReceipts.push({ index, path: relative, sha256: media.sha256, width: media.width, height: media.height });
      boundary = await assertRecordingBoundary(plan, state, client, cdp, processTree, initialWindow);
      processTree = boundary.processTree;
      if (actionReceipt) {
        actionReceipt.semanticFrameState = await cdp.semanticProbe(action.semantic.probe);
        if (canonicalHash(actionReceipt.semanticFrameState) !== canonicalHash(action.semantic.afterEquals)) {
          fail('SEMANTIC_STATE_MISMATCH', 'Recording action state changed before its captured frame completed.');
        }
        const progressAction = progress.actions.find((item) => item.atFrame === index);
        progressAction.phase = 'post_captured';
        progressAction.receipt = actionReceipt;
        progressAction.capturedAt = new Date().toISOString();
        await writeRecordingProgress(progressPath, plan, recording, progress);
        actionReceipts.push(actionReceipt);
      }
      progress.nextFrame = index + 1;
      await writeRecordingProgress(progressPath, plan, recording, progress);
      const nextAt = startedAt + Math.round(((index + 1) * 1000) / recording.frameRate);
      if (index + 1 < recording.frameCount && Date.now() < nextAt) await new Promise((resolve) => setTimeout(resolve, nextAt - Date.now()));
    }
    const inputPattern = path.join(frameDirectory, 'frame-%06d.png');
    const encoderArgs = [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-framerate', String(recording.frameRate),
      '-start_number', '0', '-i', inputPattern, '-an', '-loop', '0', '-c:v', 'libwebp_anim',
      '-lossless', '1', '-compression_level', '6', '-n', outputPath
    ];
    await assertFrozenDirectory(frozenEncoder.binding);
    const encoded = childProcess.spawnSync(frozenEncoder.executablePath, encoderArgs, {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 120_000,
      maxBuffer: 1024 * 1024
    });
    if (encoded.error || encoded.status !== 0) {
      await fsp.rm(outputPath, { force: true });
      fail('ENCODER_FAILED', 'Pinned recording encoder did not produce a successful output.');
    }
    const media = await inspectWebp(outputPath, { requireAnimation: true });
    if (media.width !== plan.tuple.capturePixelSize.width || media.height !== plan.tuple.capturePixelSize.height) fail('VIEWPORT_MISMATCH', 'Recording canvas does not match the pinned tuple.');
    if (media.frames !== recording.frameCount) fail('FRAME_COUNT_MISMATCH', 'Animated recording frame count does not match the captured frame inventory.');
    await assertFrozenDirectory(frozenEncoder.binding);
    runDecoder(frozenEncoder.executablePath, outputPath);
    const network = cdp.networkSummary();
    if (!network.passed) fail('UNEXPECTED_NETWORK_REQUEST', 'Unexpected network activity occurred during recording.');
    const receipt = {
      schemaVersion: 1,
      recordingId: recording.recordingId,
      route: 'cheap-lowlevel-headless',
      captureKind: 'window',
      sourceSha: plan.sourceSha,
      artifactSha: plan.artifact.primary.sha256,
      componentShas: plan.artifact.components.map((item) => ({ id: item.id, sha256: item.sha256 })),
      tuple: plan.tuple,
      encoder: { kind: recording.encoder.kind, sha256: recording.encoder.sha256 },
      timing: { frameRate: recording.frameRate, durationSeconds: recording.durationSeconds, frameCount: recording.frameCount },
      frames: frameReceipts,
      actions: actionReceipts,
      output: { path: recording.outputFile, sha256: media.sha256, width: media.width, height: media.height, frames: media.frames, mimeType: media.mimeType, decoderRoundTrip: true },
      privacy: {
        visibleDesktopUntouched: true,
        expectedSurfaceOnly: true,
        unrelatedTargetsObserved: false,
        sensitiveDataReviewed: false,
        mocked: false,
        handEdited: false,
        everyFrameInspected: false,
        rendererScanPassed: true,
        networkPassed: true,
        listenerOwned: true,
        postActionRevalidated: true,
        everyFramePostCaptureRevalidated: true,
        unexpectedNetworkRequests: network.unexpected
      },
      pendingInspection: true,
      capturedAt: new Date().toISOString()
    };
    assertPublicReceiptValue(receipt, 'recording receipt');
    await atomicWriteJson(receiptPath, receipt);
    await fsp.rm(progressPath, { force: true });
    return { ok: true, recordingId: recording.recordingId, output: recording.outputFile, sha256: media.sha256, frames: media.frames, pendingInspection: true };
  } finally {
    await cdp.close();
  }
}

const PENDING_RECEIPT_KEYS = new Set([
  'schemaVersion', 'recordingId', 'route', 'captureKind', 'sourceSha', 'artifactSha',
  'componentShas', 'tuple', 'encoder', 'timing', 'frames', 'actions', 'output',
  'privacy', 'pendingInspection', 'capturedAt'
]);

const COMPLETED_RECEIPT_KEYS = new Set([
  ...PENDING_RECEIPT_KEYS, 'inspection', 'completed', 'completionMarker'
]);

function validateRecordingPrivacy(privacy, completed) {
  assertExactKeys(assertObject(privacy, 'recording privacy receipt'), new Set([
    'visibleDesktopUntouched', 'expectedSurfaceOnly', 'unrelatedTargetsObserved',
    'sensitiveDataReviewed', 'mocked', 'handEdited', 'everyFrameInspected',
    'rendererScanPassed', 'networkPassed', 'listenerOwned', 'postActionRevalidated',
    'everyFramePostCaptureRevalidated', 'unexpectedNetworkRequests'
  ]), 'recording privacy receipt');
  const requiredTrue = [
    'visibleDesktopUntouched', 'expectedSurfaceOnly', 'rendererScanPassed', 'networkPassed',
    'listenerOwned', 'postActionRevalidated', 'everyFramePostCaptureRevalidated'
  ];
  if (requiredTrue.some((key) => privacy[key] !== true) || privacy.unrelatedTargetsObserved !== false ||
      privacy.mocked !== false || privacy.handEdited !== false || privacy.unexpectedNetworkRequests !== 0 ||
      privacy.sensitiveDataReviewed !== completed || privacy.everyFrameInspected !== completed) {
    fail('PRIVACY_VERDICT_FAILED', 'Recording privacy receipt does not prove every required automated and inspection boundary.');
  }
  return privacy;
}

function validateRecordingActionReceipts(recording, actions) {
  if (!Array.isArray(actions) || actions.length !== recording.actions.length) fail('INVALID_RECORDING_RECEIPT', 'Recording action inventory is incomplete.');
  actions.forEach((receipt, index) => {
    const planned = recording.actions[index];
    assertExactKeys(assertObject(receipt, `recording action receipt ${index}`), new Set([
      'atFrame', 'targetSelector', 'targetAccessibilityName', 'targetAccessibilityRole', 'input',
      'semanticProbe', 'semanticPreState', 'semanticExpectedPreState', 'semanticExpectedState', 'semanticPostState', 'semanticFrameState'
    ]), `recording action receipt ${index}`);
    boundedString(receipt.targetAccessibilityRole, `recording action ${index} accessibility role`, { max: 128 });
    const expected = {
      atFrame: planned.atFrame,
      targetSelector: planned.target.selector,
      targetAccessibilityName: planned.target.accessibleName,
      input: planned.input,
      semanticProbe: planned.semantic.probe,
      semanticPreState: planned.semantic.beforeEquals,
      semanticExpectedPreState: planned.semantic.beforeEquals,
      semanticExpectedState: planned.semantic.afterEquals,
      semanticPostState: planned.semantic.afterEquals,
      semanticFrameState: planned.semantic.afterEquals
    };
    const observed = {
      atFrame: receipt.atFrame,
      targetSelector: receipt.targetSelector,
      targetAccessibilityName: receipt.targetAccessibilityName,
      input: receipt.input,
      semanticProbe: receipt.semanticProbe,
      semanticPreState: receipt.semanticPreState,
      semanticExpectedPreState: receipt.semanticExpectedPreState,
      semanticExpectedState: receipt.semanticExpectedState,
      semanticPostState: receipt.semanticPostState,
      semanticFrameState: receipt.semanticFrameState
    };
    if (canonicalHash(expected) !== canonicalHash(observed)) fail('RECORDING_PLAN_MISMATCH', 'Recording action receipt does not match its exact target, input, probe, or semantic states.');
  });
  return true;
}

function recordingCompletionMarker(receipt) {
  return `sha256:${canonicalHash({
    recordingId: receipt.recordingId,
    route: receipt.route,
    captureKind: receipt.captureKind,
    sourceSha: receipt.sourceSha,
    artifactSha: receipt.artifactSha,
    componentShas: receipt.componentShas,
    tuple: receipt.tuple,
    encoder: receipt.encoder,
    timing: receipt.timing,
    frames: receipt.frames,
    actions: receipt.actions,
    output: receipt.output,
    privacy: receipt.privacy,
    inspection: receipt.inspection,
    pendingInspection: receipt.pendingInspection,
    completed: receipt.completed,
    capturedAt: receipt.capturedAt
  })}`;
}

async function inspectRecording(plan, recording, inspectionPath) {
  const frozenEncoder = await readFrozenRecordingEncoder(plan, recording);
  const receiptPath = path.join(plan.outputRoot, 'recordings', `${recording.recordingId}.receipt.json`);
  const receipt = await readJson(receiptPath);
  assertExactKeys(assertObject(receipt, 'recording receipt'), PENDING_RECEIPT_KEYS, 'recording receipt');
  if (receipt?.schemaVersion !== 1 || receipt.recordingId !== recording.recordingId || receipt.pendingInspection !== true) fail('INVALID_RECORDING_RECEIPT', 'Recording receipt is not pending the requested inspection.');
  validateRecordingPrivacy(receipt.privacy, false);
  await assertPlanBindings(plan);
  await assertPinnedArtifact(recording.encoder.path, recording.encoder.sha256);
  const expectedBinding = {
    sourceSha: plan.sourceSha,
    artifactSha: plan.artifact.primary.sha256,
    componentShas: plan.artifact.components.map((item) => ({ id: item.id, sha256: item.sha256 })),
    tuple: plan.tuple,
    encoder: { kind: recording.encoder.kind, sha256: recording.encoder.sha256 },
    timing: { frameRate: recording.frameRate, durationSeconds: recording.durationSeconds, frameCount: recording.frameCount }
  };
  const observedBinding = {
    sourceSha: receipt.sourceSha,
    artifactSha: receipt.artifactSha,
    componentShas: receipt.componentShas,
    tuple: receipt.tuple,
    encoder: receipt.encoder,
    timing: receipt.timing
  };
  if (canonicalHash(expectedBinding) !== canonicalHash(observedBinding)) fail('RECORDING_PLAN_MISMATCH', 'Recording receipt does not match the exact source, package, tuple, encoder, or timing plan.');
  if (!Array.isArray(receipt.frames) || receipt.frames.length !== recording.frameCount || !Array.isArray(receipt.actions) || receipt.actions.length !== recording.actions.length) {
    fail('INVALID_RECORDING_RECEIPT', 'Recording frame or action inventory is incomplete.');
  }
  for (let index = 0; index < receipt.frames.length; index += 1) {
    const frame = receipt.frames[index];
    assertExactKeys(assertObject(frame, `recording frame ${index}`), new Set(['index', 'path', 'sha256', 'width', 'height']), `recording frame ${index}`);
    if (frame?.index !== index) fail('INVALID_RECORDING_RECEIPT', 'Recording frame indexes must be complete and ordered.');
    const framePath = (await strictChild(path.join(plan.outputRoot, safeRelative(frame.path, 'recording frame path')), plan.outputRoot, 'recording frame path')).child;
    const frameMedia = await inspectPng(framePath, { requireNonblank: true });
    if (frameMedia.sha256 !== frame.sha256 || frameMedia.width !== frame.width || frameMedia.height !== frame.height) fail('STALE_RECORDING', 'A retained recording frame changed before inspection completed.');
  }
  validateRecordingActionReceipts(recording, receipt.actions);
  assertExactKeys(assertObject(receipt.output, 'recording output receipt'), new Set(['path', 'sha256', 'width', 'height', 'frames', 'mimeType', 'decoderRoundTrip']), 'recording output receipt');
  const outputPath = (await strictChild(path.join(plan.outputRoot, receipt.output.path), plan.outputRoot, 'recording output')).child;
  const media = await inspectWebp(outputPath, { requireAnimation: true });
  if (media.sha256 !== receipt.output.sha256 || media.frames !== receipt.output.frames) fail('STALE_RECORDING', 'Recording bytes changed before inspection completed.');
  runDecoder(frozenEncoder.executablePath, outputPath);
  const inspection = await readJson(inspectionPath, 64 * 1024);
  assertExactKeys(assertObject(inspection, 'recording inspection'), new Set([
    'schemaVersion', 'recordingId', 'outputSha256', 'frameInventorySha256', 'everyFrameInspected', 'sensitiveDataReviewed',
    'expectedSurfaceOnly', 'expectedFlowVisible', 'noClipping', 'reviewer'
  ]), 'recording inspection');
  if (inspection.schemaVersion !== 1 || inspection.recordingId !== recording.recordingId || inspection.outputSha256 !== media.sha256 ||
      inspection.frameInventorySha256 !== canonicalHash(receipt.frames)) fail('INVALID_RECORDING_INSPECTION', 'Recording inspection does not bind the exact output and frame inventory.');
  for (const key of ['everyFrameInspected', 'sensitiveDataReviewed', 'expectedSurfaceOnly', 'expectedFlowVisible', 'noClipping']) {
    if (inspection[key] !== true) fail('RECORDING_INSPECTION_FAILED', 'Recording inspection did not approve every required property.');
  }
  boundedString(inspection.reviewer, 'recording reviewer', { max: 128 });
  receipt.privacy.sensitiveDataReviewed = true;
  receipt.privacy.everyFrameInspected = true;
  receipt.privacy.expectedSurfaceOnly = inspection.expectedSurfaceOnly;
  receipt.inspection = {
    outputSha256: inspection.outputSha256,
    frameInventorySha256: inspection.frameInventorySha256,
    everyFrameInspected: inspection.everyFrameInspected,
    sensitiveDataReviewed: inspection.sensitiveDataReviewed,
    expectedSurfaceOnly: inspection.expectedSurfaceOnly,
    expectedFlowVisible: inspection.expectedFlowVisible,
    noClipping: inspection.noClipping,
    reviewer: inspection.reviewer,
    inspectedAt: new Date().toISOString()
  };
  receipt.pendingInspection = false;
  receipt.completed = true;
  receipt.completionMarker = recordingCompletionMarker(receipt);
  assertPublicReceiptValue(receipt, 'recording receipt');
  await atomicWriteJson(receiptPath, receipt);
  return verifyCompletedRecording(plan, recording);
}

async function verifyCompletedRecording(plan, recording) {
  const frozenEncoder = await readFrozenRecordingEncoder(plan, recording);
  await assertPlanBindings(plan);
  await assertPinnedArtifact(recording.encoder.path, recording.encoder.sha256);
  const receiptPath = path.join(plan.outputRoot, 'recordings', `${recording.recordingId}.receipt.json`);
  const receipt = await readJson(receiptPath);
  assertExactKeys(assertObject(receipt, 'completed recording receipt'), COMPLETED_RECEIPT_KEYS, 'completed recording receipt');
  if (receipt.schemaVersion !== 1 || receipt.recordingId !== recording.recordingId || receipt.pendingInspection !== false || receipt.completed !== true) {
    fail('INVALID_RECORDING_RECEIPT', 'Recording receipt is not complete.');
  }
  const expectedBinding = {
    sourceSha: plan.sourceSha,
    artifactSha: plan.artifact.primary.sha256,
    componentShas: plan.artifact.components.map((item) => ({ id: item.id, sha256: item.sha256 })),
    tuple: plan.tuple,
    encoder: { kind: recording.encoder.kind, sha256: recording.encoder.sha256 },
    timing: { frameRate: recording.frameRate, durationSeconds: recording.durationSeconds, frameCount: recording.frameCount }
  };
  const observedBinding = {
    sourceSha: receipt.sourceSha,
    artifactSha: receipt.artifactSha,
    componentShas: receipt.componentShas,
    tuple: receipt.tuple,
    encoder: receipt.encoder,
    timing: receipt.timing
  };
  if (canonicalHash(expectedBinding) !== canonicalHash(observedBinding)) fail('RECORDING_PLAN_MISMATCH', 'Completed recording binding changed after inspection.');
  if (!Array.isArray(receipt.frames) || receipt.frames.length !== recording.frameCount) fail('INVALID_RECORDING_RECEIPT', 'Completed recording frame inventory is incomplete.');
  for (let index = 0; index < receipt.frames.length; index += 1) {
    const frame = receipt.frames[index];
    assertExactKeys(assertObject(frame, `recording frame ${index}`), new Set(['index', 'path', 'sha256', 'width', 'height']), `recording frame ${index}`);
    if (frame.index !== index) fail('INVALID_RECORDING_RECEIPT', 'Completed recording frame indexes are not contiguous.');
    const framePath = (await strictChild(path.join(plan.outputRoot, safeRelative(frame.path, 'recording frame path')), plan.outputRoot, 'recording frame path')).child;
    const frameMedia = await inspectPng(framePath, { requireNonblank: true });
    if (frameMedia.sha256 !== frame.sha256 || frameMedia.width !== frame.width || frameMedia.height !== frame.height) fail('STALE_RECORDING', 'A completed recording frame changed.');
  }
  validateRecordingActionReceipts(recording, receipt.actions);
  validateRecordingPrivacy(receipt.privacy, true);
  assertExactKeys(assertObject(receipt.output, 'recording output receipt'), new Set(['path', 'sha256', 'width', 'height', 'frames', 'mimeType', 'decoderRoundTrip']), 'recording output receipt');
  const outputPath = (await strictChild(path.join(plan.outputRoot, safeRelative(receipt.output.path, 'recording output path')), plan.outputRoot, 'recording output path')).child;
  const media = await inspectWebp(outputPath, { requireAnimation: true });
  if (media.sha256 !== receipt.output.sha256 || media.width !== receipt.output.width || media.height !== receipt.output.height ||
      media.frames !== receipt.output.frames || media.frames !== recording.frameCount || receipt.output.decoderRoundTrip !== true) {
    fail('STALE_RECORDING', 'Completed recording output no longer matches its exact receipt.');
  }
  runDecoder(frozenEncoder.executablePath, outputPath);
  assertExactKeys(assertObject(receipt.inspection, 'recording inspection receipt'), new Set([
    'outputSha256', 'frameInventorySha256', 'everyFrameInspected', 'sensitiveDataReviewed',
    'expectedSurfaceOnly', 'expectedFlowVisible', 'noClipping', 'reviewer', 'inspectedAt'
  ]), 'recording inspection receipt');
  if (receipt.inspection.outputSha256 !== media.sha256 || receipt.inspection.frameInventorySha256 !== canonicalHash(receipt.frames) ||
      receipt.inspection.everyFrameInspected !== true || receipt.inspection.sensitiveDataReviewed !== true ||
      receipt.inspection.expectedSurfaceOnly !== true || receipt.inspection.expectedFlowVisible !== true || receipt.inspection.noClipping !== true) {
    fail('RECORDING_INSPECTION_FAILED', 'Completed recording inspection verdict is not fully approved or bound to the exact media.');
  }
  boundedString(receipt.inspection.reviewer, 'recording reviewer', { max: 128 });
  if (receipt.completionMarker !== recordingCompletionMarker(receipt)) fail('STALE_RECORDING', 'Completed recording marker does not match the exact evidence receipt.');
  return { ok: true, recordingId: recording.recordingId, sha256: media.sha256, frames: media.frames, completed: true, completionMarker: receipt.completionMarker };
}

async function exists(target) {
  return Boolean(await fsp.stat(target).catch(() => null));
}

export async function recordingStatus(plan, recording) {
  await assertPlanBindings(plan);
  const receiptPath = (await strictChild(path.join(plan.outputRoot, 'recordings', `${recording.recordingId}.receipt.json`), plan.outputRoot, 'recording receipt')).child;
  const progressPath = (await strictChild(path.join(plan.outputRoot, 'recordings', `${recording.recordingId}.progress.json`), plan.outputRoot, 'recording progress')).child;
  const frameDirectory = (await strictChild(path.join(plan.outputRoot, 'recording-frames', recording.recordingId), plan.outputRoot, 'recording frame directory')).child;
  const outputPath = (await strictChild(path.join(plan.outputRoot, recording.outputFile), plan.outputRoot, 'recording output')).child;
  if (await exists(receiptPath)) {
    const receipt = await readJson(receiptPath);
    if (receipt?.pendingInspection === false && receipt?.completed === true) {
      const verified = await verifyCompletedRecording(plan, recording);
      return { ...verified, action: 'complete' };
    }
    assertExactKeys(assertObject(receipt, 'recording receipt'), PENDING_RECEIPT_KEYS, 'recording receipt');
    if (receipt.schemaVersion !== 1 || receipt.recordingId !== recording.recordingId || receipt.pendingInspection !== true) {
      fail('INVALID_RECORDING_RECEIPT', 'Recording receipt is neither a valid pending nor completed record.');
    }
    assertPublicReceiptValue(receipt, 'recording receipt');
    return { ok: true, recordingId: recording.recordingId, status: 'captured', action: 'inspect', completed: false };
  }
  if (await exists(progressPath)) {
    const progress = await readRecordingProgress(progressPath, plan, recording);
    const inputMayHaveOccurred = progress.actions.some((action) => action.phase !== 'pending');
    return {
      ok: true,
      recordingId: recording.recordingId,
      status: 'interrupted',
      nextFrame: progress.nextFrame,
      action: inputMayHaveOccurred ? 'restart_run' : 'reset',
      inputMayHaveOccurred,
      completed: false
    };
  }
  if (await exists(frameDirectory) || await exists(outputPath)) {
    fail('RECORDING_PROGRESS_MISSING', 'Partial recording bytes exist without the exact durable recovery record.');
  }
  return { ok: true, recordingId: recording.recordingId, status: 'pending', action: 'capture', completed: false };
}

export async function resetRecording(plan, recording) {
  await assertPlanBindings(plan);
  const receiptPath = (await strictChild(path.join(plan.outputRoot, 'recordings', `${recording.recordingId}.receipt.json`), plan.outputRoot, 'recording receipt')).child;
  const progressPath = (await strictChild(path.join(plan.outputRoot, 'recordings', `${recording.recordingId}.progress.json`), plan.outputRoot, 'recording progress')).child;
  const frameDirectory = (await strictChild(path.join(plan.outputRoot, 'recording-frames', recording.recordingId), plan.outputRoot, 'recording frame directory')).child;
  const outputPath = (await strictChild(path.join(plan.outputRoot, recording.outputFile), plan.outputRoot, 'recording output')).child;
  if (await exists(receiptPath)) fail('RECORDING_ALREADY_CAPTURED', 'A recording receipt already exists and must not be reset.');
  const progress = await readRecordingProgress(progressPath, plan, recording);
  if (progress.actions.some((action) => action.phase !== 'pending')) {
    fail('AMBIGUOUS_INPUT_RECOVERY', 'Recording input may already have occurred. Start a fresh isolated run instead of resetting.');
  }
  await fsp.rm(outputPath, { force: true });
  await fsp.rm(frameDirectory, { recursive: true, force: true });
  await fsp.rm(progressPath, { force: true });
  const frozenEncoder = frozenEncoderPaths(plan, recording);
  await fsp.rm(frozenEncoder.root, { recursive: true, force: true });
  await fsp.rm(frozenEncoder.bindingPath, { force: true });
  return { ok: true, recordingId: recording.recordingId, reset: true, action: 'capture' };
}

async function main() {
  const command = process.argv[2];
  if (command === 'self-test') return { ok: true, contract: 'window-only-recording-v1', commands: ['capture', 'inspect', 'verify', 'status', 'reset'] };
  const planPath = argumentValue('--plan');
  const recordingPath = argumentValue('--recording');
  if (!planPath || !recordingPath) fail('MISSING_PLAN', 'Command requires --plan and --recording.');
  const plan = await loadPlan(planPath);
  const recording = validateRecordingPlan(await readJson(recordingPath));
  if (command === 'capture') return withRunLock(plan, `recording-capture:${recording.recordingId}`, () => captureRecording(plan, recording));
  if (command === 'inspect') {
    const inspectionPath = argumentValue('--inspection');
    if (!inspectionPath || !path.isAbsolute(inspectionPath)) fail('MISSING_INSPECTION', 'Inspect requires an absolute --inspection path.');
    return withRunLock(plan, `recording-inspect:${recording.recordingId}`, () => inspectRecording(plan, recording, inspectionPath));
  }
  if (command === 'verify') return verifyCompletedRecording(plan, recording);
  if (command === 'status') return recordingStatus(plan, recording);
  if (command === 'reset') return withRunLock(plan, `recording-reset:${recording.recordingId}`, () => resetRecording(plan, recording));
  fail('UNKNOWN_COMMAND', 'Recording helper command is unsupported.');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stdout.write(`${JSON.stringify(toPublicFailure(error))}\n`);
    process.exitCode = 1;
  });
}

export {
  captureRecording,
  inspectRecording,
  recordingCompletionMarker,
  validateRecordingActionReceipts,
  validateRecordingPrivacy,
  verifyCompletedRecording
};
