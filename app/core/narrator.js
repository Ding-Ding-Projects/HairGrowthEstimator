'use strict';

const AUTO_VOICE_ID = 'auto';
const RATE_MIN = 0.1;
const RATE_MAX = 10;
const PITCH_MIN = 0;
const PITCH_MAX = 2;
const DEFAULT_COOLDOWN_MS = 5_000;
const MAX_VOICE_ID_LENGTH = 512;
const MAX_LABEL_LENGTH = 256;
const MAX_TEXT_LENGTH = 16_384;
const MAX_COOLDOWN_MS = 300_000;

const NARRATOR_LANGUAGES = new Set(['en', 'yue', 'both']);
const TRANSIENT_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function boundedNumber(value, fallback, minimum, maximum) {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
}

function boundedMilliseconds(value, fallback) {
  return Math.round(boundedNumber(value, fallback, 0, MAX_COOLDOWN_MS));
}

function cleanBoundedString(value, maximumLength) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength || TRANSIENT_CONTROL_CHARACTERS.test(normalized)) return '';
  return normalized;
}

function normalizeVoiceId(value) {
  const normalized = cleanBoundedString(value, MAX_VOICE_ID_LENGTH);
  return normalized || AUTO_VOICE_ID;
}

function normalizeNarratorSettings(value = {}) {
  const settings = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const language = NARRATOR_LANGUAGES.has(settings.language) ? settings.language : 'en';
  return {
    enabled: settings.enabled === true,
    language,
    englishVoiceId: normalizeVoiceId(settings.englishVoiceId),
    cantoneseVoiceId: normalizeVoiceId(settings.cantoneseVoiceId),
    rate: boundedNumber(settings.rate, 1, RATE_MIN, RATE_MAX),
    pitch: boundedNumber(settings.pitch, 1, PITCH_MIN, PITCH_MAX),
    yieldToAssistiveTechnology: true
  };
}

function persistableNarratorSettings(value = {}) {
  return normalizeNarratorSettings(value);
}

function normalizeLanguageTag(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replaceAll('_', '-');
  if (!normalized || normalized.length > 64 || TRANSIENT_CONTROL_CHARACTERS.test(normalized)) return '';
  return normalized;
}

function classifyVoiceLanguage(value) {
  const tag = normalizeLanguageTag(value).toLowerCase();
  if (/^en(?:-|$)/.test(tag)) return 'en';
  if (
    /^yue(?:-|$)/.test(tag)
    || /^zh-yue(?:-|$)/.test(tag)
    || tag === 'zh-hk'
    || tag.startsWith('zh-hk-')
    || tag === 'zh-hant-hk'
    || tag.startsWith('zh-hant-hk-')
  ) return 'yue';
  return null;
}

function normalizeVoice(rawVoice) {
  if (!rawVoice || typeof rawVoice !== 'object') return null;
  const id = cleanBoundedString(rawVoice.voiceURI, MAX_VOICE_ID_LENGTH);
  if (!id) return null;
  const lang = normalizeLanguageTag(rawVoice.lang);
  return {
    id,
    name: cleanBoundedString(rawVoice.name, MAX_LABEL_LENGTH) || id,
    lang,
    language: classifyVoiceLanguage(lang),
    localService: rawVoice.localService === true,
    default: rawVoice.default === true
  };
}

function normalizeVoices(rawVoices) {
  if (!Array.isArray(rawVoices)) return [];
  const identities = new Set();
  const voices = [];
  for (const rawVoice of rawVoices) {
    const voice = normalizeVoice(rawVoice);
    if (!voice || identities.has(voice.id)) continue;
    identities.add(voice.id);
    voices.push(voice);
  }
  return voices;
}

function normalizePreviousCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const voices = Array.isArray(value.voices)
    ? value.voices.map((voice) => ({ ...voice })).filter((voice) => cleanBoundedString(voice.id, MAX_VOICE_ID_LENGTH))
    : [];
  return {
    phase: value.phase === 'ready' ? 'ready' : 'loading',
    generation: Number.isSafeInteger(value.generation) && value.generation >= 0 ? value.generation : 0,
    stale: value.stale === true,
    voices
  };
}

function reconcileVoices(previousOrRawVoices, rawVoicesOrOptions, maybeOptions) {
  let previousCatalog;
  let rawVoices;
  let options;

  if (Array.isArray(previousOrRawVoices)) {
    previousCatalog = null;
    rawVoices = previousOrRawVoices;
    options = rawVoicesOrOptions;
  } else {
    previousCatalog = normalizePreviousCatalog(previousOrRawVoices);
    rawVoices = Array.isArray(rawVoicesOrOptions) ? rawVoicesOrOptions : [];
    options = maybeOptions;
  }

  const config = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const voices = normalizeVoices(rawVoices);
  const settled = config.settled === true || rawVoices.length > 0;
  const previousGeneration = previousCatalog?.generation || 0;

  if (voices.length > 0) {
    return {
      phase: 'ready',
      generation: previousGeneration + 1,
      stale: false,
      voices
    };
  }

  if (!settled && previousCatalog?.voices.length) {
    return {
      phase: 'ready',
      generation: previousGeneration,
      stale: true,
      voices: previousCatalog.voices.map((voice) => ({ ...voice }))
    };
  }

  if (!settled) {
    return {
      phase: 'loading',
      generation: previousGeneration,
      stale: false,
      voices: []
    };
  }

  return {
    phase: 'ready',
    generation: previousGeneration + 1,
    stale: false,
    voices: []
  };
}

function voiceOptionsForLanguage(catalog, language) {
  if (language !== 'en' && language !== 'yue') return [];
  if (!catalog || !Array.isArray(catalog.voices)) return [];
  return catalog.voices
    .filter((voice) => voice?.language === language)
    .map((voice) => ({ ...voice }));
}

function automaticVoice(candidates) {
  return candidates.find((voice) => voice.default && voice.localService)
    || candidates.find((voice) => voice.localService)
    || candidates.find((voice) => voice.default)
    || candidates[0]
    || null;
}

function voiceSelectionResult(language, requestedVoiceId, candidates, state, effectiveVoice, fallback) {
  return {
    language,
    state,
    requestedVoiceId,
    effectiveVoiceId: effectiveVoice?.id || null,
    effectiveVoiceName: effectiveVoice?.name || null,
    effectiveVoiceLanguage: effectiveVoice?.lang || null,
    fallback: fallback === true,
    networkBacked: Boolean(effectiveVoice && !effectiveVoice.localService),
    availableVoiceCount: candidates.length,
    selectionPresent: requestedVoiceId === AUTO_VOICE_ID
      ? null
      : candidates.some((voice) => voice.id === requestedVoiceId)
  };
}

function resolveVoiceSelection(catalog, language, selectedVoiceId = AUTO_VOICE_ID) {
  if (language !== 'en' && language !== 'yue') throw new TypeError('Narrator voice language must be English or Cantonese.');
  const requestedVoiceId = normalizeVoiceId(selectedVoiceId);
  const candidates = voiceOptionsForLanguage(catalog, language);
  if (!catalog || catalog.phase !== 'ready') {
    return voiceSelectionResult(language, requestedVoiceId, candidates, 'loading', null, false);
  }
  if (candidates.length === 0) {
    return voiceSelectionResult(language, requestedVoiceId, candidates, 'no-language-voice', null, false);
  }

  if (requestedVoiceId !== AUTO_VOICE_ID) {
    const selected = candidates.find((voice) => voice.id === requestedVoiceId);
    if (selected) {
      return voiceSelectionResult(
        language,
        requestedVoiceId,
        candidates,
        selected.localService ? 'selected-present' : 'network-backed',
        selected,
        false
      );
    }
    return voiceSelectionResult(language, requestedVoiceId, candidates, 'uninstalled', automaticVoice(candidates), true);
  }

  const effective = automaticVoice(candidates);
  return voiceSelectionResult(
    language,
    requestedVoiceId,
    candidates,
    effective.localService ? 'selected-present' : 'network-backed',
    effective,
    false
  );
}

function shouldYieldNarration(runtime = {}) {
  const state = runtime && typeof runtime === 'object' && !Array.isArray(runtime) ? runtime : {};
  return state.assistiveTechnologyActive === true
    || state.screenReaderActive === true
    || state.quietHours === true
    || state.reducedSound === true
    || state.narrationPaused === true;
}

function resolveNarrationPolicy(runtime = {}) {
  const state = runtime && typeof runtime === 'object' && !Array.isArray(runtime) ? runtime : {};
  if (state.assistiveTechnologyActive === true || state.screenReaderActive === true) {
    return { allowed: false, reason: 'assistive-technology-active' };
  }
  if (state.quietHours === true) return { allowed: false, reason: 'quiet-hours' };
  if (state.reducedSound === true) return { allowed: false, reason: 'reduced-sound' };
  if (state.narrationPaused === true) return { allowed: false, reason: 'paused' };
  return { allowed: true, reason: null };
}

function normalizeCategory(value) {
  const category = cleanBoundedString(value, 64).toLowerCase();
  return category || 'information';
}

function cleanNarrationText(value) {
  return cleanBoundedString(value, MAX_TEXT_LENGTH);
}

function normalizeCatalogInput(value) {
  if (Array.isArray(value)) return reconcileVoices(value, { settled: true });
  return value && typeof value === 'object' ? value : reconcileVoices([], { settled: true });
}

function planUtterances(request = {}, settingsValue = {}, catalogValue = null, runtime = {}) {
  const settings = normalizeNarratorSettings(settingsValue);
  if (!settings.enabled) return { utterances: [], suppressedLanguages: [], reason: 'disabled' };

  const policy = resolveNarrationPolicy(runtime);
  if (!policy.allowed) return { utterances: [], suppressedLanguages: [], reason: policy.reason };

  const source = request && typeof request === 'object' && !Array.isArray(request) ? request : {};
  const catalog = normalizeCatalogInput(catalogValue);
  const category = normalizeCategory(source.category);
  const supersessionKey = cleanBoundedString(source.supersessionKey, 128) || category;
  const requestedLanguages = settings.language === 'both' ? ['en', 'yue'] : [settings.language];
  const suppressedLanguages = [];
  const utterances = [];

  for (const language of requestedLanguages) {
    const selectedVoiceId = language === 'en' ? settings.englishVoiceId : settings.cantoneseVoiceId;
    const status = resolveVoiceSelection(catalog, language, selectedVoiceId);
    if (status.state === 'loading' || status.state === 'no-language-voice') {
      suppressedLanguages.push(language);
      continue;
    }
    const text = cleanNarrationText(language === 'en' ? (source.english ?? source.en) : (source.cantonese ?? source.yue));
    if (!text) continue;
    utterances.push({
      language,
      languageTag: status.effectiveVoiceLanguage || (language === 'en' ? 'en' : 'yue-HK'),
      text,
      voiceId: status.effectiveVoiceId,
      voiceStatus: status.state,
      category,
      supersessionKey,
      rate: settings.rate,
      pitch: settings.pitch
    });
  }

  return {
    utterances,
    suppressedLanguages,
    reason: utterances.length > 0 ? null : (suppressedLanguages.length > 0 ? 'no-language-voice' : 'no-utterances')
  };
}

function normalizeCooldowns(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const cooldowns = {};
  for (const [rawCategory, rawCooldown] of Object.entries(value)) {
    const category = normalizeCategory(rawCategory);
    if (category === 'error') continue;
    cooldowns[category] = boundedMilliseconds(rawCooldown, DEFAULT_COOLDOWN_MS);
  }
  return cooldowns;
}

function createNarrationQueue(options = {}) {
  const config = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  return {
    pending: [],
    lastAcceptedAtByCategory: {},
    defaultCooldownMs: boundedMilliseconds(config.defaultCooldownMs, DEFAULT_COOLDOWN_MS),
    cooldownMsByCategory: normalizeCooldowns(config.cooldownMsByCategory),
    nextId: 1
  };
}

function normalizeQueuedUtterance(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.language !== 'en' && value.language !== 'yue') return null;
  const text = cleanNarrationText(value.text);
  if (!text) return null;
  return {
    ...value,
    language: value.language,
    text,
    voiceId: cleanBoundedString(value.voiceId, MAX_VOICE_ID_LENGTH) || null,
    rate: boundedNumber(value.rate, 1, RATE_MIN, RATE_MAX),
    pitch: boundedNumber(value.pitch, 1, PITCH_MIN, PITCH_MAX)
  };
}

function normalizeQueue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createNarrationQueue();
  const pending = Array.isArray(value.pending) ? value.pending.map((group) => {
    if (!group || typeof group !== 'object') return null;
    const utterances = Array.isArray(group.utterances)
      ? group.utterances.map(normalizeQueuedUtterance).filter(Boolean)
      : [];
    if (utterances.length === 0) return null;
    return {
      id: cleanBoundedString(group.id, 128) || 'narration-restored',
      category: normalizeCategory(group.category),
      supersessionKey: cleanBoundedString(group.supersessionKey, 128) || normalizeCategory(group.category),
      utterances
    };
  }).filter(Boolean) : [];
  const lastAcceptedAtByCategory = {};
  if (value.lastAcceptedAtByCategory && typeof value.lastAcceptedAtByCategory === 'object') {
    for (const [category, timestamp] of Object.entries(value.lastAcceptedAtByCategory)) {
      if (Number.isFinite(timestamp)) lastAcceptedAtByCategory[normalizeCategory(category)] = Number(timestamp);
    }
  }
  return {
    pending,
    lastAcceptedAtByCategory,
    defaultCooldownMs: boundedMilliseconds(value.defaultCooldownMs, DEFAULT_COOLDOWN_MS),
    cooldownMsByCategory: normalizeCooldowns(value.cooldownMsByCategory),
    nextId: Number.isSafeInteger(value.nextId) && value.nextId > 0 ? value.nextId : 1
  };
}

function enqueueNarration(queueValue, request = {}, options = {}) {
  const queue = normalizeQueue(queueValue);
  const source = request && typeof request === 'object' && !Array.isArray(request) ? request : {};
  const utterances = Array.isArray(source.utterances)
    ? source.utterances.map(normalizeQueuedUtterance).filter(Boolean)
    : [];
  if (utterances.length === 0) return { queue, accepted: false, replaced: false, reason: 'empty' };

  const category = normalizeCategory(source.category || utterances[0].category);
  const supersessionKey = cleanBoundedString(source.supersessionKey || utterances[0].supersessionKey, 128) || category;
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();
  const replacementIndex = queue.pending.findIndex((group) => group.supersessionKey === supersessionKey);
  const group = {
    id: `narration-${queue.nextId}`,
    category,
    supersessionKey,
    utterances
  };

  if (replacementIndex >= 0) {
    const pending = queue.pending.slice();
    pending[replacementIndex] = group;
    return {
      queue: {
        ...queue,
        pending,
        lastAcceptedAtByCategory: { ...queue.lastAcceptedAtByCategory, [category]: now },
        nextId: queue.nextId + 1
      },
      accepted: true,
      replaced: true,
      reason: null
    };
  }

  const cooldownMs = category === 'error'
    ? 0
    : (queue.cooldownMsByCategory[category] ?? queue.defaultCooldownMs);
  const lastAcceptedAt = queue.lastAcceptedAtByCategory[category];
  if (cooldownMs > 0 && Number.isFinite(lastAcceptedAt) && now - lastAcceptedAt < cooldownMs) {
    return { queue, accepted: false, replaced: false, reason: 'cooldown' };
  }

  return {
    queue: {
      ...queue,
      pending: [...queue.pending, group],
      lastAcceptedAtByCategory: { ...queue.lastAcceptedAtByCategory, [category]: now },
      nextId: queue.nextId + 1
    },
    accepted: true,
    replaced: false,
    reason: null
  };
}

function dequeueNarrationUtterance(queueValue) {
  const queue = normalizeQueue(queueValue);
  if (queue.pending.length === 0) return { queue, utterance: null };

  const [firstGroup, ...remainingGroups] = queue.pending;
  const [firstUtterance, ...remainingUtterances] = firstGroup.utterances;
  const pending = remainingUtterances.length > 0
    ? [{ ...firstGroup, utterances: remainingUtterances }, ...remainingGroups]
    : remainingGroups;
  return {
    queue: { ...queue, pending },
    utterance: {
      ...firstUtterance,
      groupId: firstGroup.id,
      category: firstGroup.category,
      supersessionKey: firstGroup.supersessionKey
    }
  };
}

module.exports = {
  AUTO_VOICE_ID,
  DEFAULT_COOLDOWN_MS,
  PITCH_MAX,
  PITCH_MIN,
  RATE_MAX,
  RATE_MIN,
  classifyVoiceLanguage,
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
};
