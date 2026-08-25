'use strict';

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
const MAX_LITERAL_CHARACTERS = 1000;
const MAX_LITERAL_CATALOG_ENTRIES = 128;
const MAX_FACT_CHARACTERS = 4096;

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

const LANGUAGE_MODES = Object.freeze(['en', 'yue', 'bilingual']);
const FUNNY_LEVELS = Object.freeze([1, 2, 3, 4, 5]);
const MESSAGE_CATEGORIES = Object.freeze([
  'informational',
  'success',
  'progress',
  'warning',
  'error',
  'destructive',
  'security',
  'accessibility',
  'notification'
]);

const LANGUAGE_METADATA = deepFreeze({
  en: { id: 'en', label: 'English', primaryLanguage: 'en', secondaryLanguage: null },
  yue: { id: 'yue', label: 'Playful Hong Kong-style Cantonese', primaryLanguage: 'yue', secondaryLanguage: null },
  bilingual: { id: 'bilingual', label: 'Bilingual', primaryLanguage: 'en', secondaryLanguage: 'yue' }
});

const CATEGORY_METADATA = deepFreeze({
  informational: { id: 'informational', delivery: 'nonblocking', persistence: 'timed' },
  success: { id: 'success', delivery: 'nonblocking', persistence: 'timed' },
  progress: { id: 'progress', delivery: 'nonblocking', persistence: 'while-active' },
  warning: { id: 'warning', delivery: 'nonblocking', persistence: 'until-dismissed' },
  error: { id: 'error', delivery: 'nonblocking', persistence: 'until-dismissed' },
  destructive: { id: 'destructive', delivery: 'decision', persistence: 'until-resolved' },
  security: { id: 'security', delivery: 'nonblocking', persistence: 'until-dismissed' },
  accessibility: { id: 'accessibility', delivery: 'assistive', persistence: 'event-scoped' },
  notification: { id: 'notification', delivery: 'nonblocking', persistence: 'history-backed' }
});

const LEVEL_METADATA = deepFreeze({
  1: { level: 1, tone: 'fully serious' },
  2: { level: 2, tone: 'lightly warm' },
  3: { level: 3, tone: 'gently playful' },
  4: { level: 4, tone: 'very playful' },
  5: { level: 5, tone: 'maximum playfulness' }
});

const VOICE_FRAMES = deepFreeze({
  informational: {
    en: ['{message}', 'Update: {message}', 'Quick heads-up: {message}', 'Small plot twist: {message}', 'Tiny status trumpet reporting: {message}'],
    yue: ['{message}', '更新：{message}', '提提你：{message}', '小小劇情轉折：{message}', '迷你鑼鼓隊報告：{message}']
  },
  success: {
    en: ['{message}', 'Done: {message}', 'Good news: {message}', 'Small victory bell: {message}', 'Tiny confetti cannon approved: {message}'],
    yue: ['{message}', '完成：{message}', '好消息：{message}', '小勝利鐘仔響咗：{message}', '迷你紙碎炮批准放炮：{message}']
  },
  progress: {
    en: ['{message}', 'In progress: {message}', 'Steady progress: {message}', 'The tiny progress train is moving: {message}', 'The tiny progress train packed snacks and is moving: {message}'],
    yue: ['{message}', '進行中：{message}', '穩陣前進中：{message}', '迷你進度列車開緊：{message}', '迷你進度列車帶齊零食開緊：{message}']
  },
  warning: {
    en: ['Warning: {message}', 'Please review: {message}', 'Careful now: {message}', 'Yellow flag waving politely: {message}', 'Tiny warning cone on duty: {message}'],
    yue: ['警告：{message}', '請檢查：{message}', '要留神喇：{message}', '黃色小旗好有禮貌咁揮緊：{message}', '迷你警告雪糕筒返緊工：{message}']
  },
  error: {
    en: ['Error: {message}', 'Something went wrong: {message}', 'That did not work: {message}', 'The plan tripped over its own shoelace: {message}', 'Tiny error gremlin report: {message}'],
    yue: ['錯誤：{message}', '出咗問題：{message}', '今次未做到：{message}', '個流程俾自己鞋帶絆親：{message}', '迷你錯誤精靈報告：{message}']
  },
  destructive: {
    en: ['Destructive action: {message}', 'Please confirm this destructive action: {message}', 'Careful now: {message}', 'Big red button moment: {message}', 'The tiny demolition crew is waiting for confirmation: {message}'],
    yue: ['破壞性操作：{message}', '請確認呢個破壞性操作：{message}', '要留神喇：{message}', '紅色大掣時刻：{message}', '迷你拆卸隊等緊確認：{message}']
  },
  security: {
    en: ['Security notice: {message}', 'Security update: {message}', 'Security check says: {message}', 'The security spotlight found this: {message}', 'Tiny security sentry reporting: {message}'],
    yue: ['安全提示：{message}', '安全更新：{message}', '安全檢查話：{message}', '安全探射燈搵到呢樣：{message}', '迷你安全哨兵報告：{message}']
  },
  accessibility: {
    en: ['{message}', 'Accessibility update: {message}', 'Access cue: {message}', 'Friendly access spotlight: {message}', 'Tiny accessibility lighthouse reporting: {message}'],
    yue: ['{message}', '無障礙更新：{message}', '無障礙提示：{message}', '友善無障礙探射燈：{message}', '迷你無障礙燈塔報告：{message}']
  },
  notification: {
    en: ['{message}', 'Notification: {message}', 'Quick notification: {message}', 'The notice board has news: {message}', 'Tiny notification bell reporting: {message}'],
    yue: ['{message}', '通知：{message}', '快訊：{message}', '告示板有新消息：{message}', '迷你通知鐘報告：{message}']
  }
});

const MESSAGE_SPECS = [
  {
    key: 'informational.estimate',
    category: 'informational',
    en: 'Estimated hair length is {length} on {date}.',
    yue: '{date} 嘅頭髮長度估計係 {length}。'
  },
  {
    key: 'success.haircutSaved',
    category: 'success',
    en: 'Haircut record for {date} was saved.',
    yue: '{date} 嘅剪髮紀錄已經儲存好。'
  },
  {
    key: 'progress.calculation',
    category: 'progress',
    en: 'Hair growth calculation is {percent}% complete.',
    yue: '頭髮生長計算完成咗 {percent}%。'
  },
  {
    key: 'warning.growthRate',
    category: 'warning',
    en: 'The estimate uses a growth rate of {rate} per month.',
    yue: '呢個估算使用每月 {rate} 嘅生長速度。'
  },
  {
    key: 'error.operationFailed',
    category: 'error',
    en: '{operation} failed: {reason}',
    yue: '{operation} 失敗：{reason}'
  },
  {
    key: 'destructive.deleteHaircuts',
    category: 'destructive',
    en: 'Deleting {count} haircut records cannot be undone.',
    yue: '刪除 {count} 個剪髮紀錄之後無法還原。'
  },
  {
    key: 'security.connectionRejected',
    category: 'security',
    en: 'Connection to {destination} was rejected: {reason}',
    yue: '去 {destination} 嘅連線被拒絕：{reason}'
  },
  {
    key: 'accessibility.announcement',
    category: 'accessibility',
    en: 'Screen reader announcement: {message}',
    yue: '螢幕閱讀器通知：{message}'
  },
  {
    key: 'notification.message',
    category: 'notification',
    en: '{title}: {message} (count {count}, enabled {enabled}).',
    yue: '{title}：{message}（數量 {count}，啟用狀態 {enabled}）。'
  }
];

const LITERAL_SPECS = [
  ['A private, local-first growth journal', 'informational', '私人、本機優先嘅生長日記'],
  ['Saved', 'success', '已儲存。'],
  ['Haircut saved and baseline reset.', 'success', '剪髮紀錄已儲存，基準亦已重設。'],
  ['Estimate', 'informational', '估算'],
  ['No haircuts match this view yet.', 'informational', '暫時未有剪髮紀錄符合呢個檢視。'],
  ['No private file is loaded. Original shipped wording is active.', 'informational', '未載入私人檔案，而家使用原裝字句。'],
  ['Validating the selected private file locally.', 'progress', '正喺本機驗證揀選嘅私人檔案。'],
  ['Loaded locally. Approved wording is active.', 'success', '已經喺本機載入，核准字句而家生效。'],
  ['The selected or cached file is invalid. Original shipped wording is active.', 'error', '揀選或快取嘅檔案無效，而家使用原裝字句。'],
  ['Choose private JSON', 'informational', '揀選私人 JSON'],
  ['Replace private JSON', 'informational', '更換私人 JSON'],
  ['Clear local cache', 'destructive', '清除本機快取'],
  ['Ready', 'success', '準備好。'],
  ['Haircut saved', 'success', '剪髮紀錄已儲存。'],
  ['Haircuts deleted', 'success', '剪髮紀錄已刪除。'],
  ['Nothing selected', 'warning', '未有揀選任何項目。'],
  ['Export ready', 'success', '匯出已準備好。'],
  ['Export failed', 'error', '匯出失敗。'],
  ['Conversion completed', 'success', '轉換已完成。'],
  ['Conversion failed', 'error', '轉換失敗。'],
  ['Service connected', 'success', '服務已連線。'],
  ['Service connection failed', 'error', '服務連線失敗。'],
  ['Service sync sent', 'success', '服務同步資料已送出。'],
  ['Service sync failed', 'error', '服務同步失敗。'],
  ['Service data fetched', 'success', '服務資料已擷取。'],
  ['Service fetch failed', 'error', '服務資料擷取失敗。'],
  ['Element locked', 'notification', '元素已鎖定。'],
  ['Lock removed', 'success', '鎖定已移除。'],
  ['Element unlocked', 'success', '元素已解鎖。'],
  ['Destructive action cancelled', 'informational', '破壞性操作已取消。'],
  ['Destructive action completed', 'success', '破壞性操作已完成。'],
  ['Destructive action failed', 'error', '破壞性操作失敗。'],
  ['Local history degraded', 'warning', '本機歷史功能已降級。'],
  ['Profile is invalid', 'error', '個人設定無效。'],
  ['Haircut is invalid', 'error', '剪髮紀錄無效。'],
  ['Custom logo applied', 'success', '自訂標誌已套用。'],
  ['Custom logo rejected', 'error', '自訂標誌被拒絕。'],
  ['Authenticator entry added', 'success', '驗證器項目已新增。'],
  ['Authenticator entry deleted', 'success', '驗證器項目已刪除。'],
  ['Authenticator entry is invalid', 'error', '驗證器項目無效。']
];

function insertMessage(frame, message) {
  const first = frame.indexOf('{message}');
  const last = frame.lastIndexOf('{message}');
  if (first < 0 || first !== last) throw new Error('Each voice frame must contain exactly one message slot.');
  return `${frame.slice(0, first)}${message}${frame.slice(first + '{message}'.length)}`;
}

function listPlaceholders(template) {
  const names = [];
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) names.push(match[1]);
  return names.sort();
}

function assertSamePlaceholders(key, variants) {
  const expected = listPlaceholders(variants[0]);
  for (const variant of variants.slice(1)) {
    const actual = listPlaceholders(variant);
    if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
      throw new Error(`Presentation entry ${key} changed its factual placeholder set.`);
    }
  }
  return expected;
}

function buildDefinition(key, category, english, cantonese) {
  if (!MESSAGE_CATEGORIES.includes(category)) throw new Error(`Unsupported presentation category: ${category}`);
  const frames = VOICE_FRAMES[category];
  const en = frames.en.map((frame) => insertMessage(frame, english));
  const yue = frames.yue.map((frame) => insertMessage(frame, cantonese));
  const placeholders = assertSamePlaceholders(key, [...en, ...yue]);
  return deepFreeze({ key, category, en, yue, placeholders });
}

function buildCatalog() {
  const result = Object.create(null);
  for (const spec of MESSAGE_SPECS) {
    if (Object.prototype.hasOwnProperty.call(result, spec.key)) throw new Error(`Duplicate presentation key: ${spec.key}`);
    result[spec.key] = buildDefinition(spec.key, spec.category, spec.en, spec.yue);
  }
  return deepFreeze(result);
}

function buildLiteralCatalog() {
  if (LITERAL_SPECS.length > MAX_LITERAL_CATALOG_ENTRIES) {
    throw new Error(`Presentation literal catalog exceeds ${MAX_LITERAL_CATALOG_ENTRIES} entries.`);
  }
  const result = Object.create(null);
  for (const [english, category, cantonese] of LITERAL_SPECS) {
    if (Object.prototype.hasOwnProperty.call(result, english)) throw new Error(`Duplicate presentation literal: ${english}`);
    result[english] = buildDefinition(null, category, english, cantonese);
  }
  return deepFreeze(result);
}

const CATALOG = buildCatalog();
const LITERAL_CATALOG = buildLiteralCatalog();

const CATALOG_METADATA = deepFreeze({
  schemaVersion: 1,
  categoryCount: MESSAGE_CATEGORIES.length,
  levelCount: FUNNY_LEVELS.length,
  messageCount: Object.keys(CATALOG).length,
  literalCount: Object.keys(LITERAL_CATALOG).length,
  literalMaxCharacters: MAX_LITERAL_CHARACTERS,
  literalCatalogMaxEntries: MAX_LITERAL_CATALOG_ENTRIES,
  factMaxCharacters: MAX_FACT_CHARACTERS,
  messageKeys: Object.keys(CATALOG),
  registeredLiterals: Object.keys(LITERAL_CATALOG)
});

function assertRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object.`);
  return value;
}

function readDataProperty(record, key, fallback) {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return fallback;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    throw new TypeError(`${key} must be a data property.`);
  }
  return descriptor.value;
}

function normalizeOptions(options) {
  const value = options === undefined ? {} : assertRecord(options, 'Presentation options');
  const language = readDataProperty(value, 'language', 'en');
  const funnyEnglish = readDataProperty(value, 'funnyEnglish', 5);
  const funnyCantonese = readDataProperty(value, 'funnyCantonese', 5);
  if (!LANGUAGE_MODES.includes(language)) throw new RangeError(`Unsupported language mode: ${String(language)}`);
  if (!Number.isInteger(funnyEnglish) || !FUNNY_LEVELS.includes(funnyEnglish)) {
    throw new RangeError('English funny level must be an integer between 1 and 5.');
  }
  if (!Number.isInteger(funnyCantonese) || !FUNNY_LEVELS.includes(funnyCantonese)) {
    throw new RangeError('Cantonese funny level must be an integer between 1 and 5.');
  }
  return { optionsRecord: value, language, funnyEnglish, funnyCantonese };
}

function exceedsCharacterLimit(value, limit) {
  let count = 0;
  for (const _character of value) {
    count += 1;
    if (count > limit) return true;
  }
  return false;
}

function factToText(name, value) {
  let text;
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'bigint') {
    text = String(value);
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Fact ${name} must be finite.`);
    text = Object.is(value, -0) ? '-0' : String(value);
  } else {
    throw new TypeError(`Fact ${name} must be a scalar string, finite number, bigint, or boolean.`);
  }
  if (exceedsCharacterLimit(text, MAX_FACT_CHARACTERS)) {
    throw new RangeError(`Fact ${name} must be at most ${MAX_FACT_CHARACTERS} characters.`);
  }
  return text;
}

function normalizeFacts(definition, factsValue) {
  const facts = factsValue === undefined ? Object.create(null) : assertRecord(factsValue, 'Presentation facts');
  const suppliedKeys = Reflect.ownKeys(facts);
  for (const key of suppliedKeys) {
    if (typeof key !== 'string' || !definition.placeholders.includes(key)) throw new TypeError(`Unexpected fact: ${String(key)}`);
    const descriptor = Object.getOwnPropertyDescriptor(facts, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(`Fact ${key} must be a data property.`);
    }
  }
  const normalized = Object.create(null);
  for (const name of definition.placeholders) {
    if (!Object.prototype.hasOwnProperty.call(facts, name)) throw new TypeError(`Missing fact: ${name}`);
    normalized[name] = factToText(name, Object.getOwnPropertyDescriptor(facts, name).value);
  }
  return normalized;
}

function interpolate(template, facts) {
  return template.replace(PLACEHOLDER_PATTERN, (_placeholder, name) => facts[name]);
}

function makeResult({
  key,
  category,
  source,
  language,
  funnyEnglish,
  funnyCantonese,
  primaryLanguage,
  primary,
  secondaryLanguage = null,
  secondary = null,
  fallback = false,
  fallbackReason = null
}) {
  const segments = [{ language: primaryLanguage, text: primary }];
  if (secondary !== null) segments.push({ language: secondaryLanguage, text: secondary });
  return deepFreeze({
    key,
    category,
    source,
    language,
    requestedLanguage: language,
    funnyEnglish,
    funnyCantonese,
    primaryLanguage,
    secondaryLanguage,
    primary,
    secondary,
    text: secondary === null ? primary : `${primary}\n${secondary}`,
    segments,
    fallback,
    fallbackReason
  });
}

function renderDefinition(definition, options, source, key) {
  const normalized = normalizeOptions(options);
  const factsValue = readDataProperty(normalized.optionsRecord, 'facts', undefined);
  const facts = normalizeFacts(definition, factsValue);
  const english = interpolate(definition.en[normalized.funnyEnglish - 1], facts);
  const cantonese = interpolate(definition.yue[normalized.funnyCantonese - 1], facts);
  const renderOptions = {
    language: normalized.language,
    funnyEnglish: normalized.funnyEnglish,
    funnyCantonese: normalized.funnyCantonese
  };

  if (normalized.language === 'yue') {
    return makeResult({
      key,
      category: definition.category,
      source,
      ...renderOptions,
      primaryLanguage: 'yue',
      primary: cantonese
    });
  }
  if (normalized.language === 'bilingual') {
    return makeResult({
      key,
      category: definition.category,
      source,
      ...renderOptions,
      primaryLanguage: 'en',
      primary: english,
      secondaryLanguage: 'yue',
      secondary: cantonese
    });
  }
  return makeResult({
    key,
    category: definition.category,
    source,
    ...renderOptions,
    primaryLanguage: 'en',
    primary: english
  });
}

function renderMessage(key, options) {
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(CATALOG, key)) {
    throw new RangeError(`Unknown presentation message key: ${String(key)}`);
  }
  return renderDefinition(CATALOG[key], options, 'message-catalog', key);
}

function renderLiteral(english, options) {
  if (typeof english !== 'string') throw new TypeError('English literal must be a string.');
  if (!english.trim()) throw new TypeError('English literal must not be empty.');
  if (exceedsCharacterLimit(english, MAX_LITERAL_CHARACTERS)) {
    throw new RangeError(`English literal must be at most ${MAX_LITERAL_CHARACTERS} characters.`);
  }
  if (Object.prototype.hasOwnProperty.call(LITERAL_CATALOG, english)) {
    return renderDefinition(LITERAL_CATALOG[english], options, 'literal-catalog', null);
  }

  const normalized = normalizeOptions(options);
  return makeResult({
    key: null,
    category: null,
    source: 'literal-fallback',
    language: normalized.language,
    funnyEnglish: normalized.funnyEnglish,
    funnyCantonese: normalized.funnyCantonese,
    primaryLanguage: 'en',
    primary: english,
    fallback: true,
    fallbackReason: 'No registered Cantonese copy exists for this literal, so the original English text was preserved.'
  });
}

function renderCategoryMessage(category, message, options) {
  if (typeof category !== 'string' || !MESSAGE_CATEGORIES.includes(category)) {
    throw new RangeError(`Unsupported presentation category: ${String(category)}`);
  }
  if (typeof message === 'string' && !message.trim()) throw new TypeError('Category message must not be empty.');
  const messageText = factToText('message', message);
  const normalized = normalizeOptions(options);
  const facts = { message: messageText };
  const english = interpolate(VOICE_FRAMES[category].en[normalized.funnyEnglish - 1], facts);
  const cantonese = interpolate(VOICE_FRAMES[category].yue[normalized.funnyCantonese - 1], facts);
  const resultBase = {
    key: null,
    category,
    source: 'category-message',
    language: normalized.language,
    funnyEnglish: normalized.funnyEnglish,
    funnyCantonese: normalized.funnyCantonese
  };

  if (normalized.language === 'yue') {
    return makeResult({ ...resultBase, primaryLanguage: 'yue', primary: cantonese });
  }
  if (normalized.language === 'bilingual') {
    return makeResult({
      ...resultBase,
      primaryLanguage: 'en',
      primary: english,
      secondaryLanguage: 'yue',
      secondary: cantonese
    });
  }
  return makeResult({ ...resultBase, primaryLanguage: 'en', primary: english });
}

module.exports = Object.freeze({
  renderMessage,
  renderLiteral,
  renderCategoryMessage,
  LANGUAGE_MODES,
  FUNNY_LEVELS,
  MESSAGE_CATEGORIES,
  LANGUAGE_METADATA,
  CATEGORY_METADATA,
  LEVEL_METADATA,
  CATALOG_METADATA,
  CATALOG,
  LITERAL_CATALOG
});
