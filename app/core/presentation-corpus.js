'use strict';

const { INDEX_ROWS } = require('./presentation-index-rows');
const {
  ARTICLE_ROWS,
  ARTICLE_SCHOOL_SAFE_ROWS,
  COMMAND_SETTINGS_PALETTE_SOURCE_ROWS,
  NOTIFICATION_ERROR_SOURCE_ROWS,
  RENDERER_SOURCE_ROWS
} = require('./presentation-renderer-rows');

const SUPPORTED_LANGUAGES = Object.freeze(['en', 'yue', 'bilingual']);
const SUPPORTED_KINDS = Object.freeze([
  'text',
  'aria',
  'placeholder',
  'alt',
  'notification',
  'error',
  'template',
  'article-title',
  'article-body'
]);
const SUPPORTED_CATEGORIES = Object.freeze([
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
const MAX_SOURCE_LENGTH = 65536;
const MAX_TEMPLATE_VALUE_LENGTH = 2048;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const PLACEHOLDER_PATTERN = /\{([a-z][a-zA-Z0-9]*)\}/g;
const HAN_TEXT_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const GRAMMATICAL_PLACEHOLDERS = new Set(['plural', 'appliedPlural', 'errorPlural']);

const PRESENTATION_COMPOSITION = deepFreeze({
  languages: SUPPORTED_LANGUAGES,
  sourceExtremes: [1, 5],
  intermediatePolicy: 'nearest-extreme',
  primaryLanguage: 'en',
  secondaryLanguage: 'yue',
  textSeparator: '\n',
  articleSeparatorElement: 'hr',
  articleSeparatorAriaHidden: true,
  rendererOwnsArticleSeparator: true
});

/* Compact row shape:
 * [id, exact English source, serious Cantonese, kind, flags, playful English,
 *  playful Cantonese, category]
 * Flags: p preserves exact text, t marks a named-placeholder template.
 */
function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function placeholdersOf(value) {
  return [...value.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
}

function nearestExtreme(level) {
  return level <= 2 ? '1' : '5';
}

function normalizeKind(kind, template) {
  if (kind === 'article-title' || kind === 'article-body') return kind;
  if (kind === 'placeholder') return 'placeholder';
  if (kind === 'alt') return 'alt';
  if (kind === 'aria' || kind === 'aria-label' || kind === 'accessible-name' || kind === 'accessible-description') return 'aria';
  if (kind.includes('error')) return 'error';
  if (kind.includes('notification') || kind.includes('status')) return 'notification';
  if (template) return 'template';
  return 'text';
}

function normalizeCategory(category) {
  return SUPPORTED_CATEGORIES.includes(category) ? category : 'informational';
}

const PLAYFUL_ENGLISH_SUFFIX = Object.freeze({
  informational: 'The facts stay neat, even if the fringe does not.',
  success: 'Hair mission accomplished, comb dismissed.',
  progress: 'Still moving, and every follicle is clocked in.',
  warning: 'Check the facts before the fringe gets dramatic.',
  error: 'The facts remain clear, even though the comb missed this meeting.',
  destructive: 'Check the exact target before the clippers commit.',
  security: 'The boundary stays tighter than a fresh fade.',
  accessibility: 'Clear and reachable, with no interface obstacle course.',
  notification: 'Filed neatly beside the comb.'
});

const PLAYFUL_CANTONESE_SUFFIX = Object.freeze({
  informational: '資料照直講，頭髮唔使作故仔。',
  success: '搞掂，今次把梳可以準時收工。',
  progress: '仲處理緊，毛囊冇蛇王。',
  warning: '睇清楚事實先，瀏海唔使搶戲。',
  error: '事實照舊清楚，今次把梳開會開唔成。',
  destructive: '落剪之前再望清楚目標，唔好一刀變驚喜。',
  security: '邊界鎖實，連新剪嘅髮線都入唔到。',
  accessibility: '清楚易用，唔使行介面障礙賽。',
  notification: '已經整齊放好，唔會同髮夾失蹤。'
});

function playfulMessage(value, language, category, rawKind, preserve) {
  if (preserve || !/(?:notification|error|status|spoken)/.test(rawKind)) return value;
  const suffix = language === 'en' ? PLAYFUL_ENGLISH_SUFFIX[category] : PLAYFUL_CANTONESE_SUFFIX[category];
  return value + (/[.!?。！？…]$/u.test(value) ? ' ' : '. ') + suffix;
}

function normalizeOptions(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Presentation options must be an object.');
  }
  const language = options.language ?? 'en';
  if (!SUPPORTED_LANGUAGES.includes(language)) throw new RangeError('Unsupported language: ' + language);
  const funnyEnglish = options.funnyEnglish ?? 5;
  const funnyCantonese = options.funnyCantonese ?? 5;
  for (const [name, value] of [['funnyEnglish', funnyEnglish], ['funnyCantonese', funnyCantonese]]) {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new RangeError(name + ' must be an integer from 1 through 5.');
    }
  }
  return { language, funnyEnglish, funnyCantonese };
}

function normalizeRow(row, sourceSet, bucket = sourceSet) {
  let id;
  let source;
  let yue1;
  let rawKind;
  let category;
  let preserve;
  let template;
  let en5;
  let yue5;
  let surface = null;
  let sourceLine = null;
  let exact = [];
  let preservePolicy = 'none';
  if (Array.isArray(row)) {
    const flags = row[4] ?? '';
    [id, source, yue1, rawKind = 'text'] = row;
    surface = row[7] ?? null;
    category = normalizeCategory(row[7]);
    preserve = flags.includes('p');
    template = flags.includes('t') || placeholdersOf(source).length > 0;
    en5 = row[5] ?? source;
    yue5 = row[6] ?? yue1;
  } else {
    ({ id, sourceLine, kind: rawKind = 'text', exact = [], preserve: preservePolicy = 'none' } = row);
    source = row.en;
    yue1 = row.yue;
    category = normalizeCategory(row.category);
    template = Array.isArray(row.placeholders) && row.placeholders.length > 0;
    preserve = source === yue1 && preservePolicy !== 'none';
    en5 = row.en5 ?? playfulMessage(source, 'en', category, rawKind, preserve);
    yue5 = row.yue5 ?? playfulMessage(yue1, 'yue', category, rawKind, preserve);
  }
  const placeholders = template ? [...new Set(placeholdersOf(source))] : [];
  const optionalPlaceholders = placeholders.filter((name) => GRAMMATICAL_PLACEHOLDERS.has(name));
  const requiredPlaceholders = placeholders.filter((name) => !GRAMMATICAL_PLACEHOLDERS.has(name));
  const variants = preserve
    ? { en: { 1: source, 5: source }, yue: { 1: source, 5: source } }
    : { en: { 1: source, 5: en5 }, yue: { 1: yue1, 5: yue5 } };
  return {
    id,
    source,
    sourceSet,
    bucket,
    kind: normalizeKind(rawKind, template),
    category,
    surface,
    sourceLine,
    preservePolicy,
    exact,
    preserve,
    template,
    placeholders,
    optionalPlaceholders,
    requiredPlaceholders,
    variants
  };
}

function buildCorpus() {
  const entries = {};
  for (const [sourceSet, bucket, rows] of [
    ['index', 'index', INDEX_ROWS],
    ['renderer', 'command-settings-palette', COMMAND_SETTINGS_PALETTE_SOURCE_ROWS],
    ['renderer', 'notification-error', NOTIFICATION_ERROR_SOURCE_ROWS],
    ['renderer', 'other-renderer', RENDERER_SOURCE_ROWS]
  ]) {
    for (const row of rows) {
      const entry = normalizeRow(row, sourceSet, bucket);
      if (Object.hasOwn(entries, entry.id)) throw new Error('Duplicate presentation corpus id: ' + entry.id);
      entries[entry.id] = entry;
    }
  }
  for (const row of ARTICLE_ROWS) {
    const [articleId, titleSource, titleYue1, titleEn5, titleYue5, bodySourceHtml, bodyYue1Html, bodyEn5Html, bodyYue5Html] = row;
    for (const entry of [
      normalizeRow(['article.' + articleId + '.title', titleSource, titleYue1, 'article-title', '', titleEn5, titleYue5], 'article'),
      normalizeRow(['article.' + articleId + '.body', bodySourceHtml, bodyYue1Html, 'article-body', '', bodyEn5Html, bodyYue5Html], 'article')
    ]) {
      if (Object.hasOwn(entries, entry.id)) throw new Error('Duplicate presentation corpus id: ' + entry.id);
      entries[entry.id] = entry;
    }
  }
  return entries;
}

function buildArticles(corpus) {
  const schoolSafeById = new Map(ARTICLE_SCHOOL_SAFE_ROWS.map((row) => [row[0], row]));
  const articles = {};
  for (const row of ARTICLE_ROWS) {
    const id = row[0];
    const schoolRow = schoolSafeById.get(id);
    articles[id] = {
      id,
      titleId: 'article.' + id + '.title',
      bodyId: 'article.' + id + '.body',
      titleSource: corpus['article.' + id + '.title'].source,
      bodySourceHtml: corpus['article.' + id + '.body'].source,
      schoolSafe: schoolRow ? {
        en: { 1: schoolRow[1], 5: schoolRow[2] },
        yue: { 1: schoolRow[3], 5: schoolRow[4] }
      } : null
    };
  }
  return articles;
}

const PRESENTATION_CORPUS = deepFreeze(buildCorpus());
const PRESENTATION_ARTICLES = deepFreeze(buildArticles(PRESENTATION_CORPUS));
const PRESENTATION_INVENTORY_IDS = Object.freeze(Object.keys(PRESENTATION_CORPUS));
const SOURCE_TO_ID = new Map();
for (const id of PRESENTATION_INVENTORY_IDS) {
  const source = PRESENTATION_CORPUS[id].source;
  if (!SOURCE_TO_ID.has(source)) SOURCE_TO_ID.set(source, id);
}

function escapePatternLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeTemplateMatcher(entry) {
  let offset = 0;
  let pattern = '^';
  const names = [];
  for (const match of entry.source.matchAll(PLACEHOLDER_PATTERN)) {
    pattern += escapePatternLiteral(entry.source.slice(offset, match.index));
    pattern += '([\\s\\S]{1,' + MAX_TEMPLATE_VALUE_LENGTH + '}?)';
    names.push(match[1]);
    offset = match.index + match[0].length;
  }
  pattern += escapePatternLiteral(entry.source.slice(offset)) + '$';
  return {
    entry,
    names,
    literalLength: entry.source.replace(PLACEHOLDER_PATTERN, '').length,
    pattern: new RegExp(pattern, 'u')
  };
}

const TEMPLATE_MATCHERS = PRESENTATION_INVENTORY_IDS
  .map((id) => PRESENTATION_CORPUS[id])
  .filter((entry) => entry.template)
  .map(makeTemplateMatcher)
  .filter((matcher) => matcher.literalLength >= 6)
  .sort((left, right) => right.literalLength - left.literalLength || left.names.length - right.names.length || left.entry.id.localeCompare(right.entry.id));

function matchConstructedEnglishSource(source) {
  for (const matcher of TEMPLATE_MATCHERS) {
    const match = matcher.pattern.exec(source);
    if (!match) continue;
    const values = {};
    let valid = true;
    for (let index = 0; index < matcher.names.length; index += 1) {
      const name = matcher.names[index];
      const value = match[index + 1];
      if (Object.hasOwn(values, name) && values[name] !== value) {
        valid = false;
        break;
      }
      values[name] = value;
    }
    if (valid) return { id: matcher.entry.id, values };
  }
  return null;
}

function makeSummary(corpus, inventoryIds) {
  const entries = inventoryIds.map((id) => corpus[id]);
  const countKind = (kind) => entries.filter((entry) => entry.kind === kind).length;
  return deepFreeze({
    totalCount: inventoryIds.length,
    indexSourceCount: entries.filter((entry) => entry.sourceSet === 'index').length,
    rendererBoundaryCount: entries.filter((entry) => entry.sourceSet === 'renderer').length,
    rendererCounts: {
      commandSettingsPalette: entries.filter((entry) => entry.bucket === 'command-settings-palette').length,
      notificationError: entries.filter((entry) => entry.bucket === 'notification-error').length,
      other: entries.filter((entry) => entry.bucket === 'other-renderer').length
    },
    rendererInvocationCounts: {
      notify: 27,
      handleError: 44,
      total: 71
    },
    articleCount: Object.keys(PRESENTATION_ARTICLES).length,
    articleBoundaryCount: entries.filter((entry) => entry.sourceSet === 'article').length,
    templateCount: entries.filter((entry) => entry.template).length,
    preservedCount: entries.filter((entry) => entry.preserve).length,
    exactSourceCount: new Set(entries.map((entry) => entry.source)).size,
    countsByKind: Object.fromEntries(SUPPORTED_KINDS.map((kind) => [kind, countKind(kind)]))
  });
}

const PRESENTATION_INVENTORY_SUMMARY = makeSummary(PRESENTATION_CORPUS, PRESENTATION_INVENTORY_IDS);

function assertBoundedSource(source) {
  if (typeof source !== 'string') throw new TypeError('English source must be a string.');
  if (source.length > MAX_SOURCE_LENGTH) throw new RangeError('English source must contain at most 65536 characters.');
}

function validateEntry(entry, id) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('Invalid presentation corpus entry: ' + id);
  if (entry.id !== id || !ID_PATTERN.test(id)) throw new Error('Invalid presentation corpus id: ' + id);
  assertBoundedSource(entry.source);
  if (!SUPPORTED_KINDS.includes(entry.kind)) throw new Error('Unsupported presentation kind: ' + id);
  if (!SUPPORTED_CATEGORIES.includes(entry.category)) throw new Error('Unsupported presentation category: ' + id);
  for (const language of ['en', 'yue']) {
    for (const level of ['1', '5']) {
      const value = entry.variants?.[language]?.[level];
      if (typeof value !== 'string' || value.length === 0) throw new Error('Missing ' + language + ' level ' + level + ' variant: ' + id);
      if (value.length > MAX_SOURCE_LENGTH) throw new Error('Oversized presentation variant: ' + id);
    }
  }
  const expectedPlaceholders = [...new Set(placeholdersOf(entry.source))].sort();
  const requiredPlaceholders = expectedPlaceholders.filter((name) => !GRAMMATICAL_PLACEHOLDERS.has(name));
  if (entry.template !== (expectedPlaceholders.length > 0)) throw new Error('Template marker mismatch: ' + id);
  if (JSON.stringify([...entry.placeholders].sort()) !== JSON.stringify(expectedPlaceholders)) throw new Error('Placeholder inventory mismatch: ' + id);
  for (const language of ['en', 'yue']) {
    for (const level of ['1', '5']) {
      const actual = [...new Set(placeholdersOf(entry.variants[language][level]))].sort();
      if (actual.some((name) => !expectedPlaceholders.includes(name)) || requiredPlaceholders.some((name) => !actual.includes(name))) {
        throw new Error('Placeholder parity mismatch: ' + id);
      }
    }
  }
  if (entry.preserve) {
    for (const language of ['en', 'yue']) {
      for (const level of ['1', '5']) {
        if (entry.variants[language][level] !== entry.source) throw new Error('Exact-preserve variant changed: ' + id);
      }
    }
  } else {
    for (const level of ['1', '5']) {
      const english = entry.variants.en[level];
      const cantonese = entry.variants.yue[level];
      if (cantonese === english || !HAN_TEXT_PATTERN.test(cantonese)) {
        throw new Error('Cantonese variant must contain distinct Han text: ' + id + ' level ' + level);
      }
    }
  }
}

function validatePresentationCorpus(corpus = PRESENTATION_CORPUS, inventoryIds = PRESENTATION_INVENTORY_IDS) {
  if (!corpus || typeof corpus !== 'object' || Array.isArray(corpus)) throw new TypeError('Presentation corpus must be an object.');
  if (!Array.isArray(inventoryIds)) throw new TypeError('Presentation inventory IDs must be an array.');
  const seen = new Set();
  for (const id of inventoryIds) {
    if (typeof id !== 'string' || seen.has(id)) throw new Error('Invalid or duplicate presentation inventory id: ' + id);
    seen.add(id);
    if (!Object.hasOwn(corpus, id)) throw new Error('Missing presentation corpus entry: ' + id);
    validateEntry(corpus[id], id);
  }
  for (const id of Object.keys(corpus)) {
    if (!seen.has(id)) throw new Error('Uninventoried presentation corpus entry: ' + id);
  }
  const summary = makeSummary(corpus, inventoryIds);
  if (corpus === PRESENTATION_CORPUS && inventoryIds === PRESENTATION_INVENTORY_IDS) return PRESENTATION_INVENTORY_SUMMARY;
  if (summary.totalCount !== PRESENTATION_INVENTORY_SUMMARY.totalCount) throw new Error('Presentation inventory count changed.');
  return PRESENTATION_INVENTORY_SUMMARY;
}

function normalizeTemplateValues(entry, values) {
  const supplied = values ?? {};
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new TypeError('Template values must be an object.');
  const expected = new Set(entry.placeholders);
  for (const name of entry.placeholders) {
    if (!Object.hasOwn(supplied, name)) throw new Error('Missing template value: ' + name);
  }
  for (const name of Object.keys(supplied)) {
    if (!expected.has(name)) throw new Error('Unexpected template value: ' + name);
  }
  const normalized = {};
  for (const [name, value] of Object.entries(supplied)) {
    if (!['string', 'number', 'boolean'].includes(typeof value) || !Number.isFinite(typeof value === 'number' ? value : 0)) {
      throw new TypeError('Template value must be a bounded scalar: ' + name);
    }
    const text = String(value);
    if (text.length > MAX_TEMPLATE_VALUE_LENGTH || /[<>\u0000-\u001f\u007f]/u.test(text)) {
      throw new TypeError('Template value must be a bounded scalar: ' + name);
    }
    normalized[name] = text;
  }
  return normalized;
}

function fillTemplate(value, values) {
  return value.replace(PLACEHOLDER_PATTERN, (_match, name) => values[name]);
}

function resolveEntry(entry, options, values) {
  const normalized = normalizeOptions(options);
  const templateValues = normalizeTemplateValues(entry, entry.template ? values : {});
  const en = fillTemplate(entry.variants.en[nearestExtreme(normalized.funnyEnglish)], templateValues);
  const yue = fillTemplate(entry.variants.yue[nearestExtreme(normalized.funnyCantonese)], templateValues);
  let primary;
  let secondary = null;
  let segments;
  if (normalized.language === 'yue') {
    primary = yue;
    segments = [{ language: 'yue', text: yue }];
  } else if (normalized.language === 'bilingual') {
    primary = en;
    secondary = yue;
    segments = [{ language: 'en', text: en }, { language: 'yue', text: yue }];
  } else {
    primary = en;
    segments = [{ language: 'en', text: en }];
  }
  return deepFreeze({
    id: entry.id,
    kind: entry.kind,
    category: entry.category,
    language: normalized.language,
    funnyEnglish: normalized.funnyEnglish,
    funnyCantonese: normalized.funnyCantonese,
    primary,
    secondary,
    text: secondary === null ? primary : primary + PRESENTATION_COMPOSITION.textSeparator + secondary,
    segments,
    preserve: entry.preserve,
    fallback: false,
    source: entry.source
  });
}

function resolvePresentationById(id, options = {}, values = undefined) {
  if (typeof id !== 'string' || !Object.hasOwn(PRESENTATION_CORPUS, id)) throw new Error('Unknown presentation corpus id: ' + id);
  return resolveEntry(PRESENTATION_CORPUS[id], options, values);
}

function resolvePresentationByEnglishSource(source, options = {}, values = undefined) {
  assertBoundedSource(source);
  const id = SOURCE_TO_ID.get(source);
  if (id) return resolvePresentationById(id, options, values);
  const constructed = matchConstructedEnglishSource(source);
  if (constructed) return resolvePresentationById(constructed.id, options, constructed.values);
  const normalized = normalizeOptions(options);
  return deepFreeze({
    id: null,
    kind: 'text',
    category: 'informational',
    language: normalized.language,
    funnyEnglish: normalized.funnyEnglish,
    funnyCantonese: normalized.funnyCantonese,
    primary: source,
    secondary: null,
    text: source,
    segments: [{ language: 'en', text: source }],
    preserve: true,
    fallback: true,
    source
  });
}

function resolveArticleSegment(article, language, level, schoolMode) {
  const title = PRESENTATION_CORPUS[article.titleId].variants[language][nearestExtreme(level)];
  const bodyHtml = schoolMode && article.schoolSafe
    ? article.schoolSafe[language][nearestExtreme(level)]
    : PRESENTATION_CORPUS[article.bodyId].variants[language][nearestExtreme(level)];
  return { language, title, bodyHtml };
}

function resolvePresentationArticle(id, options = {}, context = {}) {
  if (typeof id !== 'string' || !Object.hasOwn(PRESENTATION_ARTICLES, id)) throw new Error('Unknown presentation article id: ' + id);
  const normalized = normalizeOptions(options);
  const article = PRESENTATION_ARTICLES[id];
  const schoolMode = context?.schoolMode === true;
  const en = resolveArticleSegment(article, 'en', normalized.funnyEnglish, schoolMode);
  const yue = resolveArticleSegment(article, 'yue', normalized.funnyCantonese, schoolMode);
  let primary;
  let secondary = null;
  if (normalized.language === 'yue') primary = yue;
  else if (normalized.language === 'bilingual') { primary = en; secondary = yue; }
  else primary = en;
  return deepFreeze({
    id,
    language: normalized.language,
    primary,
    secondary,
    composition: PRESENTATION_COMPOSITION,
    schoolSafe: schoolMode && Boolean(article.schoolSafe)
  });
}

module.exports = {
  PRESENTATION_ARTICLES,
  PRESENTATION_COMPOSITION,
  PRESENTATION_CORPUS,
  PRESENTATION_INVENTORY_IDS,
  PRESENTATION_INVENTORY_SUMMARY,
  resolvePresentationArticle,
  resolvePresentationByEnglishSource,
  resolvePresentationById,
  validatePresentationCorpus
};
