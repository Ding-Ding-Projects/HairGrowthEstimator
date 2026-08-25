'use strict';

const { performance } = require('node:perf_hooks');
const {
  Worker,
  isMainThread,
  parentPort,
  workerData
} = require('node:worker_threads');

const WORKER_MARKER = 'hair-growth-regex-worker-v1';
const ALLOWED_FLAGS = new Set('dgimsuvy');
const TEST_ONLY_WORKER_CONTROL = Symbol('regex-worker-test-control');

const LIMITS = Object.freeze({
  maxPatternBytes: 512,
  maxFlags: 8,
  maxCandidates: 256,
  maxCandidateBytes: 8192,
  maxCandidateTotalBytes: 262144,
  maxSampleBytes: 65536,
  maxReplacementBytes: 8192,
  maxMatches: 128,
  maxCapturesPerMatch: 32,
  maxNamedCapturesPerMatch: 32,
  maxResultTextBytes: 2048,
  maxReplacementPreviewBytes: 65536,
  defaultDeadlineMs: 250,
  minDeadlineMs: 10,
  maxDeadlineMs: 1000,
  maxTestDelayMs: 5000
});

class RegexEvaluationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

class RegexPolicyError extends RegexEvaluationError {
  constructor(message) {
    super(message, 'REGEX_POLICY_VIOLATION');
  }
}

class RegexSyntaxError extends RegexEvaluationError {
  constructor(message = 'The regular expression is invalid.') {
    super(message, 'REGEX_INVALID_PATTERN');
  }
}

class RegexDeadlineError extends RegexEvaluationError {
  constructor() {
    super('Regular expression evaluation exceeded its hard deadline.', 'REGEX_DEADLINE_EXCEEDED');
  }
}

class RegexWorkerError extends RegexEvaluationError {
  constructor(message = 'The regular expression worker stopped before returning a result.') {
    super(message, 'REGEX_WORKER_CRASHED');
  }
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function recordValues(value, label) {
  if (!isPlainRecord(value)) throw new RegexPolicyError(`${label} must be a plain object.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const output = Object.create(null);

  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') throw new RegexPolicyError(`${label} contains an unsupported key.`);
    const descriptor = descriptors[key];
    if ('get' in descriptor || 'set' in descriptor) {
      throw new RegexPolicyError(`${label} cannot contain accessors.`);
    }
    output[key] = descriptor.value;
  }

  return output;
}

function assertExactKeys(record, allowed, label) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new RegexPolicyError(`${label} contains an unsupported key.`);
  }
}

function utf8Length(value) {
  return Buffer.byteLength(value, 'utf8');
}

function boundedString(value, label, maxBytes) {
  if (typeof value !== 'string') throw new RegexPolicyError(`${label} must be a string.`);
  if (utf8Length(value) > maxBytes) {
    throw new RegexPolicyError(`${label} exceeds its ${maxBytes}-byte limit.`);
  }
  return value;
}

function normalizeFlags(value = '') {
  const flags = boundedString(value, 'flags', LIMITS.maxFlags);
  const seen = new Set();

  for (const flag of flags) {
    if (!ALLOWED_FLAGS.has(flag) || seen.has(flag)) {
      throw new RegexPolicyError('flags contain an unsupported or duplicate value.');
    }
    seen.add(flag);
  }

  return flags;
}

function normalizeCandidates(value) {
  if (!Array.isArray(value)) throw new RegexPolicyError('candidates must be an array.');
  if (value.length > LIMITS.maxCandidates) {
    throw new RegexPolicyError(`candidates exceed the ${LIMITS.maxCandidates}-item limit.`);
  }

  let totalBytes = 0;
  const candidates = value.map((candidate, index) => {
    const normalized = boundedString(
      candidate,
      `candidates[${index}]`,
      LIMITS.maxCandidateBytes
    );
    totalBytes += utf8Length(normalized);
    if (totalBytes > LIMITS.maxCandidateTotalBytes) {
      throw new RegexPolicyError(
        `candidates exceed the ${LIMITS.maxCandidateTotalBytes}-byte aggregate limit.`
      );
    }
    return normalized;
  });

  return candidates;
}

function normalizeRequest(value) {
  const request = recordValues(value, 'request');
  const operation = request.operation;
  if (!['validate', 'filter', 'workbench'].includes(operation)) {
    throw new RegexPolicyError('operation must be validate, filter, or workbench.');
  }

  const common = {
    operation,
    pattern: boundedString(request.pattern, 'pattern', LIMITS.maxPatternBytes),
    flags: normalizeFlags(request.flags)
  };

  if (operation === 'validate') {
    assertExactKeys(request, new Set(['operation', 'pattern', 'flags']), 'request');
    return common;
  }

  if (operation === 'filter') {
    assertExactKeys(request, new Set(['operation', 'pattern', 'flags', 'candidates']), 'request');
    return { ...common, candidates: normalizeCandidates(request.candidates) };
  }

  assertExactKeys(
    request,
    new Set(['operation', 'pattern', 'flags', 'sample', 'replacement']),
    'request'
  );
  const normalized = {
    ...common,
    sample: boundedString(request.sample, 'sample', LIMITS.maxSampleBytes)
  };
  if (request.replacement !== undefined) {
    normalized.replacement = boundedString(
      request.replacement,
      'replacement',
      LIMITS.maxReplacementBytes
    );
  }
  return normalized;
}

function normalizeDeadline(value) {
  const deadline = value === undefined ? LIMITS.defaultDeadlineMs : value;
  if (
    !Number.isInteger(deadline) ||
    deadline < LIMITS.minDeadlineMs ||
    deadline > LIMITS.maxDeadlineMs
  ) {
    throw new RegexPolicyError(
      `deadlineMs must be an integer from ${LIMITS.minDeadlineMs} through ${LIMITS.maxDeadlineMs}.`
    );
  }
  return deadline;
}

function normalizeTestControl(raw) {
  if (raw === undefined) return null;
  const control = recordValues(raw, 'test worker control');
  assertExactKeys(control, new Set(['delayMs', 'crash']), 'test worker control');

  const delayMs = control.delayMs === undefined ? 0 : control.delayMs;
  if (
    !Number.isInteger(delayMs) ||
    delayMs < 0 ||
    delayMs > LIMITS.maxTestDelayMs
  ) {
    throw new RegexPolicyError(
      `test delay must be an integer from 0 through ${LIMITS.maxTestDelayMs}.`
    );
  }
  if (control.crash !== undefined && typeof control.crash !== 'boolean') {
    throw new RegexPolicyError('test crash control must be a boolean.');
  }

  return { delayMs, crash: control.crash === true };
}

function normalizeRuntimeOptions(value) {
  if (!isPlainRecord(value)) throw new RegexPolicyError('runtime options must be a plain object.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  let deadlineMs;
  let testControl;

  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if ('get' in descriptor || 'set' in descriptor) {
      throw new RegexPolicyError('runtime options cannot contain accessors.');
    }
    if (key === 'deadlineMs') {
      deadlineMs = descriptor.value;
    } else if (key === TEST_ONLY_WORKER_CONTROL) {
      testControl = descriptor.value;
    } else {
      throw new RegexPolicyError('runtime options contains an unsupported key.');
    }
  }

  return { deadlineMs, testControl };
}

function createExpression(pattern, flags) {
  try {
    return new RegExp(pattern, flags);
  } catch {
    throw new RegexSyntaxError();
  }
}

function clipUtf8(value, maxBytes) {
  const bytes = Buffer.from(String(value), 'utf8');
  if (bytes.length <= maxBytes) return { text: String(value), truncated: false };
  if (maxBytes <= 0) return { text: '', truncated: bytes.length > 0 };

  let end = maxBytes;
  while (end > 0 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return { text: bytes.subarray(0, end).toString('utf8'), truncated: true };
}

function advanceStringIndex(input, index, unicode) {
  if (!unicode || index + 1 >= input.length) return index + 1;
  const first = input.charCodeAt(index);
  if (first < 0xd800 || first > 0xdbff) return index + 1;
  const second = input.charCodeAt(index + 1);
  return second >= 0xdc00 && second <= 0xdfff ? index + 2 : index + 1;
}

function publicMatch(match) {
  const value = clipUtf8(match[0], LIMITS.maxResultTextBytes);
  const captureCount = Math.max(0, match.length - 1);
  let captureTextTruncated = false;
  const captures = match
    .slice(1, 1 + LIMITS.maxCapturesPerMatch)
    .map((capture) => {
      if (capture === undefined) return null;
      const clipped = clipUtf8(capture, LIMITS.maxResultTextBytes);
      captureTextTruncated ||= clipped.truncated;
      return clipped.text;
    });

  const groups = Object.create(null);
  let namedCaptureCount = 0;
  let namedCaptureTextTruncated = false;
  if (match.groups) {
    for (const [name, capture] of Object.entries(match.groups)) {
      namedCaptureCount += 1;
      if (namedCaptureCount > LIMITS.maxNamedCapturesPerMatch) continue;
      if (capture === undefined) {
        groups[name] = null;
      } else {
        const clipped = clipUtf8(capture, LIMITS.maxResultTextBytes);
        groups[name] = clipped.text;
        namedCaptureTextTruncated ||= clipped.truncated;
      }
    }
  }

  return {
    index: match.index,
    end: match.index + match[0].length,
    value: value.text,
    valueTruncated: value.truncated,
    captures,
    capturesTruncated: captureCount > LIMITS.maxCapturesPerMatch,
    captureTextTruncated,
    groups,
    groupsTruncated: namedCaptureCount > LIMITS.maxNamedCapturesPerMatch,
    groupTextTruncated: namedCaptureTextTruncated
  };
}

function collectMatches(expression, sample) {
  const matches = [];
  let truncated = false;
  expression.lastIndex = 0;

  while (true) {
    const match = expression.exec(sample);
    if (match === null) break;
    if (matches.length >= LIMITS.maxMatches) {
      truncated = true;
      break;
    }
    matches.push(publicMatch(match));
    if (!expression.global) break;
    if (match[0] === '') {
      expression.lastIndex = advanceStringIndex(
        sample,
        expression.lastIndex,
        expression.unicode || expression.unicodeSets
      );
    }
  }

  expression.lastIndex = 0;
  return { matches, truncated };
}

function boundedReplacementExpansion(template, context, maxBytes) {
  let text = '';
  let bytes = 0;
  let truncated = false;

  function append(value) {
    const stringValue = String(value);
    const clipped = clipUtf8(stringValue, Math.max(0, maxBytes - bytes));
    text += clipped.text;
    bytes += utf8Length(clipped.text);
    truncated ||= clipped.truncated;
  }

  for (let index = 0; index < template.length; index += 1) {
    const character = template[index];
    if (character !== '$' || index + 1 >= template.length) {
      append(character);
      continue;
    }

    const marker = template[index + 1];
    if (marker === '$') {
      append('$');
      index += 1;
    } else if (marker === '&') {
      append(context.match);
      index += 1;
    } else if (marker === '`') {
      append(context.input.slice(0, context.offset));
      index += 1;
    } else if (marker === "'") {
      append(context.input.slice(context.offset + context.match.length));
      index += 1;
    } else if (marker === '<' && context.groups) {
      const close = template.indexOf('>', index + 2);
      if (close === -1) {
        append('$');
      } else {
        const name = template.slice(index + 2, close);
        append(context.groups[name] ?? '');
        index = close;
      }
    } else if (marker >= '1' && marker <= '9') {
      const first = Number(marker);
      const next = template[index + 2];
      const second = next >= '0' && next <= '9' ? Number(`${marker}${next}`) : 0;
      if (second > 0 && second <= context.captures.length) {
        append(context.captures[second - 1] ?? '');
        index += 2;
      } else if (first <= context.captures.length) {
        append(context.captures[first - 1] ?? '');
        index += 1;
      } else {
        append(`$${marker}`);
        index += 1;
      }
    } else {
      append('$');
    }

    if (bytes >= maxBytes) {
      if (index + 1 < template.length) truncated = true;
      break;
    }
  }

  return { text, bytes, truncated };
}

function replacementPreview(expression, sample, replacement) {
  expression.lastIndex = 0;
  let applications = 0;
  let insertedBytes = 0;
  let truncated = false;

  const replaced = sample.replace(expression, (match, ...values) => {
    let groups;
    if (
      values.length > 0 &&
      values[values.length - 1] !== null &&
      typeof values[values.length - 1] === 'object'
    ) {
      groups = values.pop();
    }
    const input = values.pop();
    const offset = values.pop();
    const captures = values;

    if (applications >= LIMITS.maxMatches) {
      truncated = true;
      return match;
    }
    applications += 1;
    const expanded = boundedReplacementExpansion(
      replacement,
      { match, captures, groups, input, offset },
      Math.max(0, LIMITS.maxReplacementPreviewBytes - insertedBytes)
    );
    insertedBytes += expanded.bytes;
    truncated ||= expanded.truncated;
    return expanded.text;
  });

  expression.lastIndex = 0;
  const clipped = clipUtf8(replaced, LIMITS.maxReplacementPreviewBytes);
  return { text: clipped.text, truncated: truncated || clipped.truncated };
}

function executeRequest(request) {
  const expression = createExpression(request.pattern, request.flags);

  if (request.operation === 'validate') {
    return {
      operation: 'validate',
      valid: true,
      source: expression.source,
      flags: expression.flags
    };
  }

  if (request.operation === 'filter') {
    const matches = request.candidates.map((candidate) => {
      expression.lastIndex = 0;
      const matched = expression.test(candidate);
      expression.lastIndex = 0;
      return matched;
    });
    const matchedIndices = [];
    matches.forEach((matched, index) => {
      if (matched) matchedIndices.push(index);
    });
    return {
      operation: 'filter',
      source: expression.source,
      flags: expression.flags,
      matches,
      matchedIndices,
      truncated: false
    };
  }

  const started = performance.now();
  const collected = collectMatches(expression, request.sample);
  const preview = request.replacement === undefined
    ? null
    : replacementPreview(expression, request.sample, request.replacement);
  return {
    operation: 'workbench',
    source: expression.source,
    flags: expression.flags,
    matches: collected.matches,
    matchCount: collected.matches.length,
    truncated: collected.truncated,
    replacementPreview: preview,
    elapsedMs: Math.round((performance.now() - started) * 1000) / 1000
  };
}

function workerErrorFromPayload(payload) {
  if (payload && payload.code === 'REGEX_INVALID_PATTERN') {
    return new RegexSyntaxError(payload.message);
  }
  if (payload && payload.code === 'REGEX_POLICY_VIOLATION') {
    return new RegexPolicyError(payload.message);
  }
  return new RegexWorkerError();
}

async function evaluateRegex(request, runtimeOptions = {}) {
  const normalizedRequest = normalizeRequest(request);
  const options = normalizeRuntimeOptions(runtimeOptions);
  const deadlineMs = normalizeDeadline(options.deadlineMs);
  const testControl = normalizeTestControl(options.testControl);

  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(__filename, {
        execArgv: [],
        resourceLimits: {
          maxOldGenerationSizeMb: 32,
          maxYoungGenerationSizeMb: 8,
          stackSizeMb: 2
        },
        workerData: {
          marker: WORKER_MARKER,
          request: normalizedRequest,
          testControl
        }
      });
    } catch {
      reject(new RegexWorkerError());
      return;
    }

    let settled = false;
    const deadline = setTimeout(() => {
      if (settled) return;
      settled = true;
      const error = new RegexDeadlineError();
      worker.terminate().catch(() => {});
      reject(error);
    }, deadlineMs);

    worker.once('message', (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (message && message.ok === true) {
        resolve(message.result);
      } else {
        reject(workerErrorFromPayload(message && message.error));
      }
      worker.terminate().catch(() => {});
    });

    worker.once('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      reject(new RegexWorkerError());
      worker.terminate().catch(() => {});
    });

    worker.once('exit', () => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      reject(new RegexWorkerError());
    });
  });
}

function sleepInsideWorker(milliseconds) {
  if (!milliseconds) return;
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function runWorker() {
  const control = workerData.testControl;
  if (control && control.crash) {
    process.nextTick(() => {
      throw new Error('Intentional worker crash for a deterministic test.');
    });
    return;
  }

  try {
    if (control) sleepInsideWorker(control.delayMs);
    const request = normalizeRequest(workerData.request);
    parentPort.postMessage({ ok: true, result: executeRequest(request) });
    parentPort.close();
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      error: {
        code: error && error.code,
        message: error && error.message
      }
    });
    parentPort.close();
  }
}

if (!isMainThread && workerData && workerData.marker === WORKER_MARKER) runWorker();

module.exports = {
  LIMITS,
  TEST_ONLY_WORKER_CONTROL,
  RegexDeadlineError,
  RegexEvaluationError,
  RegexPolicyError,
  RegexSyntaxError,
  RegexWorkerError,
  evaluateRegex
};
