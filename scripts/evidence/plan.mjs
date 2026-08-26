import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  LIMITS,
  assertExactKeys,
  assertObject,
  assertPinnedArtifact,
  assertPublicReceiptValue,
  atomicWriteJson,
  boundedString,
  canonicalHash,
  fail,
  readJson,
  rejectLinkComponents,
  safeRelative,
  sha256Bytes,
  strictChild
} from './common.mjs';

const TOP_LEVEL_KEYS = new Set([
  'schemaVersion', 'runId', 'route', 'captureKind', 'repoRoot', 'sourceSha',
  'runRoot', 'artifact', 'artifactPaths', 'application', 'isolation', 'cdp',
  'mcp', 'window', 'tuple', 'privacyPatterns', 'allowedNetworkOrigins', 'steps'
]);

export const RUN_INITIALIZATION_FILE = '.evidence-run-initializing.json';

export const BASELINE_PRIVACY_PATTERNS = Object.freeze([
  Object.freeze({
    id: 'private-key',
    source: '-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    flags: 'i'
  }),
  Object.freeze({
    id: 'credential-assignment',
    source: '(?:password|passwd|api[_-]?key|secret|access[_-]?token)\\s*[:=]\\s*["\\\']?[^\\s"\\\'<>]{8,}',
    flags: 'i'
  }),
  Object.freeze({
    id: 'bearer-secret',
    source: '\\bBearer\\s+[A-Za-z0-9._~+/=-]{8,}',
    flags: 'i'
  }),
  Object.freeze({
    id: 'user-profile-path',
    source: '\\b[A-Za-z]:[\\\\/](?:Users|Documents and Settings)[\\\\/][^\\\\/\\s"\\\'<>]+',
    flags: 'i'
  })
]);

const SAFE_SEMANTIC_PROPERTIES = new Set([
  'checked', 'hidden', 'open', 'disabled', 'selectedIndex'
]);
const SAFE_SEMANTIC_ATTRIBUTES = new Set([
  'aria-selected', 'aria-expanded', 'aria-checked', 'aria-pressed', 'aria-hidden',
  'aria-current', 'data-state', 'data-status', 'hidden', 'open', 'disabled',
  'checked', 'selected', 'role'
]);

function absolute(value, label) {
  boundedString(value, label, { max: 32_768 });
  if (!path.isAbsolute(value)) fail('PATH_NOT_ABSOLUTE', `${label} must be absolute.`);
  return path.resolve(value);
}

export function normalizedPathHash(value) {
  let normalized = path.resolve(value).normalize('NFC').replaceAll('\\', '/');
  if (process.platform === 'win32') normalized = normalized.toLowerCase();
  return sha256Bytes(Buffer.from(normalized, 'utf8'));
}

function initializationOwner(value) {
  const owner = assertObject(value, 'run initialization owner');
  assertExactKeys(owner, new Set(['pid', 'parentPid', 'creationDate', 'executablePath']), 'run initialization owner');
  if (!Number.isInteger(owner.pid) || owner.pid <= 0 || !Number.isInteger(owner.parentPid) || owner.parentPid < 0 ||
      typeof owner.creationDate !== 'string' || !Number.isFinite(Date.parse(owner.creationDate)) ||
      typeof owner.executablePath !== 'string' || !path.isAbsolute(owner.executablePath)) {
    fail('INVALID_RUN_INITIALIZATION', 'Run initialization owner identity is incomplete.');
  }
  return {
    pid: owner.pid,
    parentPid: owner.parentPid,
    creationDate: owner.creationDate,
    executablePath: path.resolve(owner.executablePath)
  };
}

export function validateRunInitializationBarrier(plan, value) {
  const barrier = assertObject(value, 'run initialization barrier');
  assertExactKeys(barrier, new Set(['schemaVersion', 'runId', 'planHash', 'ownerNonce', 'owner']), 'run initialization barrier');
  if (barrier.schemaVersion !== 1 || barrier.runId !== plan.runId || barrier.planHash !== runOwnershipHash(plan) ||
      typeof barrier.ownerNonce !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(barrier.ownerNonce)) {
    fail('INVALID_RUN_INITIALIZATION', 'Run initialization barrier does not bind the exact task run.');
  }
  return {
    schemaVersion: 1,
    runId: barrier.runId,
    planHash: barrier.planHash,
    ownerNonce: barrier.ownerNonce,
    owner: initializationOwner(barrier.owner)
  };
}

export async function readRunInitializationBarrier(plan) {
  const barrierPath = (await strictChild(path.join(plan.runRoot, RUN_INITIALIZATION_FILE), plan.runRoot, 'run initialization barrier')).child;
  const stat = await fsp.lstat(barrierPath).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return null;
  if (!stat.isFile()) fail('INVALID_RUN_INITIALIZATION', 'Run initialization barrier is not a regular file.');
  return validateRunInitializationBarrier(plan, await readJson(barrierPath, 32 * 1024));
}

function validateArtifact(plan) {
  const binding = assertObject(plan.artifact, 'artifact binding');
  const primary = assertObject(binding.primary, 'primary artifact');
  const components = Array.isArray(binding.components) ? binding.components : null;
  if (!components || components.length < 2 || components.length > 16) fail('INVALID_ARTIFACT_BINDING', 'Artifact binding must include the packaged renderer and build receipt.');
  const records = [primary, ...components].map((item, index) => ({
    id: boundedString(item.id, `artifact ${index} id`, { max: 80, pattern: /^[a-z0-9][a-z0-9._-]*$/ }),
    sha256: boundedString(item.sha256, `artifact ${index} SHA-256`, { pattern: /^[a-f0-9]{64}$/ })
  }));
  if (records[0].id !== 'executable') fail('INVALID_ARTIFACT_BINDING', 'Primary artifact id must be executable.');
  if (new Set(records.map((item) => item.id)).size !== records.length) fail('DUPLICATE_ARTIFACT_ID', 'Artifact ids must be unique.');
  if (!records.some((item) => item.id === 'app-asar') || !records.some((item) => item.id === 'build-receipt')) {
    fail('INCOMPLETE_PACKAGED_BINDING', 'Artifact binding must include app-asar and build-receipt components.');
  }
  const artifactPaths = assertObject(plan.artifactPaths, 'artifact path map');
  if (Object.keys(artifactPaths).length !== records.length) fail('ARTIFACT_SET_MISMATCH', 'Artifact path map must match the exact artifact binding.');
  const paths = {};
  for (const record of records) {
    if (typeof artifactPaths[record.id] !== 'string') fail('ARTIFACT_SET_MISMATCH', 'Artifact path map is missing a bound id.');
    paths[record.id] = absolute(artifactPaths[record.id], `artifact path ${record.id}`);
  }
  return { artifact: { primary: records[0], components: records.slice(1) }, artifactPaths: paths };
}

function validateMcp(mcp) {
  assertExactKeys(assertObject(mcp, 'MCP settings'), new Set(['endpoint', 'timeoutMs']), 'MCP settings');
  let endpoint;
  try {
    endpoint = new URL(boundedString(mcp.endpoint, 'MCP endpoint', { max: 2_048 }));
  } catch {
    fail('INVALID_MCP_ENDPOINT', 'MCP endpoint must be an absolute URL.');
  }
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || endpoint.pathname !== '/mcp' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    fail('INVALID_MCP_ENDPOINT', 'MCP endpoint must be the exact credential-free 127.0.0.1 HTTP /mcp route with an explicit port.');
  }
  if (!Number.isInteger(mcp.timeoutMs) || mcp.timeoutMs < 1_000 || mcp.timeoutMs > 120_000) {
    fail('INVALID_TIMEOUT', 'MCP timeout is outside the supported bounds.');
  }
  return { endpoint: endpoint.href, timeoutMs: mcp.timeoutMs };
}

function validateApplication(application, artifact, artifactPaths) {
  assertExactKeys(assertObject(application, 'application'), new Set(['executableArtifactId', 'arguments']), 'application');
  const executableArtifactId = boundedString(application.executableArtifactId, 'executable artifact id', { max: 80, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
  if (executableArtifactId !== artifact.primary.id) fail('EXECUTABLE_BINDING_MISMATCH', 'Application executable must be the primary packaged artifact.');
  if (!Array.isArray(application.arguments) || application.arguments.length > 64 || !application.arguments.every((item) => typeof item === 'string' && item.length <= 4_096 && !/[\0\r\n]/.test(item))) {
    fail('INVALID_ARGUMENTS', 'Application arguments must be bounded strings without control lines.');
  }
  assertPublicReceiptValue(application.arguments, 'application arguments');
  const forbiddenPrefixes = [
    '--evidence-mode', '--evidence-app-data=', '--evidence-user-data=', '--user-data-dir=',
    '--remote-debugging-port=', '--remote-debugging-address=', '--remote-debugging-pipe',
    '--remote-allow-origins=', '--disable-web-security', '--allow-file-access-from-files',
    '--no-sandbox', '--disable-sandbox'
  ];
  if (application.arguments.some((argument) => forbiddenPrefixes.some((prefix) => argument === prefix || argument.startsWith(prefix)))) {
    fail('DUPLICATE_EVIDENCE_SWITCH', 'Application arguments must not predeclare harness-owned isolation or debugging switches.');
  }
  return { executableArtifactId, executablePath: artifactPaths[executableArtifactId], arguments: [...application.arguments] };
}

function validateIsolation(isolation) {
  assertExactKeys(assertObject(isolation, 'isolation'), new Set(['appDataDirectory', 'userDataDirectory', 'receiptFile', 'appDataMarkerFile']), 'isolation');
  const childName = (value, label) => boundedString(value, label, { max: 96, pattern: /^[a-z0-9][a-z0-9._-]*$/ });
  const appDataDirectory = childName(isolation.appDataDirectory, 'appData directory');
  const userDataDirectory = childName(isolation.userDataDirectory, 'userData directory');
  if (appDataDirectory === userDataDirectory) fail('OVERLAPPING_ISOLATION', 'appData and userData directories must be distinct.');
  return {
    appDataDirectory,
    userDataDirectory,
    receiptFile: childName(isolation.receiptFile, 'isolation receipt file'),
    appDataMarkerFile: childName(isolation.appDataMarkerFile, 'appData marker file')
  };
}

function validateCdp(cdp) {
  assertExactKeys(assertObject(cdp, 'CDP settings'), new Set(['port', 'expectedUrl', 'timeoutMs']), 'CDP settings');
  if (!Number.isInteger(cdp.port) || cdp.port < 1_024 || cdp.port > 65_535) fail('INVALID_CDP_PORT', 'CDP port must be 1024 through 65535.');
  let expectedUrl;
  try { expectedUrl = new URL(boundedString(cdp.expectedUrl, 'expected URL', { max: 8_192 })).href; } catch { fail('INVALID_EXPECTED_URL', 'Expected CDP URL must be absolute.'); }
  if (!Number.isInteger(cdp.timeoutMs) || cdp.timeoutMs < 1_000 || cdp.timeoutMs > 120_000) fail('INVALID_TIMEOUT', 'CDP timeout is outside the supported bounds.');
  return { port: cdp.port, endpoint: `http://127.0.0.1:${cdp.port}`, expectedUrl, timeoutMs: cdp.timeoutMs };
}

function validateWindow(windowValue) {
  assertExactKeys(assertObject(windowValue, 'window'), new Set(['titlePattern', 'classPattern', 'timeoutMs']), 'window');
  const titlePattern = boundedString(windowValue.titlePattern, 'window title pattern', { max: 256 });
  const classPattern = boundedString(windowValue.classPattern, 'window class pattern', { max: 256 });
  try { new RegExp(titlePattern); new RegExp(classPattern); } catch { fail('INVALID_WINDOW_PATTERN', 'Window title or class pattern is invalid.'); }
  if (!Number.isInteger(windowValue.timeoutMs) || windowValue.timeoutMs < 1_000 || windowValue.timeoutMs > 120_000) fail('INVALID_TIMEOUT', 'Window timeout is outside the supported bounds.');
  return { titlePattern, classPattern, timeoutMs: windowValue.timeoutMs };
}

function validateTuple(tuple) {
  assertExactKeys(assertObject(tuple, 'tuple'), new Set(['viewport', 'scale', 'theme', 'language']), 'tuple');
  assertExactKeys(assertObject(tuple.viewport, 'viewport'), new Set(['width', 'height']), 'viewport');
  if (!Number.isInteger(tuple.viewport.width) || tuple.viewport.width < 320 || tuple.viewport.width > 8_192 || !Number.isInteger(tuple.viewport.height) || tuple.viewport.height < 240 || tuple.viewport.height > 8_192) {
    fail('INVALID_TUPLE', 'Viewport is outside the supported bounds.');
  }
  if (typeof tuple.scale !== 'number' || tuple.scale < 0.5 || tuple.scale > 4) fail('INVALID_TUPLE', 'Scale is outside the supported bounds.');
  return {
    viewport: { width: tuple.viewport.width, height: tuple.viewport.height },
    capturePixelSize: {
      width: Math.round(tuple.viewport.width * tuple.scale),
      height: Math.round(tuple.viewport.height * tuple.scale)
    },
    scale: tuple.scale,
    theme: boundedString(tuple.theme, 'theme', { max: 64, pattern: /^[a-z0-9][a-z0-9._-]*$/ }),
    language: boundedString(tuple.language, 'language', { max: 64, pattern: /^[a-z0-9][a-z0-9._-]*$/ })
  };
}

function validatePrivacyPatterns(patterns) {
  if (!Array.isArray(patterns) || patterns.length !== BASELINE_PRIVACY_PATTERNS.length) fail('MISSING_BASELINE_PRIVACY_PATTERN', 'Privacy pattern inventory must contain the exact fixed baseline records.');
  const normalized = patterns.map((item) => {
    assertExactKeys(assertObject(item, 'privacy pattern'), new Set(['id', 'source', 'flags']), 'privacy pattern');
    const record = {
      id: boundedString(item.id, 'privacy pattern id', { max: 64, pattern: /^[a-z0-9][a-z0-9._-]*$/ }),
      source: boundedString(item.source, 'privacy pattern source', { max: 512 }),
      flags: boundedString(item.flags, 'privacy pattern flags', { max: 8, pattern: /^[gimsuy]*$/ })
    };
    try { new RegExp(record.source, record.flags); } catch { fail('INVALID_PRIVACY_PATTERNS', 'Privacy pattern is invalid.'); }
    return record;
  });
  if (new Set(normalized.map((item) => item.id)).size !== normalized.length) fail('INVALID_PRIVACY_PATTERNS', 'Privacy pattern ids must be unique.');
  for (let index = 0; index < BASELINE_PRIVACY_PATTERNS.length; index += 1) {
    const required = BASELINE_PRIVACY_PATTERNS[index];
    const observed = normalized[index];
    if (!observed || observed.id !== required.id || observed.source !== required.source || observed.flags !== required.flags) {
      fail('MISSING_BASELINE_PRIVACY_PATTERN', 'Privacy pattern inventory is missing or altered one required baseline class.');
    }
  }
  return normalized;
}

export function validateSemanticProbe(value, label = 'semantic probe') {
  const probe = assertObject(value, label);
  const kind = boundedString(probe.kind, `${label} kind`, {
    max: 32,
    pattern: /^(?:attribute|property|visible|count)$/
  });
  const needsName = kind === 'attribute' || kind === 'property';
  assertExactKeys(probe, needsName ? new Set(['kind', 'selector', 'name']) : new Set(['kind', 'selector']), label);
  const normalized = {
    kind,
    selector: boundedString(probe.selector, `${label} selector`, { max: 1_024 })
  };
  if (kind === 'attribute') {
    normalized.name = boundedString(probe.name, `${label} attribute name`, {
      max: 128,
      pattern: /^[A-Za-z_:][A-Za-z0-9_.:-]*$/
    });
    if (!SAFE_SEMANTIC_ATTRIBUTES.has(normalized.name)) {
      fail('UNSAFE_SEMANTIC_PROBE', 'Semantic attribute probe is not in the fixed read-only state allowlist.');
    }
  }
  if (kind === 'property') {
    normalized.name = boundedString(probe.name, `${label} property name`, { max: 64 });
    if (!SAFE_SEMANTIC_PROPERTIES.has(normalized.name)) {
      fail('UNSAFE_SEMANTIC_PROBE', 'Semantic property probe is not in the fixed read-only allowlist.');
    }
  }
  return normalized;
}

function validateAllowedOrigins(origins) {
  if (!Array.isArray(origins) || origins.length > 32) fail('INVALID_NETWORK_ORIGINS', 'Allowed network-origin inventory is invalid.');
  const normalized = origins.map((raw) => {
    let url;
    try {
      url = new URL(boundedString(raw, 'allowed origin', { max: 2_048 }));
    } catch {
      fail('INVALID_NETWORK_ORIGINS', 'Allowed network entry must be an absolute origin.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail('INVALID_NETWORK_ORIGINS', 'Allowed network entry must be an origin only.');
    return url.origin;
  });
  if (new Set(normalized).size !== normalized.length) fail('INVALID_NETWORK_ORIGINS', 'Allowed network origins must be unique.');
  return normalized;
}

function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > LIMITS.steps) fail('INVALID_STEP_INVENTORY', 'Capture plan must register one through 512 steps.');
  const normalized = steps.map((step, index) => {
    assertExactKeys(assertObject(step, `step ${index}`), new Set(['id', 'target', 'input', 'expectedTransition', 'semantic']), `step ${index}`);
    const target = assertObject(step.target, `step ${index} target`);
    assertExactKeys(target, new Set(['selector', 'accessibleName']), `step ${index} target`);
    const input = assertObject(step.input, `step ${index} input`);
    if (!['mouse_click', 'win_send_keys'].includes(input.method)) fail('VISIBLE_INPUT_FORBIDDEN', 'Every step input must use an HWND-targeted cheap headless method.');
    if (input.method === 'mouse_click') {
      assertExactKeys(input, new Set(['method', 'x', 'y', 'button', 'clicks']), `step ${index} input`);
      if (!Number.isInteger(input.x) || input.x < 0 || !Number.isInteger(input.y) || input.y < 0) fail('INVALID_INPUT', 'Mouse input requires non-negative client coordinates.');
      if (!['left', 'right', 'middle'].includes(input.button) || !Number.isInteger(input.clicks) || input.clicks < 1 || input.clicks > 2) {
        fail('INVALID_INPUT', 'Mouse input requires a supported button and one or two clicks.');
      }
    } else {
      assertExactKeys(input, new Set(['method', 'keys']), `step ${index} input`);
      if (!Array.isArray(input.keys) || input.keys.length < 1 || input.keys.length > 6 || !input.keys.every((key) => typeof key === 'string' && /^[a-z0-9_+-]{1,24}$/i.test(key))) {
        fail('INVALID_INPUT', 'Key input requires one through six bounded key names.');
      }
    }
    const semantic = assertObject(step.semantic, `step ${index} semantic`);
    assertExactKeys(semantic, new Set(['probe', 'beforeEquals', 'afterEquals', 'pollIntervalMs', 'timeoutMs']), `step ${index} semantic`);
    const probe = validateSemanticProbe(semantic.probe, `step ${index} semantic probe`);
    assertPublicReceiptValue(semantic.beforeEquals, `step ${index} expected pre-action semantic value`);
    assertPublicReceiptValue(semantic.afterEquals, `step ${index} expected semantic value`);
    if (!Number.isInteger(semantic.pollIntervalMs) || semantic.pollIntervalMs < 50 || semantic.pollIntervalMs > 5_000 ||
        !Number.isInteger(semantic.timeoutMs) || semantic.timeoutMs < 100 || semantic.timeoutMs > 120_000) {
      fail('INVALID_POLL', 'Step semantic polling bounds are invalid.');
    }
    return {
      id: boundedString(step.id, `step ${index} id`, { max: 96, pattern: /^[a-z0-9][a-z0-9._-]*$/ }),
      target: {
        selector: boundedString(target.selector, `step ${index} selector`, { max: 1_024 }),
        accessibleName: boundedString(target.accessibleName, `step ${index} accessible name`, { max: 256 })
      },
      input: structuredClone(input),
      expectedTransition: boundedString(step.expectedTransition, `step ${index} expected transition`, { max: 1_024 }),
      semantic: {
        probe,
        beforeEquals: structuredClone(semantic.beforeEquals),
        afterEquals: structuredClone(semantic.afterEquals),
        pollIntervalMs: semantic.pollIntervalMs,
        timeoutMs: semantic.timeoutMs
      }
    };
  });
  if (new Set(normalized.map((step) => step.id)).size !== normalized.length) fail('DUPLICATE_STEP_ID', 'Step ids must be unique.');
  return normalized;
}

export function validatePlan(value) {
  assertExactKeys(assertObject(value, 'evidence plan'), TOP_LEVEL_KEYS, 'evidence plan');
  if (value.schemaVersion !== 1 || value.route !== 'cheap-lowlevel-headless' || value.captureKind !== 'window') {
    fail('VISIBLE_CAPTURE_FORBIDDEN', 'Evidence plan must use schema 1, cheap-lowlevel-headless, and window-only capture.');
  }
  const runId = boundedString(value.runId, 'run id', { max: 128, pattern: /^[A-Za-z0-9._-]+$/ });
  const repoRoot = absolute(value.repoRoot, 'repository root');
  const sourceSha = boundedString(value.sourceSha, 'source SHA', { pattern: /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/ });
  const runRoot = absolute(value.runRoot, 'run root');
  if (path.basename(runRoot) !== '.hair-growth-evidence-task' || path.basename(path.dirname(runRoot)) !== runId) {
    fail('INVALID_RUN_ROOT', 'Run root must be the exact .hair-growth-evidence-task child of a unique run-id directory.');
  }
  const tempRoot = path.resolve(os.tmpdir());
  const tempRelative = path.relative(tempRoot, runRoot);
  if (!tempRelative || tempRelative === '..' || tempRelative.startsWith(`..${path.sep}`) || path.isAbsolute(tempRelative)) {
    fail('INVALID_RUN_ROOT', 'Run root must be a strict child of the operating-system temporary directory.');
  }
  const { artifact, artifactPaths } = validateArtifact(value);
  const application = validateApplication(value.application, artifact, artifactPaths);
  const isolation = validateIsolation(value.isolation);
  const cdp = validateCdp(value.cdp);
  const mcp = validateMcp(value.mcp);
  const windowValue = validateWindow(value.window);
  const tuple = validateTuple(value.tuple);
  const privacyPatterns = validatePrivacyPatterns(value.privacyPatterns);
  const allowedNetworkOrigins = validateAllowedOrigins(value.allowedNetworkOrigins);
  const steps = validateSteps(value.steps);
  return {
    schemaVersion: 1,
    runId,
    route: value.route,
    captureKind: value.captureKind,
    repoRoot,
    sourceSha,
    runRoot,
    outputRoot: path.join(runRoot, 'output'),
    artifact,
    artifactPaths,
    application,
    isolation,
    cdp,
    mcp,
    window: windowValue,
    tuple,
    privacyPatterns,
    allowedNetworkOrigins,
    steps
  };
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail('INVALID_BUILD_RECEIPT', `${label} must be a positive integer.`);
  return value;
}

function receiptHash(value, label) {
  return boundedString(value, label, { pattern: /^[a-f0-9]{64}$/ });
}

function validateSourceBindingRecord(value, label) {
  assertExactKeys(assertObject(value, label), new Set(['fileCount', 'bytes', 'inventorySha256', 'files']), label);
  const fileCount = positiveInteger(value.fileCount, `${label} file count`);
  const aggregateBytes = positiveInteger(value.bytes, `${label} aggregate bytes`);
  const inventorySha256 = receiptHash(value.inventorySha256, `${label} inventory SHA-256`);
  if (!Array.isArray(value.files) || value.files.length < 1 || value.files.length > 20_000 || value.files.length !== fileCount) {
    fail('INVALID_BUILD_RECEIPT', `${label} file inventory count is invalid.`);
  }
  const records = value.files.map((raw, index) => {
    const record = assertObject(raw, `${label} file ${index}`);
    assertExactKeys(record, new Set(['path', 'source', 'bytes', 'sha256']), `${label} file ${index}`);
    return {
      path: safeRelative(record.path, `${label} file ${index} path`).replaceAll('\\', '/'),
      source: boundedString(record.source, `${label} file ${index} source`, { max: 8_192 }),
      bytes: positiveInteger(record.bytes, `${label} file ${index} bytes`),
      sha256: receiptHash(record.sha256, `${label} file ${index} SHA-256`)
    };
  });
  const sortedPaths = records.map((record) => record.path).toSorted();
  if (new Set(sortedPaths).size !== sortedPaths.length || records.some((record, index) => record.path !== sortedPaths[index])) {
    fail('INVALID_BUILD_RECEIPT', `${label} records must use unique paths sorted in ascending order.`);
  }
  if (records.reduce((sum, record) => sum + record.bytes, 0) !== aggregateBytes) {
    fail('INVALID_BUILD_RECEIPT', `${label} aggregate bytes do not match the complete file inventory.`);
  }
  const canonical = records.map((record) => `${record.path}\0${record.bytes}\0${record.sha256}\n`).join('');
  if (sha256Bytes(Buffer.from(canonical, 'utf8')) !== inventorySha256) {
    fail('INVALID_BUILD_RECEIPT', `${label} canonical inventory SHA-256 does not match the complete file inventory.`);
  }
  return { fileCount, bytes: aggregateBytes, inventorySha256, files: records };
}

export async function verifyPackagedReceipt(plan) {
  const receiptPath = plan.artifactPaths['build-receipt'];
  const receipt = await readJson(receiptPath);
  assertExactKeys(assertObject(receipt, 'packaged application receipt'), new Set([
    'schemaVersion', 'version', 'sourceCommit', 'directory', 'executable', 'appAsar',
    'provenance', 'sourcePreservation', 'icon', 'sourceBinding'
  ]), 'packaged application receipt');
  if (receipt.schemaVersion !== 2) fail('INVALID_BUILD_RECEIPT', 'Packaged application receipt schema must be version 2.');
  boundedString(receipt.version, 'packaged version', { max: 64, pattern: /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/ });
  const sourceCommit = boundedString(receipt.sourceCommit, 'packaged source commit', { pattern: /^[a-f0-9]{40}$/ });
  if (sourceCommit !== plan.sourceSha) fail('STALE_SOURCE', 'Packaged application receipt does not bind the planned source commit.');
  const directory = absolute(receipt.directory, 'disposable package directory');
  if (path.parse(directory).root === directory) fail('INVALID_BUILD_RECEIPT', 'Disposable package directory must not be a filesystem root.');
  await rejectLinkComponents(directory);
  const expectedReceiptPath = (await strictChild(path.resolve(directory, 'dist', 'package', 'packaged-app-manifest.json'), directory, 'packaged application receipt path')).child;
  const resolveReceiptPath = async (value, label) => {
    const relative = safeRelative(value, label);
    return (await strictChild(path.resolve(directory, relative), directory, label)).child;
  };

  assertExactKeys(assertObject(receipt.executable, 'packaged executable'), new Set(['file', 'path', 'bytes', 'sha256', 'signing']), 'packaged executable');
  boundedString(receipt.executable.file, 'packaged executable file', { max: 256 });
  positiveInteger(receipt.executable.bytes, 'packaged executable bytes');
  const executableHash = receiptHash(receipt.executable.sha256, 'packaged executable SHA-256');
  if (receipt.executable.signing !== 'NotSigned') fail('SIGNING_POLICY_VIOLATION', 'Packaged executable must report NotSigned.');
  const executablePath = await resolveReceiptPath(receipt.executable.path, 'packaged executable path');
  if (path.basename(executablePath) !== receipt.executable.file) fail('INVALID_BUILD_RECEIPT', 'Packaged executable file and path disagree.');

  assertExactKeys(assertObject(receipt.appAsar, 'packaged app.asar'), new Set(['file', 'path', 'bytes', 'sha256']), 'packaged app.asar');
  if (receipt.appAsar.file !== 'resources/app.asar') fail('INVALID_BUILD_RECEIPT', 'Packaged app.asar file identity is invalid.');
  positiveInteger(receipt.appAsar.bytes, 'packaged app.asar bytes');
  const appAsarHash = receiptHash(receipt.appAsar.sha256, 'packaged app.asar SHA-256');
  const appAsarPath = await resolveReceiptPath(receipt.appAsar.path, 'packaged app.asar path');

  assertExactKeys(assertObject(receipt.provenance, 'packaged provenance'), new Set(['logicalPath', 'stagedPath', 'stagedSha256', 'packagedSha256']), 'packaged provenance');
  if (receipt.provenance.logicalPath !== 'app/provenance.json') fail('INVALID_BUILD_RECEIPT', 'Packaged provenance logical path is invalid.');
  const stagedPath = await resolveReceiptPath(receipt.provenance.stagedPath, 'staged provenance path');
  const stagedHash = receiptHash(receipt.provenance.stagedSha256, 'staged provenance SHA-256');
  const packagedHash = receiptHash(receipt.provenance.packagedSha256, 'packaged provenance SHA-256');
  if (stagedHash !== packagedHash) fail('PROVENANCE_MISMATCH', 'Staged and packaged provenance hashes do not match.');

  assertExactKeys(assertObject(receipt.sourcePreservation, 'source preservation'), new Set([
    'receipt', 'candidateCommit', 'trackedFileCount', 'inventorySha256', 'verified'
  ]), 'source preservation');
  const sourcePreservationPath = await resolveReceiptPath(receipt.sourcePreservation.receipt, 'source preservation receipt path');
  if (receipt.sourcePreservation.candidateCommit !== sourceCommit || receipt.sourcePreservation.verified !== true) {
    fail('SOURCE_PRESERVATION_FAILED', 'Source preservation proof is missing or bound to another commit.');
  }
  positiveInteger(receipt.sourcePreservation.trackedFileCount, 'tracked source file count');
  receiptHash(receipt.sourcePreservation.inventorySha256, 'tracked source inventory SHA-256');

  assertExactKeys(assertObject(receipt.icon, 'packaged icon'), new Set(['masterSha256', 'icoSha256', 'sizes', 'executableResourceCount']), 'packaged icon');
  receiptHash(receipt.icon.masterSha256, 'master icon SHA-256');
  receiptHash(receipt.icon.icoSha256, 'ICO SHA-256');
  if (!Array.isArray(receipt.icon.sizes) || receipt.icon.sizes.length < 1 || receipt.icon.sizes.length > 32 || !receipt.icon.sizes.every((size) => Number.isInteger(size) && size >= 1 && size <= 1_024)) {
    fail('INVALID_BUILD_RECEIPT', 'Packaged icon size inventory is invalid.');
  }
  positiveInteger(receipt.icon.executableResourceCount, 'executable icon resource count');

  assertExactKeys(assertObject(receipt.sourceBinding, 'source binding'), new Set(['appAsar', 'server']), 'source binding');
  validateSourceBindingRecord(receipt.sourceBinding.appAsar, 'app.asar source binding');
  validateSourceBindingRecord(receipt.sourceBinding.server, 'server source binding');

  if (path.resolve(receiptPath) !== expectedReceiptPath ||
      path.resolve(plan.artifactPaths.executable) !== executablePath || path.resolve(plan.artifactPaths['app-asar']) !== appAsarPath ||
      plan.artifact.primary.sha256 !== executableHash || plan.artifact.components.find((item) => item.id === 'app-asar')?.sha256 !== appAsarHash) {
    fail('BUILD_RECEIPT_BINDING_MISMATCH', 'Plan paths or hashes do not match the packaged application receipt.');
  }
  await assertPinnedArtifact(executablePath, executableHash);
  await assertPinnedArtifact(appAsarPath, appAsarHash);
  await assertPinnedArtifact(stagedPath, stagedHash);
  const [executableStat, appAsarStat] = await Promise.all([fsp.stat(executablePath), fsp.stat(appAsarPath)]);
  if (executableStat.size !== receipt.executable.bytes || appAsarStat.size !== receipt.appAsar.bytes) {
    fail('BUILD_RECEIPT_BINDING_MISMATCH', 'Packaged executable or app.asar byte count does not match the receipt.');
  }
  const preservationStat = await fsp.stat(sourcePreservationPath).catch(() => null);
  if (!preservationStat?.isFile()) fail('SOURCE_PRESERVATION_FAILED', 'Named source preservation receipt is missing.');
  return { passed: true, schemaVersion: 2, sourceCommit, executableSha256: executableHash, appAsarSha256: appAsarHash, provenanceSha256: packagedHash };
}

export async function loadPlan(planPath) {
  return validatePlan(await readJson(planPath));
}

export async function initializeRunRoot(plan, options = {}) {
  const retainInitializationBarrier = options.retainInitializationBarrier === true;
  if (Object.keys(options).some((key) => !['retainInitializationBarrier', 'initializationOwner'].includes(key))) {
    fail('INVALID_RUN_INITIALIZATION', 'Run initialization options contain an unexpected field.');
  }
  if (retainInitializationBarrier && !options.initializationOwner) {
    fail('INVALID_RUN_INITIALIZATION', 'Retained run initialization requires an exact owner identity.');
  }
  const tempRoot = path.resolve(os.tmpdir());
  await strictChild(plan.runRoot, tempRoot, 'run root');
  const ownerRoot = path.dirname(plan.runRoot);
  try {
    await fsp.mkdir(ownerRoot, { recursive: false, mode: 0o700 });
    await fsp.mkdir(plan.runRoot, { recursive: false, mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') fail('RUN_ROOT_EXISTS', 'Run owner or task root already exists. Use a fresh unique run id.');
    throw error;
  }
  const marker = {
    schemaVersion: 1,
    runId: plan.runId,
    planHash: runOwnershipHash(plan),
    nonce: crypto.randomUUID()
  };
  if (retainInitializationBarrier) {
    await atomicWriteJson(path.join(plan.runRoot, RUN_INITIALIZATION_FILE), {
      schemaVersion: 1,
      runId: plan.runId,
      planHash: marker.planHash,
      ownerNonce: marker.nonce,
      owner: initializationOwner(options.initializationOwner)
    });
  }
  await atomicWriteJson(path.join(plan.runRoot, '.evidence-run-owner.json'), marker);
  const appDataPath = path.join(plan.runRoot, plan.isolation.appDataDirectory);
  const userDataPath = path.join(plan.runRoot, plan.isolation.userDataDirectory);
  await fsp.mkdir(plan.outputRoot, { mode: 0o700 });
  await fsp.mkdir(appDataPath, { mode: 0o700 });
  await fsp.mkdir(userDataPath, { mode: 0o700 });
  return { marker, appDataPath, userDataPath };
}

export async function completeRunInitialization(plan) {
  const ownership = await verifyRunOwnership(plan);
  const barrierPath = (await strictChild(path.join(plan.runRoot, RUN_INITIALIZATION_FILE), plan.runRoot, 'run initialization barrier')).child;
  const barrier = await readRunInitializationBarrier(plan);
  if (!barrier || barrier.planHash !== ownership.planHash || barrier.ownerNonce !== ownership.nonce) {
    fail('INVALID_RUN_INITIALIZATION', 'Run initialization barrier is missing or no longer matches the owner marker.');
  }
  await fsp.unlink(barrierPath);
  return { passed: true, runId: plan.runId };
}

function runOwnershipHash(plan) {
  return canonicalHash({
    schemaVersion: plan.schemaVersion,
    runId: plan.runId,
    sourceSha: plan.sourceSha,
    artifact: plan.artifact,
    tuple: plan.tuple,
    stepIds: plan.steps.map((step) => step.id)
  });
}

export async function verifyRunOwnership(plan) {
  await rejectLinkComponents(plan.runRoot);
  const markerPath = (await strictChild(path.join(plan.runRoot, '.evidence-run-owner.json'), plan.runRoot, 'run owner marker')).child;
  const marker = await readJson(markerPath, 16 * 1024);
  assertExactKeys(assertObject(marker, 'run owner marker'), new Set(['schemaVersion', 'runId', 'planHash', 'nonce']), 'run owner marker');
  if (marker.schemaVersion !== 1 || marker.runId !== plan.runId || marker.planHash !== runOwnershipHash(plan) ||
      typeof marker.nonce !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(marker.nonce)) {
    fail('RUN_OWNERSHIP_FAILED', 'Run owner marker does not match the exact plan and task root.');
  }
  return { passed: true, planHash: marker.planHash, nonce: marker.nonce };
}

export function buildApplicationArguments(plan, paths) {
  return [
    ...plan.application.arguments,
    '--evidence-mode',
    `--evidence-app-data=${paths.appDataPath}`,
    `--evidence-user-data=${paths.userDataPath}`,
    `--user-data-dir=${paths.userDataPath}`,
    `--remote-debugging-port=${plan.cdp.port}`
  ];
}

export async function verifyIsolationReceipt(plan, paths) {
  const receiptPath = path.join(paths.userDataPath, plan.isolation.receiptFile);
  const markerPath = path.join(paths.appDataPath, plan.isolation.appDataMarkerFile);
  const receipt = await readJson(receiptPath, 32 * 1024);
  const marker = await readJson(markerPath, 16 * 1024);
  const expectedAppDataHash = normalizedPathHash(paths.appDataPath);
  const expectedUserDataHash = normalizedPathHash(paths.userDataPath);
  if (receipt?.schemaVersion !== 1 || receipt.mode !== true || receipt.appDataPathSha256 !== expectedAppDataHash || receipt.userDataPathSha256 !== expectedUserDataHash || receipt.distinct !== true || receipt.initializedBeforeReady !== true) {
    fail('ISOLATION_RECEIPT_FAILED', 'Application did not prove both evidence data roots before normal startup reads.');
  }
  if (marker?.schemaVersion !== 1 || marker.appDataPathSha256 !== expectedAppDataHash) {
    fail('APP_DATA_MARKER_FAILED', 'Application did not populate the isolated appData root with its expected marker.');
  }
  const appDataEntries = await fsp.readdir(paths.appDataPath);
  const userDataEntries = await fsp.readdir(paths.userDataPath);
  if (!appDataEntries.includes(plan.isolation.appDataMarkerFile) || !userDataEntries.includes(plan.isolation.receiptFile)) {
    fail('ISOLATION_POPULATION_FAILED', 'Both isolated data roots must be populated by the running application.');
  }
  return { passed: true, appDataPathSha256: expectedAppDataHash, userDataPathSha256: expectedUserDataHash };
}

export function ledgerDefinition(plan) {
  return {
    runId: plan.runId,
    sourceSha: plan.sourceSha,
    artifact: plan.artifact,
    tuple: plan.tuple,
    steps: plan.steps.map((step) => ({
      id: step.id,
      targetSelector: step.target.selector,
      targetAccessibilityName: step.target.accessibleName,
      inputMethod: step.input.method,
      input: structuredClone(step.input),
      expectedTransition: step.expectedTransition,
      semanticProbe: structuredClone(step.semantic.probe),
      expectedPreState: structuredClone(step.semantic.beforeEquals),
      expectedSemanticState: structuredClone(step.semantic.afterEquals)
    }))
  };
}
