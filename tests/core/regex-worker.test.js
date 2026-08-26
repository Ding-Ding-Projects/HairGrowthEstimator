'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const test = require('node:test');

const {
  LIMITS,
  TEST_ONLY_WORKER_CONTROL,
  RegexDeadlineError,
  RegexPolicyError,
  RegexSyntaxError,
  RegexWorkerError,
  evaluateRegex
} = require('../../app/core/regex-worker');

function isError(error, Type, code) {
  assert.ok(error instanceof Type);
  assert.equal(error.code, code);
  return true;
}

test('validate compiles a bounded serializable request inside a worker', async () => {
  const request = JSON.parse(JSON.stringify({
    operation: 'validate',
    pattern: '(?<word>hair)',
    flags: 'giu'
  }));

  const result = await evaluateRegex(request);

  assert.deepEqual(result, {
    operation: 'validate',
    valid: true,
    source: '(?<word>hair)',
    flags: 'giu'
  });
  assert.deepEqual(request, {
    operation: 'validate',
    pattern: '(?<word>hair)',
    flags: 'giu'
  });
});

test('filter resets stateful expressions for every candidate and handles zero-width matches', async () => {
  const globalResult = await evaluateRegex({
    operation: 'filter',
    pattern: 'a',
    flags: 'g',
    candidates: ['a', 'a', 'b']
  });
  assert.deepEqual(globalResult.matches, [true, true, false]);
  assert.deepEqual(globalResult.matchedIndices, [0, 1]);
  assert.equal(globalResult.truncated, false);

  const zeroWidthResult = await evaluateRegex({
    operation: 'filter',
    pattern: '^',
    flags: 'g',
    candidates: ['hair', '']
  });
  assert.deepEqual(zeroWidthResult.matches, [true, true]);
});

test('workbench reports global zero-width matches and a bounded replacement preview', async () => {
  const result = await evaluateRegex({
    operation: 'workbench',
    pattern: '(?<edge>^|$)',
    flags: 'g',
    sample: 'ab',
    replacement: '[$<edge>]'
  });

  assert.deepEqual(result.matches.map((match) => match.index), [0, 2]);
  assert.deepEqual(result.matches.map((match) => match.end), [0, 2]);
  assert.deepEqual(result.matches.map((match) => match.groups.edge), ['', '']);
  assert.equal(result.matchCount, 2);
  assert.equal(result.truncated, false);
  assert.equal(result.replacementPreview.text, '[]ab[]');
  assert.equal(result.replacementPreview.truncated, false);
});

test('workbench caps matches, captures, and returned text without looping on zero-width input', async () => {
  const zeroWidth = await evaluateRegex({
    operation: 'workbench',
    pattern: '(?=a)',
    flags: 'g',
    sample: 'a'.repeat(LIMITS.maxMatches + 20),
    replacement: 'x'
  });
  assert.equal(zeroWidth.matches.length, LIMITS.maxMatches);
  assert.equal(zeroWidth.matchCount, LIMITS.maxMatches);
  assert.equal(zeroWidth.truncated, true);

  const capturePattern = Array.from(
    { length: LIMITS.maxCapturesPerMatch + 5 },
    () => '(a?)'
  ).join('');
  const captures = await evaluateRegex({
    operation: 'workbench',
    pattern: capturePattern,
    flags: '',
    sample: 'a'
  });
  assert.equal(captures.matches[0].captures.length, LIMITS.maxCapturesPerMatch);
  assert.equal(captures.matches[0].capturesTruncated, true);

  const longText = 'a'.repeat(LIMITS.maxResultTextBytes + 20);
  const text = await evaluateRegex({
    operation: 'workbench',
    pattern: 'a+',
    flags: '',
    sample: longText
  });
  assert.equal(Buffer.byteLength(text.matches[0].value, 'utf8'), LIMITS.maxResultTextBytes);
  assert.equal(text.matches[0].valueTruncated, true);
});

test('policy rejects oversized and malformed requests before worker execution', async () => {
  const cases = [
    {
      operation: 'validate',
      pattern: 'a'.repeat(LIMITS.maxPatternBytes + 1),
      flags: ''
    },
    {
      operation: 'validate',
      pattern: 'a',
      flags: 'gg'
    },
    {
      operation: 'filter',
      pattern: 'a',
      flags: '',
      candidates: Array.from({ length: LIMITS.maxCandidates + 1 }, () => 'a')
    },
    {
      operation: 'filter',
      pattern: 'a',
      flags: '',
      candidates: ['a'.repeat(LIMITS.maxCandidateBytes + 1)]
    },
    {
      operation: 'filter',
      pattern: 'a',
      flags: '',
      candidates: Array.from(
        { length: Math.floor(LIMITS.maxCandidateTotalBytes / LIMITS.maxCandidateBytes) + 1 },
        () => 'a'.repeat(LIMITS.maxCandidateBytes)
      )
    },
    {
      operation: 'workbench',
      pattern: 'a',
      flags: '',
      sample: 'a'.repeat(LIMITS.maxSampleBytes + 1)
    },
    {
      operation: 'workbench',
      pattern: 'a',
      flags: '',
      sample: 'a',
      replacement: 'x'.repeat(LIMITS.maxReplacementBytes + 1)
    },
    {
      operation: 'validate',
      pattern: 'a',
      flags: '',
      testDelayMs: 500
    }
  ];

  for (const request of cases) {
    await assert.rejects(
      evaluateRegex(request),
      (error) => isError(error, RegexPolicyError, 'REGEX_POLICY_VIOLATION')
    );
  }
});

test('exact inclusive input boundaries remain accepted', async () => {
  const pattern = 'a'.repeat(LIMITS.maxPatternBytes);
  const validation = await evaluateRegex({ operation: 'validate', pattern, flags: '' });
  assert.equal(validation.valid, true);

  const candidate = 'a'.repeat(LIMITS.maxCandidateBytes);
  const filtered = await evaluateRegex({
    operation: 'filter',
    pattern: '^a+$',
    flags: '',
    candidates: [candidate]
  });
  assert.deepEqual(filtered.matches, [true]);
});

test('invalid regular expressions use a distinct syntax error', async () => {
  await assert.rejects(
    evaluateRegex({ operation: 'validate', pattern: '(', flags: '' }),
    (error) => isError(error, RegexSyntaxError, 'REGEX_INVALID_PATTERN')
  );
});

test('a trusted deterministic delay proves hard-deadline worker termination', async () => {
  const started = performance.now();

  await assert.rejects(
    evaluateRegex(
      { operation: 'validate', pattern: 'hair', flags: 'i' },
      {
        deadlineMs: 25,
        [TEST_ONLY_WORKER_CONTROL]: { delayMs: 250 }
      }
    ),
    (error) => isError(error, RegexDeadlineError, 'REGEX_DEADLINE_EXCEEDED')
  );

  assert.ok(performance.now() - started < 750);
});

test('a worker crash is distinct from syntax, policy, and deadline failures', async () => {
  await assert.rejects(
    evaluateRegex(
      { operation: 'validate', pattern: 'hair', flags: '' },
      { [TEST_ONLY_WORKER_CONTROL]: { crash: true } }
    ),
    (error) => isError(error, RegexWorkerError, 'REGEX_WORKER_CRASHED')
  );
});

test('string keys cannot enable either test-only worker control', async () => {
  for (const key of ['TEST_ONLY_WORKER_CONTROL', 'delayMs', 'crash']) {
    const request = { operation: 'validate', pattern: 'hair', flags: '', [key]: true };
    await assert.rejects(
      evaluateRegex(request),
      (error) => isError(error, RegexPolicyError, 'REGEX_POLICY_VIOLATION')
    );
  }
});
