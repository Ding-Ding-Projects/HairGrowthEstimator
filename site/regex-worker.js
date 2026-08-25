(function installHairGrowthRegexWorker(root) {
  'use strict';

  const MAX_PATTERN = 2000;
  const MAX_SAMPLE = 20000;
  const MAX_REPLACEMENT = 2000;
  const MAX_TEST_CASES = 100;
  const MAX_VALUES = 500;
  const MAX_VALUE_BYTES = 100000;
  const MAX_RESULTS = 500;

  function boundedString(value, maximum, label) {
    if (typeof value !== 'string' || value.length > maximum) throw new Error(`${label} must be text no longer than ${maximum} characters.`);
    return value;
  }

  function normalizedFlags(value, { global = false } = {}) {
    const raw = boundedString(value || '', 8, 'Flags');
    if (!/^[dgimsuvy]*$/.test(raw) || new Set(raw).size !== raw.length) throw new Error('Flags contain an unsupported or duplicate value.');
    const withoutSticky = raw.replace(/y/g, '');
    const withGlobal = global && !withoutSticky.includes('g') ? `${withoutSticky}g` : withoutSticky;
    return [...new Set(withGlobal)].join('');
  }

  function advanceIndex(text, index, unicode) {
    if (!unicode || index >= text.length) return index + 1;
    const first = text.charCodeAt(index);
    if (first >= 0xd800 && first <= 0xdbff && index + 1 < text.length) {
      const second = text.charCodeAt(index + 1);
      if (second >= 0xdc00 && second <= 0xdfff) return index + 2;
    }
    return index + 1;
  }

  function collectMatches(pattern, flags, sample) {
    const matcher = new RegExp(pattern, normalizedFlags(flags, { global: true }));
    const matches = [];
    let match;
    while (matches.length < MAX_RESULTS && (match = matcher.exec(sample)) !== null) {
      matches.push({
        index: match.index,
        end: match.index + match[0].length,
        text: match[0],
        captures: match.slice(1, 101),
        groups: match.groups ? Object.fromEntries(Object.entries(match.groups).slice(0, 100)) : {}
      });
      if (match[0] === '') matcher.lastIndex = advanceIndex(sample, matcher.lastIndex, matcher.unicode || matcher.unicodeSets);
    }
    return matches;
  }

  function replacePreview(pattern, flags, sample, replacement) {
    const matcher = new RegExp(pattern, normalizedFlags(flags, { global: true }));
    return sample.replace(matcher, replacement).slice(0, MAX_SAMPLE * 2);
  }

  function testCases(pattern, flags, cases) {
    if (!Array.isArray(cases) || cases.length > MAX_TEST_CASES) throw new Error(`Test cases must contain at most ${MAX_TEST_CASES} rows.`);
    const safeFlags = normalizedFlags(flags).replace(/[gy]/g, '');
    return cases.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Test case ${index + 1} must be an object.`);
      const text = boundedString(item.text || '', MAX_SAMPLE, `Test case ${index + 1}`);
      const expected = Boolean(item.expected);
      const actual = new RegExp(pattern, safeFlags).test(text);
      return { index, expected, actual, passed: expected === actual };
    });
  }

  function scan(request) {
    const pattern = boundedString(request.pattern || '', MAX_PATTERN, 'Pattern');
    const flags = normalizedFlags(request.flags || '');
    const sample = boundedString(request.sample || '', MAX_SAMPLE, 'Sample');
    const replacement = boundedString(request.replacement || '', MAX_REPLACEMENT, 'Replacement');
    const started = typeof performance === 'object' && typeof performance.now === 'function' ? performance.now() : Date.now();
    const matches = collectMatches(pattern, flags, sample);
    const result = {
      operation: 'scan',
      matches,
      preview: replacePreview(pattern, flags, sample, replacement),
      tests: testCases(pattern, flags, request.testCases || []),
      truncated: matches.length >= MAX_RESULTS,
      elapsedMs: Math.max(0, (typeof performance === 'object' && typeof performance.now === 'function' ? performance.now() : Date.now()) - started)
    };
    if (JSON.stringify(result).length > 262144) throw new Error('Regex result exceeds the 256 KiB response limit.');
    return result;
  }

  function testMany(request) {
    const pattern = boundedString(request.pattern || '', MAX_PATTERN, 'Pattern');
    const flags = normalizedFlags(request.flags || '').replace(/[gy]/g, '');
    if (!Array.isArray(request.values) || request.values.length > MAX_VALUES) throw new Error(`Search values must contain at most ${MAX_VALUES} rows.`);
    const values = request.values.map((value, index) => boundedString(String(value ?? ''), MAX_SAMPLE, `Search value ${index + 1}`));
    if (values.reduce((total, value) => total + value.length, 0) > MAX_VALUE_BYTES) throw new Error('Search values exceed the 100,000 character batch limit.');
    return { operation: 'testMany', matches: values.map((value) => new RegExp(pattern, flags).test(value)) };
  }

  function evaluateRegexRequest(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Regex request must be an object.');
    if (request.operation === 'scan') return scan(request);
    if (request.operation === 'testMany') return testMany(request);
    throw new Error('Regex operation is unsupported.');
  }

  root.HairGrowthRegexWorker = Object.freeze({ evaluateRegexRequest });

  if (typeof self === 'object' && typeof self.postMessage === 'function') self.onmessage = (event) => {
    const id = event.data?.id;
    try {
      self.postMessage({ id, ok: true, result: evaluateRegexRequest(event.data?.request) });
    } catch (error) {
      self.postMessage({ id, ok: false, error: String(error?.message || error).slice(0, 1000) });
    }
  };
}(typeof globalThis === 'object' ? globalThis : self));
