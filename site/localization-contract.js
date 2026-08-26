(function installHairGrowthLocalizationContract(root) {
  'use strict';

  const LANGUAGE_MODES = Object.freeze(['en', 'yue', 'both']);
  const MAX_CATALOGS = 16;
  const MAX_ENTRIES = 4096;
  const MAX_TEXT_LENGTH = 12000;
  const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,159}$/;
  const PLACEHOLDER = /\{([a-z][a-zA-Z0-9]*)\}/g;

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function exactFields(value, fields, label) {
    if (!isObject(value)) throw new Error(`${label} must be an object.`);
    const keys = Object.keys(value).sort();
    const expected = [...fields].sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or unexpected fields.`);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }

  function placeholders(value) {
    if (typeof value !== 'string') throw new Error('Localized copy must be text.');
    const names = [];
    const seen = new Set();
    for (const match of value.matchAll(PLACEHOLDER)) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        names.push(match[1]);
      }
    }
    return names.sort();
  }

  function validateEntry(value, label) {
    exactFields(value, ['id', 'en', 'yue'], label);
    if (typeof value.id !== 'string' || !SAFE_ID.test(value.id)) throw new Error(`${label} identifier is invalid.`);
    for (const key of ['en', 'yue']) {
      if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > MAX_TEXT_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value[key])) throw new Error(`${label} ${key} text is invalid.`);
    }
    const englishPlaceholders = placeholders(value.en);
    const cantonesePlaceholders = placeholders(value.yue);
    if (englishPlaceholders.length !== cantonesePlaceholders.length || englishPlaceholders.some((name, index) => name !== cantonesePlaceholders[index])) throw new Error(`${label} changes factual placeholders between locales.`);
    if (/\}\s*\{/.test(value.en)) throw new Error(`${label} cannot place factual placeholders next to one another.`);
    return { id: value.id, en: value.en.trim(), yue: value.yue.trim() };
  }

  function validateLocaleCatalog(value) {
    exactFields(value, ['schemaVersion', 'locale', 'scope', 'entries'], 'Locale catalog');
    if (value.schemaVersion !== 1) throw new Error('Locale catalog schemaVersion must be 1.');
    if (value.locale !== 'yue-HK') throw new Error('Locale catalog must target yue-HK.');
    if (typeof value.scope !== 'string' || !SAFE_ID.test(value.scope)) throw new Error('Locale catalog scope is invalid.');
    if (!Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES) throw new Error(`Locale catalog allows at most ${MAX_ENTRIES} entries.`);
    const ids = new Set();
    const sources = new Map();
    const entries = value.entries.map((entry, index) => {
      const normalized = validateEntry(entry, `Locale catalog entry ${index}`);
      if (ids.has(normalized.id)) throw new Error(`Locale catalog repeats identifier ${normalized.id}.`);
      ids.add(normalized.id);
      if (sources.has(normalized.en) && sources.get(normalized.en) !== normalized.yue) throw new Error(`Locale catalog gives conflicting translations for ${normalized.en}.`);
      sources.set(normalized.en, normalized.yue);
      return normalized;
    });
    return deepFreeze({ schemaVersion: 1, locale: 'yue-HK', scope: value.scope, entries });
  }

  function mergeLocaleCatalogs(values) {
    if (!Array.isArray(values) || values.length < 1 || values.length > MAX_CATALOGS) throw new Error(`Localization needs 1 to ${MAX_CATALOGS} source catalogs.`);
    const ids = new Set();
    const sources = new Map();
    const entries = [];
    for (const candidate of values) {
      const catalog = validateLocaleCatalog(candidate);
      for (const entry of catalog.entries) {
        if (ids.has(entry.id)) throw new Error(`Merged locale catalog repeats identifier ${entry.id}.`);
        ids.add(entry.id);
        const existing = sources.get(entry.en);
        if (existing && existing.yue !== entry.yue) throw new Error(`Merged locale catalog gives conflicting translations for ${entry.en}.`);
        if (existing) continue;
        const copy = { id: entry.id, en: entry.en, yue: entry.yue };
        sources.set(entry.en, copy);
        entries.push(copy);
      }
    }
    if (entries.length > MAX_ENTRIES) throw new Error(`Merged locale catalog allows at most ${MAX_ENTRIES} entries.`);
    entries.sort((left, right) => {
      const leftLiteral = left.en.replace(PLACEHOLDER, '').length;
      const rightLiteral = right.en.replace(PLACEHOLDER, '').length;
      return rightLiteral - leftLiteral || left.id.localeCompare(right.id);
    });
    return deepFreeze({ schemaVersion: 1, locale: 'yue-HK', scope: 'merged', entries });
  }

  function templateParts(template) {
    const parts = [];
    let cursor = 0;
    for (const match of template.matchAll(PLACEHOLDER)) {
      parts.push({ literal: template.slice(cursor, match.index), name: match[1] });
      cursor = match.index + match[0].length;
    }
    return { parts, tail: template.slice(cursor) };
  }

  function matchTemplate(value, template) {
    const { parts, tail } = templateParts(template);
    if (!parts.length) return value === template ? {} : null;
    const facts = Object.create(null);
    let cursor = 0;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!value.startsWith(part.literal, cursor)) return null;
      cursor += part.literal.length;
      const nextLiteral = index + 1 < parts.length ? parts[index + 1].literal : tail;
      let end = value.length;
      if (nextLiteral) {
        end = value.indexOf(nextLiteral, cursor);
        if (end < 0) return null;
      }
      const fact = value.slice(cursor, end);
      if (!fact) return null;
      if (Object.hasOwn(facts, part.name) && facts[part.name] !== fact) return null;
      facts[part.name] = fact;
      cursor = end;
    }
    if (!value.startsWith(tail, cursor) || cursor + tail.length !== value.length) return null;
    return facts;
  }

  function fillTemplate(template, facts) {
    return template.replace(PLACEHOLDER, (_match, name) => String(facts[name] ?? `{${name}}`));
  }

  function normalizedMode(mode, schoolActive) {
    if (schoolActive) return 'en';
    return LANGUAGE_MODES.includes(mode) ? mode : 'en';
  }

  function findTranslation(value, catalog) {
    if (!isObject(catalog) || catalog.schemaVersion !== 1 || catalog.locale !== 'yue-HK' || !Array.isArray(catalog.entries)) return null;
    for (const entry of catalog.entries) {
      const facts = matchTemplate(value, entry.en);
      if (facts !== null) return fillTemplate(entry.yue, facts);
    }
    return null;
  }

  function resolveLocalizedText(value, {
    mode = 'en',
    schoolActive = false,
    catalog,
    bilingualSeparator = ' · '
  } = {}) {
    const english = String(value ?? '');
    const presentationMode = normalizedMode(mode, schoolActive);
    if (presentationMode === 'en') return english;
    const cantonese = findTranslation(english, catalog);
    if (!cantonese) return english;
    return presentationMode === 'yue' ? cantonese : `${english}${bilingualSeparator}${cantonese}`;
  }

  function markdownBlocks(value) {
    return String(value || '').trim().split(/\r?\n\s*\r?\n/).filter(Boolean);
  }

  function combineMarkdownBlock(english, cantonese) {
    if (english === cantonese) return english;
    const englishHeading = english.match(/^(#{1,6})\s+([\s\S]+)$/);
    const cantoneseHeading = cantonese.match(/^(#{1,6})\s+([\s\S]+)$/);
    if (englishHeading && cantoneseHeading && englishHeading[1] === cantoneseHeading[1]) return `${englishHeading[1]} ${englishHeading[2]} · ${cantoneseHeading[2]}`;
    const englishList = english.split(/\r?\n/);
    const cantoneseList = cantonese.split(/\r?\n/);
    if (englishList.length === cantoneseList.length && englishList.every((line) => /^\s*(?:[-*+] |\d+[.)] )/.test(line)) && cantoneseList.every((line) => /^\s*(?:[-*+] |\d+[.)] )/.test(line))) {
      return englishList.map((line, index) => `${line} · ${cantoneseList[index].replace(/^\s*(?:[-*+] |\d+[.)] )/, '')}`).join('\n');
    }
    return `${english}\n\n${cantonese}`;
  }

  function interleaveMarkdownBlocks(english, cantonese) {
    const englishBlocks = markdownBlocks(english);
    const cantoneseBlocks = markdownBlocks(cantonese);
    if (englishBlocks.length !== cantoneseBlocks.length) throw new Error('Bilingual documentation needs matching English and Cantonese block counts.');
    return englishBlocks.map((block, index) => combineMarkdownBlock(block, cantoneseBlocks[index])).join('\n\n');
  }

  function validateArticleLocales(article) {
    if (!isObject(article)) throw new Error('Localized documentation article must be an object.');
    exactFields(article.locales, ['en', 'yue'], 'Documentation article locales');
    for (const locale of ['en', 'yue']) {
      exactFields(article.locales[locale], ['title', 'content'], `Documentation article ${locale} locale`);
      if (typeof article.locales[locale].title !== 'string' || !article.locales[locale].title.trim() || typeof article.locales[locale].content !== 'string' || !article.locales[locale].content.trim()) throw new Error(`Documentation article ${locale} locale is incomplete.`);
    }
    return article.locales;
  }

  function localizedDocumentationArticle(article, { mode = 'en', schoolActive = false } = {}) {
    const locales = validateArticleLocales(article);
    const presentationMode = normalizedMode(mode, schoolActive);
    if (presentationMode === 'en') return deepFreeze({ title: locales.en.title, content: locales.en.content });
    if (presentationMode === 'yue') return deepFreeze({ title: locales.yue.title, content: locales.yue.content });
    return deepFreeze({
      title: `${locales.en.title} · ${locales.yue.title}`,
      content: interleaveMarkdownBlocks(locales.en.content, locales.yue.content)
    });
  }

  root.HairGrowthLocalizationContract = Object.freeze({
    LANGUAGE_MODES,
    placeholders,
    validateLocaleCatalog,
    mergeLocaleCatalogs,
    resolveLocalizedText,
    interleaveMarkdownBlocks,
    localizedDocumentationArticle
  });
})(globalThis);
