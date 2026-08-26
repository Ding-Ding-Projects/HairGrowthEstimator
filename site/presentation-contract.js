(function installHairGrowthPresentationContract(root) {
  'use strict';

  const LANGUAGE_MODES = Object.freeze(['en', 'yue', 'both']);
  const FUNNY_LEVELS = Object.freeze([1, 2, 3, 4, 5]);
  const MESSAGE_CATEGORIES = Object.freeze([
    'informational',
    'success',
    'progress',
    'warning',
    'error',
    'destructive',
    'security',
    'accessibility'
  ]);
  const MESSAGE_IDS = Object.freeze([
    'informational.saved',
    'success.applied',
    'progress.working',
    'warning.review',
    'error.failed',
    'destructive.confirm',
    'security.blocked',
    'accessibility.status'
  ]);
  const SCHEDULE_SCHEMA_VERSION = 1;
  const ATTENTION_MODE_KEYS = Object.freeze(['focus', 'lowStim', 'time', 'one', 'momentum']);
  const ATTENTION_DEFAULTS = Object.freeze({
    focus: false,
    lowStim: false,
    time: false,
    one: false,
    momentum: false,
    nextAction: '',
    snoozedUntil: 0
  });
  const NARRATION_DEBOUNCE_MS = 250;
  const NARRATION_COOLDOWNS_MS = Object.freeze({
    informational: 5000,
    success: 3000,
    progress: 5000,
    warning: 5000,
    error: 0,
    destructive: 1000,
    security: 1000,
    accessibility: 2000
  });
  const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/;
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_ONLY = /^\d{2}:\d{2}$/;
  const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
  const HEX_COLOR = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{1}|[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?$/;
  const HOME_ASSISTANT_ENTITY = /^(?:binary_sensor|input_boolean)\.[a-z0-9_]+$/;
  const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  const SCHEDULE_SETTING_KEYS = Object.freeze(['language', 'theme', 'density', 'accent', 'fontScale', 'motion']);

  const MESSAGE_REGISTRY = deepFreeze({
    'informational.saved': {
      category: 'informational',
      placeholders: ['item'],
      templates: {
        en: [
          '{item} was saved.',
          '{item} was saved and is ready.',
          '{item} was saved. The latest details are ready.',
          '{item} was saved. Everything is sitting where expected.',
          '{item} was saved. It is tucked in neatly and ready for the next step.'
        ],
        yue: [
          '已儲存 {item}。',
          '已儲存 {item}，而家可以繼續。',
          '已儲存 {item}，最新資料已經準備好。',
          '已儲存 {item}，全部資料都放好晒。',
          '已儲存 {item}，整整齊齊坐定定，可以去下一步。'
        ]
      }
    },
    'success.applied': {
      category: 'success',
      placeholders: ['item'],
      templates: {
        en: [
          '{item} was applied successfully.',
          '{item} was applied and is now active.',
          '{item} was applied. The new setting is active.',
          '{item} was applied. The change landed exactly where requested.',
          '{item} was applied. The setting clicked into place and is now active.'
        ],
        yue: [
          '已成功套用 {item}。',
          '已套用 {item}，而家正式生效。',
          '已套用 {item}，新設定已經生效。',
          '已套用 {item}，改動準確落咗位。',
          '已套用 {item}，設定啪一聲企啱位，而家正式生效。'
        ]
      }
    },
    'progress.working': {
      category: 'progress',
      placeholders: ['item', 'percent'],
      templates: {
        en: [
          '{item} is in progress at {percent}%.',
          '{item} is moving forward at {percent}%.',
          '{item} is still working. Progress is {percent}%.',
          '{item} is moving along steadily at {percent}%.',
          '{item} is trundling along with purpose. Progress is {percent}%.'
        ],
        yue: [
          '{item} 進行中，進度係 {percent}%。',
          '{item} 繼續向前，進度係 {percent}%。',
          '{item} 仲處理緊，而家進度係 {percent}%。',
          '{item} 穩穩陣陣向前行，進度係 {percent}%。',
          '{item} 好有方向咁碌緊向前，進度係 {percent}%。'
        ]
      }
    },
    'warning.review': {
      category: 'warning',
      placeholders: ['item', 'reason'],
      templates: {
        en: [
          'Review {item}. Reason: {reason}.',
          'Please review {item}. Reason: {reason}.',
          '{item} needs a review because {reason}.',
          '{item} needs another look. The reason is {reason}.',
          '{item} is waving a small yellow flag. Review it because {reason}.'
        ],
        yue: [
          '請檢查 {item}。原因：{reason}。',
          '請再睇一睇 {item}。原因：{reason}。',
          '{item} 需要檢查，因為 {reason}。',
          '{item} 要望多眼，原因係 {reason}。',
          '{item} 舉緊一面細細黃旗，請檢查，因為 {reason}。'
        ]
      }
    },
    'error.failed': {
      category: 'error',
      placeholders: ['item', 'reason', 'action'],
      templates: {
        en: [
          '{item} failed. Reason: {reason}. Next action: {action}.',
          '{item} did not complete. Reason: {reason}. Next action: {action}.',
          '{item} could not finish because {reason}. Next action: {action}.',
          '{item} stopped before completion. Reason: {reason}. Next action: {action}.',
          '{item} sat down before the finish line. Reason: {reason}. Next action: {action}.'
        ],
        yue: [
          '{item} 失敗。原因：{reason}。下一步：{action}。',
          '{item} 未能完成。原因：{reason}。下一步：{action}。',
          '{item} 因為 {reason} 而未能完成。下一步：{action}。',
          '{item} 完成之前停咗。原因：{reason}。下一步：{action}。',
          '{item} 未到終點就坐低咗。原因：{reason}。下一步：{action}。'
        ]
      }
    },
    'destructive.confirm': {
      category: 'destructive',
      placeholders: ['action', 'target', 'consequence'],
      templates: {
        en: [
          'Confirm {action} for {target}. Consequence: {consequence}.',
          'Confirm that you want to {action} for {target}. Consequence: {consequence}.',
          'Review this before continuing: {action} for {target}. Consequence: {consequence}.',
          'This action needs confirmation: {action} for {target}. Consequence: {consequence}.',
          'Pause for the serious bit: confirm {action} for {target}. Consequence: {consequence}.'
        ],
        yue: [
          '確認為 {target} 執行 {action}。後果：{consequence}。',
          '請確認要為 {target} 執行 {action}。後果：{consequence}。',
          '繼續之前請檢查：為 {target} 執行 {action}。後果：{consequence}。',
          '呢個動作需要確認：為 {target} 執行 {action}。後果：{consequence}。',
          '嚴肅位要停一停：確認為 {target} 執行 {action}。後果：{consequence}。'
        ]
      }
    },
    'security.blocked': {
      category: 'security',
      placeholders: ['action', 'reason', 'recovery'],
      templates: {
        en: [
          '{action} was blocked. Reason: {reason}. Recovery: {recovery}.',
          '{action} was not allowed. Reason: {reason}. Recovery: {recovery}.',
          '{action} was stopped because {reason}. Recovery: {recovery}.',
          '{action} stayed behind the safety boundary. Reason: {reason}. Recovery: {recovery}.',
          '{action} met the locked door and stayed outside. Reason: {reason}. Recovery: {recovery}.'
        ],
        yue: [
          '{action} 已被阻止。原因：{reason}。復原方法：{recovery}。',
          '{action} 不獲允許。原因：{reason}。復原方法：{recovery}。',
          '{action} 因為 {reason} 而停低。復原方法：{recovery}。',
          '{action} 留喺安全界線之外。原因：{reason}。復原方法：{recovery}。',
          '{action} 撞到鎖門，所以留咗喺門外。原因：{reason}。復原方法：{recovery}。'
        ]
      }
    },
    'accessibility.status': {
      category: 'accessibility',
      placeholders: ['feature', 'state'],
      templates: {
        en: [
          '{feature} is {state}.',
          '{feature} is currently {state}.',
          'Accessibility status: {feature} is {state}.',
          '{feature} is {state}. This state is available through the same controls.',
          '{feature} is {state}. The controls and the facts are staying in step.'
        ],
        yue: [
          '{feature} 而家係 {state}。',
          '{feature} 目前係 {state}。',
          '無障礙狀態：{feature} 而家係 {state}。',
          '{feature} 而家係 {state}，同一組控制仍然可以操作。',
          '{feature} 而家係 {state}，控制同實際狀態一齊行，冇甩隊。'
        ]
      }
    }
  });

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }

  function clampNumber(value, minimum, maximum, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
  }

  function normalizeLanguageMode(value, { schoolActive = false } = {}) {
    if (schoolActive) return 'en';
    return LANGUAGE_MODES.includes(value) ? value : 'en';
  }

  function normalizeFunnyLevel(value, fallback = 5) {
    const safeFallback = Number.isInteger(fallback) && FUNNY_LEVELS.includes(fallback) ? fallback : 5;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return safeFallback;
    return Math.min(5, Math.max(1, Math.round(parsed)));
  }

  function extractPlaceholders(template) {
    if (typeof template !== 'string') throw new TypeError('A message template must be text.');
    const names = [];
    const seen = new Set();
    const pattern = /\{([a-z][a-zA-Z0-9]*)\}/g;
    let match;
    while ((match = pattern.exec(template))) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        names.push(match[1]);
      }
    }
    return names.sort();
  }

  function sameStrings(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function validateMessageRegistry(registry = MESSAGE_REGISTRY) {
    if (!isObject(registry)) throw new Error('The message registry must be an object.');
    const ids = Object.keys(registry);
    if (!sameStrings(ids, MESSAGE_IDS)) throw new Error('The message registry identifiers do not match the hand-written inventory.');
    const representedCategories = [];
    for (const id of MESSAGE_IDS) {
      const entry = registry[id];
      if (!isObject(entry) || !MESSAGE_CATEGORIES.includes(entry.category)) throw new Error(`Message ${id} has an unsupported category.`);
      if (representedCategories.includes(entry.category)) throw new Error(`Message category ${entry.category} is represented more than once.`);
      representedCategories.push(entry.category);
      if (!Array.isArray(entry.placeholders) || new Set(entry.placeholders).size !== entry.placeholders.length) throw new Error(`Message ${id} has invalid declared placeholders.`);
      const expected = [...entry.placeholders].sort();
      if (!isObject(entry.templates) || !sameStrings(Object.keys(entry.templates), ['en', 'yue'])) throw new Error(`Message ${id} must provide English and Cantonese templates.`);
      for (const language of ['en', 'yue']) {
        const variants = entry.templates[language];
        if (!Array.isArray(variants) || variants.length !== FUNNY_LEVELS.length) throw new Error(`Message ${id} must provide five ${language} variants.`);
        for (const template of variants) {
          if (!sameStrings(extractPlaceholders(template), expected)) throw new Error(`Message ${id} changes factual placeholders in ${language}.`);
        }
      }
    }
    if (!sameStrings([...representedCategories].sort(), [...MESSAGE_CATEGORIES].sort())) throw new Error('The message registry does not represent every required category.');
    return true;
  }

  function fillTemplate(template, placeholders, facts) {
    if (!isObject(facts)) throw new Error('Message facts must be an object.');
    for (const name of placeholders) {
      if (!Object.hasOwn(facts, name)) throw new Error(`Message fact ${name} is required.`);
    }
    return template.replace(/\{([a-z][a-zA-Z0-9]*)\}/g, (_match, name) => String(facts[name]));
  }

  function resolveMessage(messageId, {
    language = 'en',
    funnyEn = 5,
    funnyYue = 5,
    facts = {},
    schoolActive = false
  } = {}) {
    const entry = MESSAGE_REGISTRY[messageId];
    if (!entry) throw new Error(`Unknown message identifier ${String(messageId)}.`);
    const normalizedLanguage = normalizeLanguageMode(language, { schoolActive });
    const texts = {
      en: fillTemplate(entry.templates.en[normalizeFunnyLevel(funnyEn) - 1], entry.placeholders, facts),
      yue: fillTemplate(entry.templates.yue[normalizeFunnyLevel(funnyYue) - 1], entry.placeholders, facts)
    };
    const tracks = normalizedLanguage === 'both'
      ? [{ language: 'en', text: texts.en }, { language: 'yue', text: texts.yue }]
      : [{ language: normalizedLanguage, text: texts[normalizedLanguage] }];
    return deepFreeze({
      id: messageId,
      category: entry.category,
      language: normalizedLanguage,
      text: tracks.map((track) => track.text).join('\n'),
      tracks
    });
  }

  function normalizeSchoolRecord(value) {
    const source = isObject(value) && value.schemaVersion === 1 ? value : {};
    const candidateName = typeof source.displayName === 'string' ? source.displayName.trim() : '';
    const displayName = candidateName && candidateName.length <= 80 && !/[\u0000-\u001f\u007f]/.test(candidateName)
      ? candidateName
      : 'School mode';
    const revision = Number.isSafeInteger(source.revision) && source.revision >= 0 ? source.revision : 0;
    const updatedAt = typeof source.updatedAt === 'string' && ISO_UTC.test(source.updatedAt) && Number.isFinite(Date.parse(source.updatedAt))
      ? source.updatedAt
      : null;
    return Object.freeze({
      schemaVersion: 1,
      enabled: source.enabled === true,
      displayName,
      revision,
      updatedAt
    });
  }

  function getSchoolSuppression(value) {
    const active = normalizeSchoolRecord(value).enabled;
    return Object.freeze({
      active,
      forceLanguage: active ? 'en' : null,
      suppressCantonese: active,
      suppressBilingual: active,
      suppressFunnyLevels: active,
      suppressPersonalVocabulary: active,
      suppressDimSum: active,
      suppressPrivateVocabulary: active
    });
  }

  function normalizeVoiceIdentity(value) {
    if (value === 'auto') return 'auto';
    if (typeof value !== 'string') return 'auto';
    const identity = value.trim();
    return identity && identity.length <= 512 && !/[\u0000-\u001f\u007f]/.test(identity) ? identity : 'auto';
  }

  function normalizeNarratorSettings(value) {
    const source = isObject(value) && (value.schemaVersion === undefined || value.schemaVersion === 1) ? value : {};
    return Object.freeze({
      schemaVersion: 1,
      enabled: source.enabled === true,
      language: normalizeLanguageMode(source.language),
      voiceURIEn: normalizeVoiceIdentity(source.voiceURIEn),
      voiceURIYue: normalizeVoiceIdentity(source.voiceURIYue),
      rate: clampNumber(source.rate, 0.1, 10, 1),
      pitch: clampNumber(source.pitch, 0, 2, 1),
      assistiveTechnologyActive: source.assistiveTechnologyActive === true,
      quietHours: source.quietHours === true,
      reducedSound: source.reducedSound === true
    });
  }

  function shouldYieldNarration(value) {
    const settings = normalizeNarratorSettings(value);
    return !settings.enabled || settings.assistiveTechnologyActive || settings.quietHours || settings.reducedSound;
  }

  function buildNarrationTracks({ language = 'en', englishText = '', cantoneseText = '', schoolActive = false } = {}) {
    const normalizedLanguage = normalizeLanguageMode(language, { schoolActive });
    const en = typeof englishText === 'string' ? englishText.trim() : '';
    const yue = typeof cantoneseText === 'string' ? cantoneseText.trim() : '';
    if (normalizedLanguage === 'en') return en ? Object.freeze([{ language: 'en', text: en }]) : Object.freeze([]);
    if (normalizedLanguage === 'yue') return yue ? Object.freeze([{ language: 'yue', text: yue }]) : Object.freeze([]);
    const tracks = [];
    if (en) tracks.push({ language: 'en', text: en });
    if (yue) tracks.push({ language: 'yue', text: yue });
    return deepFreeze(tracks);
  }

  function evaluateNarrationAdmission({
    category,
    now = Date.now(),
    lastAcceptedAt = null,
    lastAcceptedAtByCategory = {}
  } = {}) {
    if (!MESSAGE_CATEGORIES.includes(category)) throw new Error('Narration admission needs a supported category.');
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('Narration admission time must be a non-negative integer.');
    if (lastAcceptedAt !== null && (!Number.isSafeInteger(lastAcceptedAt) || lastAcceptedAt < 0 || lastAcceptedAt > now)) throw new Error('The last narration admission time is invalid.');
    if (!isObject(lastAcceptedAtByCategory)) throw new Error('Narration category times must be an object.');
    for (const [storedCategory, timestamp] of Object.entries(lastAcceptedAtByCategory)) {
      if (!MESSAGE_CATEGORIES.includes(storedCategory) || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > now) throw new Error('A narration category time is invalid.');
    }
    if (category === 'error') return Object.freeze({ allowed: true, reason: 'urgent', retryAt: now });
    const debounceAt = lastAcceptedAt === null ? now : lastAcceptedAt + NARRATION_DEBOUNCE_MS;
    const categoryTime = Object.hasOwn(lastAcceptedAtByCategory, category) ? lastAcceptedAtByCategory[category] : null;
    const cooldownAt = categoryTime === null ? now : categoryTime + NARRATION_COOLDOWNS_MS[category];
    const retryAt = Math.max(now, debounceAt, cooldownAt);
    if (retryAt <= now) return Object.freeze({ allowed: true, reason: 'ready', retryAt: now });
    return Object.freeze({
      allowed: false,
      reason: debounceAt >= cooldownAt ? 'debounce' : 'cooldown',
      retryAt
    });
  }

  function normalizeNarrationEntry(value) {
    if (!isObject(value) || !MESSAGE_CATEGORIES.includes(value.category)) throw new Error('A queued narration entry needs a supported category.');
    if (!Array.isArray(value.tracks) || value.tracks.length < 1 || value.tracks.length > 2) throw new Error('A queued narration entry needs one or two tracks.');
    const tracks = value.tracks.map((track) => {
      if (!isObject(track) || !['en', 'yue'].includes(track.language) || typeof track.text !== 'string' || !track.text.trim() || track.text.length > 2000) throw new Error('A queued narration track is invalid.');
      return { language: track.language, text: track.text.trim() };
    });
    return { category: value.category, tracks };
  }

  function replaceQueuedNarration(queue, entry, { maxEntries = 32 } = {}) {
    if (!Array.isArray(queue)) throw new Error('The narration queue must be an array.');
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 64) throw new Error('The narration queue bound must be an integer from 1 to 64.');
    const normalized = normalizeNarrationEntry(entry);
    const next = [];
    for (const candidate of queue.map(normalizeNarrationEntry)) {
      const duplicateIndex = next.findIndex((queued) => queued.category === candidate.category);
      if (duplicateIndex >= 0) next[duplicateIndex] = candidate;
      else next.push(candidate);
    }
    const existingIndex = next.findIndex((candidate) => candidate.category === normalized.category);
    if (existingIndex >= 0) next[existingIndex] = normalized;
    else next.push(normalized);
    return deepFreeze(next.slice(-maxEntries));
  }

  function exactKeys(value, expected, label) {
    if (!isObject(value)) throw new Error(`${label} must be an object.`);
    const keys = Object.keys(value);
    if (!sameStrings(keys.sort(), [...expected].sort())) throw new Error(`${label} has missing or unexpected fields.`);
  }

  function validateDateOnly(value, label, { optional = false } = {}) {
    if (optional && value === '') return '';
    if (typeof value !== 'string' || !DATE_ONLY.test(value)) throw new Error(`${label} must use YYYY-MM-DD.`);
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`${label} is not a real calendar date.`);
    return value;
  }

  function validateTimeOnly(value, label) {
    if (typeof value !== 'string' || !TIME_ONLY.test(value)) throw new Error(`${label} must use HH:MM.`);
    const [hour, minute] = value.split(':').map(Number);
    if (hour > 23 || minute > 59) throw new Error(`${label} is not a real clock time.`);
    return value;
  }

  function validateScheduleSettings(value, { partial = false } = {}) {
    if (!isObject(value)) throw new Error('Scheduled settings must be an object.');
    const keys = Object.keys(value);
    if (!partial && !sameStrings([...keys].sort(), [...SCHEDULE_SETTING_KEYS].sort())) throw new Error('Scheduled settings have missing or unexpected fields.');
    if (partial && keys.some((key) => !SCHEDULE_SETTING_KEYS.includes(key))) throw new Error('External scheduled settings contain an unsupported field.');
    const result = {};
    for (const key of keys) {
      const field = value[key];
      if (key === 'language' && !['unchanged', 'en', 'yue', 'both'].includes(field)) throw new Error('Scheduled language is unsupported.');
      if (key === 'theme' && !['unchanged', 'dark', 'light', 'contrast'].includes(field)) throw new Error('Scheduled theme is unsupported.');
      if (key === 'density' && !['unchanged', 'compact', 'comfortable', 'spacious'].includes(field)) throw new Error('Scheduled density is unsupported.');
      if (key === 'accent' && field !== 'unchanged' && (typeof field !== 'string' || !HEX_COLOR.test(field))) throw new Error('Scheduled accent must be unchanged or a hexadecimal color.');
      if (key === 'fontScale' && (!Number.isFinite(field) || field < 0.75 || field > 2)) throw new Error('Scheduled font scale must be from 0.75 to 2.');
      if (key === 'motion' && !['unchanged', 'full', 'reduced'].includes(field)) throw new Error('Scheduled motion is unsupported.');
      result[key] = field;
    }
    return result;
  }

  function isSafeExternalSettingsUrl(value) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) return false;
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return false;
    }
    if (parsed.username || parsed.password || parsed.hash) return false;
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  }

  function validateScheduleRule(value) {
    exactKeys(value, ['id', 'label', 'enabled', 'priority', 'startDate', 'endDate', 'start', 'end', 'everyDay', 'days', 'settings', 'source', 'createdAt'], 'Schedule rule');
    if (typeof value.id !== 'string' || !SAFE_IDENTIFIER.test(value.id)) throw new Error('Schedule rule identifier is invalid.');
    if (typeof value.label !== 'string' || !value.label.trim() || value.label.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(value.label)) throw new Error('Schedule rule label must contain 1 to 80 safe characters.');
    if (typeof value.enabled !== 'boolean') throw new Error('Schedule rule enabled state must be true or false.');
    if (!Number.isSafeInteger(value.priority) || value.priority < -1000 || value.priority > 1000) throw new Error('Schedule priority must be an integer from -1000 to 1000.');
    const startDate = validateDateOnly(value.startDate, 'Schedule start date', { optional: true });
    const endDate = validateDateOnly(value.endDate, 'Schedule end date', { optional: true });
    if (startDate && endDate && startDate > endDate) throw new Error('Schedule date range is reversed.');
    const start = validateTimeOnly(value.start, 'Schedule start time');
    const end = validateTimeOnly(value.end, 'Schedule end time');
    if (typeof value.everyDay !== 'boolean') throw new Error('Schedule every-day state must be true or false.');
    if (!Array.isArray(value.days) || value.days.length > 7 || value.days.some((day) => !Number.isSafeInteger(day) || day < 0 || day > 6) || new Set(value.days).size !== value.days.length) throw new Error('Schedule days must be unique integers from 0 to 6.');
    if (!value.everyDay && value.days.length === 0) throw new Error('A schedule needs a weekday when every day is off.');
    const settings = validateScheduleSettings(value.settings);
    exactKeys(value.source, ['kind', 'url', 'entityId'], 'Schedule source');
    const source = { kind: value.source.kind, url: value.source.url, entityId: value.source.entityId };
    if (!['local', 'api', 'homeAssistant'].includes(source.kind)) throw new Error('Schedule source kind is unsupported.');
    if (typeof source.url !== 'string' || source.url.length > 512) throw new Error('Schedule source URL is invalid.');
    if (typeof source.entityId !== 'string' || source.entityId.length > 160) throw new Error('Schedule source entity identifier is invalid.');
    if (source.kind === 'local' && (source.url || source.entityId)) throw new Error('A local schedule source cannot carry external fields.');
    if (source.kind !== 'local' && !isSafeExternalSettingsUrl(source.url)) throw new Error('An external schedule source URL is unsafe.');
    if (source.kind === 'api' && source.entityId) throw new Error('An API schedule source cannot carry a Home Assistant entity.');
    if (source.kind === 'homeAssistant' && !HOME_ASSISTANT_ENTITY.test(source.entityId)) throw new Error('A Home Assistant schedule source needs a supported boolean entity.');
    if (typeof value.createdAt !== 'string' || !ISO_UTC.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('Schedule creation time must be a UTC ISO timestamp.');
    return deepFreeze({
      id: value.id,
      label: value.label.trim(),
      enabled: value.enabled,
      priority: value.priority,
      startDate,
      endDate,
      start,
      end,
      everyDay: value.everyDay,
      days: [...value.days],
      settings,
      source,
      createdAt: value.createdAt
    });
  }

  function validateTimeZone(value) {
    const candidate = typeof value === 'string' && value.length <= 100 ? value : '';
    if (!candidate) throw new Error('A valid IANA timezone is required.');
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: candidate }).format(new Date(0));
    } catch {
      throw new Error('A valid IANA timezone is required.');
    }
    return candidate;
  }

  function resolvedBrowserTimeZone() {
    const candidate = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return validateTimeZone(candidate || 'UTC');
  }

  function zonedParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    const dateOnly = `${parts.year}-${parts.month}-${parts.day}`;
    const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
    const weekday = new Date(`${dateOnly}T00:00:00Z`).getUTCDay();
    return { dateOnly, minuteOfDay, weekday };
  }

  function previousCalendarDay(dateOnly) {
    const [year, month, day] = dateOnly.split('-').map(Number);
    const previous = new Date(Date.UTC(year, month - 1, day) - 86400000);
    const value = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}-${String(previous.getUTCDate()).padStart(2, '0')}`;
    return { dateOnly: value, weekday: previous.getUTCDay() };
  }

  function minuteValue(time) {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  }

  function scheduleWindow(rule, current) {
    const startMinute = minuteValue(rule.start);
    const endMinute = minuteValue(rule.end);
    if (startMinute === endMinute) return { matched: true, startDate: current.dateOnly, weekday: current.weekday };
    if (startMinute < endMinute) return {
      matched: current.minuteOfDay >= startMinute && current.minuteOfDay < endMinute,
      startDate: current.dateOnly,
      weekday: current.weekday
    };
    if (current.minuteOfDay >= startMinute) return { matched: true, startDate: current.dateOnly, weekday: current.weekday };
    if (current.minuteOfDay < endMinute) {
      const previous = previousCalendarDay(current.dateOnly);
      return { matched: true, startDate: previous.dateOnly, weekday: previous.weekday };
    }
    return { matched: false, startDate: current.dateOnly, weekday: current.weekday };
  }

  function resolveScheduleSource(rule, sourceStates) {
    if (rule.source.kind === 'local') return { active: true, settings: rule.settings };
    const state = isObject(sourceStates) ? sourceStates[rule.id] : undefined;
    const active = typeof state === 'boolean' ? state : isObject(state) && state.active === true;
    if (!active) return { active: false, settings: rule.settings };
    if (rule.source.kind === 'api' && isObject(state) && Object.hasOwn(state, 'settings')) {
      const remoteSettings = validateScheduleSettings(state.settings, { partial: true });
      return { active: true, settings: { ...rule.settings, ...remoteSettings } };
    }
    return { active: true, settings: rule.settings };
  }

  function evaluateScheduleRules(rules, {
    now = new Date(),
    timeZone = resolvedBrowserTimeZone(),
    sourceStates = {}
  } = {}) {
    if (!Array.isArray(rules) || rules.length > 256) throw new Error('Schedule rules must be an array with at most 256 items.');
    const instant = new Date(Number(now));
    if (!Number.isFinite(instant.getTime())) throw new Error('Schedule evaluation needs a valid date and time.');
    const normalizedTimeZone = validateTimeZone(timeZone);
    const current = zonedParts(instant, normalizedTimeZone);
    const matched = [];
    let winner = null;
    let winnerSettings = null;
    for (const candidate of rules) {
      const rule = validateScheduleRule(candidate);
      const sourceState = resolveScheduleSource(rule, sourceStates);
      if (!rule.enabled || !sourceState.active) continue;
      const window = scheduleWindow(rule, current);
      if (!window.matched) continue;
      if (rule.startDate && window.startDate < rule.startDate) continue;
      if (rule.endDate && window.startDate > rule.endDate) continue;
      if (!rule.everyDay && !rule.days.includes(window.weekday)) continue;
      matched.push(rule);
      if (!winner || rule.priority >= winner.priority) {
        winner = rule;
        winnerSettings = sourceState.settings;
      }
    }
    return deepFreeze({
      timeZone: normalizedTimeZone,
      matchedRuleIds: matched.map((rule) => rule.id),
      activeRule: winner,
      settings: winnerSettings
    });
  }

  function validateExternalSettingsResponse(value, { kind = 'api' } = {}) {
    if (kind === 'homeAssistant') {
      if (!isObject(value) || !['on', 'off'].includes(value.state)) throw new Error('The Home Assistant response must report on or off.');
      return deepFreeze({ schemaVersion: 1, active: value.state === 'on', settings: {} });
    }
    if (kind !== 'api') throw new Error('External settings response kind is unsupported.');
    exactKeys(value, ['schemaVersion', 'active', 'settings'], 'External settings response');
    if (value.schemaVersion !== 1) throw new Error('External settings response schema version is unsupported.');
    if (typeof value.active !== 'boolean') throw new Error('External settings response active state must be true or false.');
    return deepFreeze({ schemaVersion: 1, active: value.active, settings: validateScheduleSettings(value.settings, { partial: true }) });
  }

  function shouldShowStartupSurprise({
    draw,
    firstRun = false,
    errorPath = false,
    updatePath = false,
    midTask = false,
    schoolActive = false,
    alreadyShown = false,
    quietMode = false
  } = {}) {
    return Number.isFinite(draw)
      && draw >= 0
      && draw < 0.10
      && !firstRun
      && !errorPath
      && !updatePath
      && !midTask
      && !schoolActive
      && !alreadyShown
      && !quietMode;
  }

  function normalizeAttentionSettings(value) {
    const source = isObject(value) ? value : {};
    const candidateAction = typeof source.nextAction === 'string' ? source.nextAction.trim() : '';
    const nextAction = candidateAction.length <= 160 && !/[\u0000-\u001f\u007f]/.test(candidateAction) ? candidateAction : '';
    const snoozedUntil = Number.isSafeInteger(source.snoozedUntil) && source.snoozedUntil >= 0 ? source.snoozedUntil : 0;
    return Object.freeze({
      focus: source.focus === true,
      lowStim: source.lowStim === true,
      time: source.time === true,
      one: source.one === true,
      momentum: source.momentum === true,
      nextAction,
      snoozedUntil
    });
  }

  validateMessageRegistry(MESSAGE_REGISTRY);

  root.HairGrowthPresentationContract = Object.freeze({
    LANGUAGE_MODES,
    FUNNY_LEVELS,
    MESSAGE_CATEGORIES,
    MESSAGE_REGISTRY,
    SCHEDULE_SCHEMA_VERSION,
    ATTENTION_MODE_KEYS,
    ATTENTION_DEFAULTS,
    NARRATION_DEBOUNCE_MS,
    NARRATION_COOLDOWNS_MS,
    normalizeLanguageMode,
    normalizeFunnyLevel,
    extractPlaceholders,
    validateMessageRegistry,
    resolveMessage,
    normalizeSchoolRecord,
    getSchoolSuppression,
    normalizeNarratorSettings,
    shouldYieldNarration,
    buildNarrationTracks,
    evaluateNarrationAdmission,
    replaceQueuedNarration,
    isSafeExternalSettingsUrl,
    validateScheduleRule,
    evaluateScheduleRules,
    validateExternalSettingsResponse,
    shouldShowStartupSurprise,
    normalizeAttentionSettings
  });
})(globalThis);
