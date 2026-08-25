'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTO_VOICE_ID,
  createNarrationQueue,
  dequeueNarrationUtterance,
  enqueueNarration,
  normalizeNarratorSettings,
  persistableNarratorSettings,
  planUtterances,
  reconcileVoices,
  resolveNarrationPolicy,
  resolveVoiceSelection,
  shouldYieldNarration,
  voiceOptionsForLanguage
} = require('../../app/core/narrator');

const RAW_VOICES = [
  {
    voiceURI: 'urn:voice:en-local',
    name: 'English Local',
    lang: 'en-CA',
    localService: true,
    default: true
  },
  {
    voiceURI: 'urn:voice:en-cloud',
    name: 'English Cloud',
    lang: 'en-US',
    localService: false,
    default: false
  },
  {
    voiceURI: 'urn:voice:yue-cloud',
    name: 'Cantonese Cloud',
    lang: 'yue-HK',
    localService: false,
    default: false
  },
  {
    voiceURI: 'urn:voice:zh-cn',
    name: 'Mandarin Local',
    lang: 'zh-CN',
    localService: true,
    default: false
  }
];

function readyCatalog(voices = RAW_VOICES) {
  return reconcileVoices(null, voices, { settled: true });
}

test('narrator settings normalize bounded persisted values and keep stable voice identities', () => {
  assert.deepEqual(normalizeNarratorSettings({
    enabled: true,
    language: 'both',
    englishVoiceId: 'urn:voice:en-local',
    cantoneseVoiceId: 'urn:voice:yue-cloud',
    rate: 12,
    pitch: -2,
    yieldToAssistiveTechnology: false,
    ignoredRuntimeValue: 'not persisted'
  }), {
    enabled: true,
    language: 'both',
    englishVoiceId: 'urn:voice:en-local',
    cantoneseVoiceId: 'urn:voice:yue-cloud',
    rate: 10,
    pitch: 0,
    yieldToAssistiveTechnology: true
  });

  assert.deepEqual(normalizeNarratorSettings({
    enabled: 'yes',
    language: 'unknown',
    englishVoiceId: '',
    cantoneseVoiceId: 'bad\u0000identity',
    rate: 'not-a-number',
    pitch: null
  }), {
    enabled: false,
    language: 'en',
    englishVoiceId: AUTO_VOICE_ID,
    cantoneseVoiceId: AUTO_VOICE_ID,
    rate: 1,
    pitch: 1,
    yieldToAssistiveTechnology: true
  });
});

test('persistable narrator settings strip runtime and unknown state', () => {
  assert.deepEqual(persistableNarratorSettings({
    enabled: true,
    language: 'yue',
    englishVoiceId: 'urn:voice:en-local',
    cantoneseVoiceId: 'urn:voice:yue-cloud',
    rate: 1.25,
    pitch: 0.75,
    assistiveTechnologyActive: true,
    voices: RAW_VOICES
  }), {
    enabled: true,
    language: 'yue',
    englishVoiceId: 'urn:voice:en-local',
    cantoneseVoiceId: 'urn:voice:yue-cloud',
    rate: 1.25,
    pitch: 0.75,
    yieldToAssistiveTechnology: true
  });
});

test('voice enumeration represents a delayed first result and later reconciles installed voices', () => {
  const loading = reconcileVoices(null, [], { settled: false });
  assert.equal(loading.phase, 'loading');
  assert.equal(loading.generation, 0);
  assert.deepEqual(loading.voices, []);

  const ready = reconcileVoices(loading, RAW_VOICES, { settled: false });
  assert.equal(ready.phase, 'ready');
  assert.equal(ready.generation, 1);
  assert.equal(ready.voices.length, 4);
  assert.equal(ready.stale, false);

  const transientEmpty = reconcileVoices(ready, [], { settled: false });
  assert.equal(transientEmpty.phase, 'ready');
  assert.equal(transientEmpty.stale, true);
  assert.deepEqual(transientEmpty.voices, ready.voices);

  const confirmedEmpty = reconcileVoices(transientEmpty, [], { settled: true });
  assert.equal(confirmedEmpty.phase, 'ready');
  assert.equal(confirmedEmpty.stale, false);
  assert.deepEqual(confirmedEmpty.voices, []);
  assert.equal(confirmedEmpty.generation, 2);
});

test('voice enumeration uses voiceURI identities, removes duplicates, and ignores unusable identities', () => {
  const catalog = readyCatalog([
    RAW_VOICES[0],
    { ...RAW_VOICES[0], name: 'Duplicate label' },
    { voiceURI: '', name: 'No identity', lang: 'en-US', localService: true },
    { voiceURI: 'bad\u0000identity', name: 'Control identity', lang: 'en-US', localService: true }
  ]);

  assert.equal(catalog.voices.length, 1);
  assert.equal(catalog.voices[0].id, 'urn:voice:en-local');
  assert.equal(catalog.voices[0].name, 'English Local');
});

test('language voice options separate English from Hong Kong Cantonese', () => {
  const catalog = readyCatalog();
  assert.deepEqual(
    voiceOptionsForLanguage(catalog, 'en').map((voice) => voice.id),
    ['urn:voice:en-local', 'urn:voice:en-cloud']
  );
  assert.deepEqual(
    voiceOptionsForLanguage(catalog, 'yue').map((voice) => voice.id),
    ['urn:voice:yue-cloud']
  );
});

test('voice selection reports selected-present and network-backed states', () => {
  const catalog = readyCatalog();
  const local = resolveVoiceSelection(catalog, 'en', 'urn:voice:en-local');
  assert.equal(local.state, 'selected-present');
  assert.equal(local.effectiveVoiceId, 'urn:voice:en-local');
  assert.equal(local.fallback, false);
  assert.equal(local.networkBacked, false);

  const cloud = resolveVoiceSelection(catalog, 'yue', 'urn:voice:yue-cloud');
  assert.equal(cloud.state, 'network-backed');
  assert.equal(cloud.effectiveVoiceId, 'urn:voice:yue-cloud');
  assert.equal(cloud.fallback, false);
  assert.equal(cloud.networkBacked, true);
});

test('an uninstalled selection is retained while an automatic fallback becomes effective', () => {
  const status = resolveVoiceSelection(readyCatalog(), 'en', 'urn:voice:removed');
  assert.equal(status.state, 'uninstalled');
  assert.equal(status.requestedVoiceId, 'urn:voice:removed');
  assert.equal(status.effectiveVoiceId, 'urn:voice:en-local');
  assert.equal(status.fallback, true);
  assert.equal(status.networkBacked, false);
});

test('automatic selection reports a network voice and reports when a language has no voice', () => {
  const catalog = readyCatalog([RAW_VOICES[2]]);
  const cantonese = resolveVoiceSelection(catalog, 'yue', AUTO_VOICE_ID);
  assert.equal(cantonese.state, 'network-backed');
  assert.equal(cantonese.effectiveVoiceId, 'urn:voice:yue-cloud');
  assert.equal(cantonese.networkBacked, true);

  const english = resolveVoiceSelection(catalog, 'en', AUTO_VOICE_ID);
  assert.equal(english.state, 'no-language-voice');
  assert.equal(english.effectiveVoiceId, null);
});

test('voice selection stays in loading state until delayed enumeration settles', () => {
  const loading = reconcileVoices(null, [], { settled: false });
  const status = resolveVoiceSelection(loading, 'en', AUTO_VOICE_ID);
  assert.equal(status.state, 'loading');
  assert.equal(status.effectiveVoiceId, null);
});

test('narration policy yields to assistive technology and quiet audio policies', () => {
  assert.equal(shouldYieldNarration({ assistiveTechnologyActive: true }), true);
  assert.equal(shouldYieldNarration({ quietHours: true }), true);
  assert.equal(shouldYieldNarration({ reducedSound: true }), true);
  assert.equal(shouldYieldNarration({}), false);

  assert.deepEqual(resolveNarrationPolicy({ assistiveTechnologyActive: true }), {
    allowed: false,
    reason: 'assistive-technology-active'
  });
  assert.deepEqual(resolveNarrationPolicy({ quietHours: true }), {
    allowed: false,
    reason: 'quiet-hours'
  });
  assert.deepEqual(resolveNarrationPolicy({ reducedSound: true }), {
    allowed: false,
    reason: 'reduced-sound'
  });
  assert.deepEqual(resolveNarrationPolicy({}), { allowed: true, reason: null });
});

test('both-language narration plans English then Cantonese with resolved voices', () => {
  const catalog = readyCatalog();
  const settings = normalizeNarratorSettings({
    enabled: true,
    language: 'both',
    englishVoiceId: 'urn:voice:en-local',
    cantoneseVoiceId: 'urn:voice:yue-cloud',
    rate: 1.5,
    pitch: 0.8
  });
  const result = planUtterances({
    category: 'progress',
    english: 'Estimated length is 2.5 centimetres.',
    cantonese: '估算長度係 2.5 厘米。',
    supersessionKey: 'growth-estimate'
  }, settings, catalog, {});

  assert.equal(result.reason, null);
  assert.deepEqual(result.suppressedLanguages, []);
  assert.deepEqual(result.utterances.map((item) => item.language), ['en', 'yue']);
  assert.deepEqual(result.utterances.map((item) => item.text), [
    'Estimated length is 2.5 centimetres.',
    '估算長度係 2.5 厘米。'
  ]);
  assert.deepEqual(result.utterances.map((item) => item.voiceId), [
    'urn:voice:en-local',
    'urn:voice:yue-cloud'
  ]);
  assert.ok(result.utterances.every((item) => item.rate === 1.5 && item.pitch === 0.8));
});

test('planning omits only the language with no installed voice and preserves the factual text', () => {
  const catalog = readyCatalog([RAW_VOICES[0]]);
  const result = planUtterances({
    category: 'information',
    english: 'Haircut recorded on 2026-08-25.',
    cantonese: '已記錄 2026-08-25 剪髮。'
  }, normalizeNarratorSettings({ enabled: true, language: 'both' }), catalog, {});

  assert.deepEqual(result.utterances.map((item) => item.text), ['Haircut recorded on 2026-08-25.']);
  assert.deepEqual(result.suppressedLanguages, ['yue']);
});

test('planning returns an explicit reason when narration is disabled or must yield', () => {
  const catalog = readyCatalog();
  const disabled = planUtterances({ english: 'Saved.', cantonese: '已儲存。' }, normalizeNarratorSettings({}), catalog, {});
  assert.deepEqual(disabled, { utterances: [], suppressedLanguages: [], reason: 'disabled' });

  const yielded = planUtterances(
    { english: 'Saved.', cantonese: '已儲存。' },
    normalizeNarratorSettings({ enabled: true }),
    catalog,
    { assistiveTechnologyActive: true }
  );
  assert.deepEqual(yielded, {
    utterances: [],
    suppressedLanguages: [],
    reason: 'assistive-technology-active'
  });
});

test('queue supersession replaces a pending bilingual group without changing language order', () => {
  let queue = createNarrationQueue();
  const first = enqueueNarration(queue, {
    category: 'progress',
    supersessionKey: 'growth-estimate',
    utterances: [
      { language: 'en', text: 'Length is 2.4 centimetres.' },
      { language: 'yue', text: '長度係 2.4 厘米。' }
    ]
  }, { now: 1_000 });
  assert.equal(first.accepted, true);
  queue = first.queue;

  const replacement = enqueueNarration(queue, {
    category: 'progress',
    supersessionKey: 'growth-estimate',
    utterances: [
      { language: 'en', text: 'Length is 2.5 centimetres.' },
      { language: 'yue', text: '長度係 2.5 厘米。' }
    ]
  }, { now: 1_100 });
  assert.equal(replacement.accepted, true);
  assert.equal(replacement.replaced, true);
  assert.equal(replacement.queue.pending.length, 1);

  const english = dequeueNarrationUtterance(replacement.queue);
  assert.equal(english.utterance.text, 'Length is 2.5 centimetres.');
  const cantonese = dequeueNarrationUtterance(english.queue);
  assert.equal(cantonese.utterance.text, '長度係 2.5 厘米。');
  const empty = dequeueNarrationUtterance(cantonese.queue);
  assert.equal(empty.utterance, null);
});

test('queue cooldowns limit repeated categories while errors remain unthrottled', () => {
  let queue = createNarrationQueue({ defaultCooldownMs: 5_000 });
  queue = enqueueNarration(queue, {
    category: 'success',
    supersessionKey: 'saved-a',
    utterances: [{ language: 'en', text: 'First save completed.' }]
  }, { now: 10_000 }).queue;

  const cooledDown = enqueueNarration(queue, {
    category: 'success',
    supersessionKey: 'saved-b',
    utterances: [{ language: 'en', text: 'Second save completed.' }]
  }, { now: 11_000 });
  assert.equal(cooledDown.accepted, false);
  assert.equal(cooledDown.reason, 'cooldown');

  const afterCooldown = enqueueNarration(queue, {
    category: 'success',
    supersessionKey: 'saved-c',
    utterances: [{ language: 'en', text: 'Third save completed.' }]
  }, { now: 15_000 });
  assert.equal(afterCooldown.accepted, true);

  const firstError = enqueueNarration(afterCooldown.queue, {
    category: 'error',
    supersessionKey: 'server-error-a',
    utterances: [{ language: 'en', text: 'Server request failed.' }]
  }, { now: 15_001 });
  const secondError = enqueueNarration(firstError.queue, {
    category: 'error',
    supersessionKey: 'server-error-b',
    utterances: [{ language: 'en', text: 'Local save failed.' }]
  }, { now: 15_001 });
  assert.equal(firstError.accepted, true);
  assert.equal(secondError.accepted, true);
});

test('queue rejects empty utterance groups and preserves its prior state', () => {
  const queue = createNarrationQueue();
  const result = enqueueNarration(queue, {
    category: 'information',
    supersessionKey: 'empty',
    utterances: [{ language: 'en', text: '   ' }]
  }, { now: 1 });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'empty');
  assert.deepEqual(result.queue, queue);
});
