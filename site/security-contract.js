(function installHairGrowthSecurityContract(root) {
  'use strict';

  const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const MAX_VOCABULARY_BYTES = 256 * 1024;
  const MAX_VOCABULARY_ENTRIES = 4096;
  const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/;
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
  const COLOR_PATTERN = /^(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla|oklab|oklch|lab|lch|hwb)\([^\r\n]{1,120}\)|[a-zA-Z]{1,32}|rainbow)$/;
  const STYLE_PROPERTIES = new Set([
    'background', 'backgroundColor', 'border', 'borderColor', 'borderRadius', 'borderStyle',
    'borderWidth', 'boxShadow', 'color', 'filter', 'fontFamily', 'fontSize', 'fontStyle',
    'fontVariant', 'fontWeight', 'letterSpacing', 'lineHeight', 'mixBlendMode', 'opacity', 'outline',
    'outlineColor', 'outlineOffset', 'outlineWidth', 'padding', 'textAlign', 'textDecoration',
    'textDecorationColor', 'textShadow', 'textTransform', 'transform', 'transformOrigin',
    'wordSpacing'
  ]);
  const STYLE_STATES = new Set(['normal', 'hover', 'focus', 'pressed', 'selected', 'disabled', 'dragged', 'validation', 'loading', 'success', 'warning', 'error']);

  function parseJsonStrict(text, { maxDepth = 32, maxBytes = Infinity } = {}) {
    if (typeof text !== 'string') throw new Error('JSON input must be text.');
    const byteLength = typeof TextEncoder === 'function' ? new TextEncoder().encode(text).byteLength : text.length;
    if (byteLength > maxBytes) throw new Error(`JSON input exceeds the ${maxBytes} byte limit.`);
    let index = 0;

    function fail(message) {
      throw new Error(`${message} at character ${index}.`);
    }

    function whitespace() {
      while (index < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[index])) index += 1;
    }

    function parseString() {
      if (text[index] !== '"') fail('Expected a JSON string');
      index += 1;
      let result = '';
      while (index < text.length) {
        const character = text[index++];
        if (character === '"') return result;
        if (character.charCodeAt(0) < 0x20) fail('Unescaped control character in JSON string');
        if (character !== '\\') {
          result += character;
          continue;
        }
        if (index >= text.length) fail('Incomplete JSON escape');
        const escaped = text[index++];
        const simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (Object.hasOwn(simple, escaped)) {
          result += simple[escaped];
          continue;
        }
        if (escaped !== 'u') fail('Unsupported JSON escape');
        const hex = text.slice(index, index + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid Unicode escape');
        result += String.fromCharCode(Number.parseInt(hex, 16));
        index += 4;
      }
      fail('Unterminated JSON string');
    }

    function parseNumber() {
      const match = text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (!match) fail('Invalid JSON number');
      index += match[0].length;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) fail('JSON number is outside the supported range');
      return value;
    }

    function parseArray(depth) {
      if (depth > maxDepth) fail(`JSON exceeds the maximum depth of ${maxDepth}`);
      index += 1;
      const result = [];
      whitespace();
      if (text[index] === ']') {
        index += 1;
        return result;
      }
      while (index < text.length) {
        result.push(parseValue(depth + 1));
        whitespace();
        if (text[index] === ']') {
          index += 1;
          return result;
        }
        if (text[index] !== ',') fail('Expected a comma or closing bracket');
        index += 1;
        whitespace();
      }
      fail('Unterminated JSON array');
    }

    function parseObject(depth) {
      if (depth > maxDepth) fail(`JSON exceeds the maximum depth of ${maxDepth}`);
      index += 1;
      const result = Object.create(null);
      const seen = new Set();
      whitespace();
      if (text[index] === '}') {
        index += 1;
        return result;
      }
      while (index < text.length) {
        const key = parseString();
        if (UNSAFE_KEYS.has(key)) throw new Error(`Unsafe key ${JSON.stringify(key)} is not allowed.`);
        if (seen.has(key)) throw new Error(`Duplicate key ${JSON.stringify(key)} is not allowed.`);
        seen.add(key);
        whitespace();
        if (text[index] !== ':') fail('Expected a colon after an object key');
        index += 1;
        whitespace();
        result[key] = parseValue(depth + 1);
        whitespace();
        if (text[index] === '}') {
          index += 1;
          return result;
        }
        if (text[index] !== ',') fail('Expected a comma or closing brace');
        index += 1;
        whitespace();
      }
      fail('Unterminated JSON object');
    }

    function parseValue(depth) {
      whitespace();
      const character = text[index];
      if (character === '{') return parseObject(depth);
      if (character === '[') return parseArray(depth);
      if (character === '"') return parseString();
      if (character === '-' || /\d/.test(character || '')) return parseNumber();
      if (text.startsWith('true', index)) { index += 4; return true; }
      if (text.startsWith('false', index)) { index += 5; return false; }
      if (text.startsWith('null', index)) { index += 4; return null; }
      fail('Unexpected JSON token');
    }

    const parsed = parseValue(1);
    whitespace();
    if (index !== text.length) fail('Unexpected content after the JSON value');
    return parsed;
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function assertObject(value, label) {
    if (!isObject(value)) throw new Error(`${label} must be an object.`);
  }

  function assertExactFields(value, allowed, label, required = allowed) {
    assertObject(value, label);
    for (const key of Object.keys(value)) {
      if (UNSAFE_KEYS.has(key)) throw new Error(`Unsafe key ${JSON.stringify(key)} is not allowed in ${label}.`);
      if (!allowed.includes(key)) throw new Error(`Unexpected ${label} field ${JSON.stringify(key)}.`);
    }
    for (const key of required) if (!Object.hasOwn(value, key)) throw new Error(`${label} is missing ${JSON.stringify(key)}.`);
  }

  function assertString(value, label, maximum, { minimum = 0, pattern = null } = {}) {
    if (typeof value !== 'string' || value.length < minimum || value.length > maximum) throw new Error(`${label} must be a string from ${minimum} to ${maximum} characters.`);
    if (pattern && !pattern.test(value)) throw new Error(`${label} has an invalid value.`);
    return value;
  }

  function assertBoolean(value, label) {
    if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`);
    return value;
  }

  function assertNumber(value, label, minimum, maximum, { integer = false } = {}) {
    if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isSafeInteger(value))) throw new Error(`${label} is outside its supported numeric range.`);
    return value;
  }

  function assertIdentifier(value, label) {
    if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) throw new Error(`${label} must be a safe identifier.`);
    return value;
  }

  function cloneSafe(value) {
    if (Array.isArray(value)) return value.map(cloneSafe);
    if (isObject(value)) {
      const result = {};
      for (const [key, child] of Object.entries(value)) result[key] = cloneSafe(child);
      return result;
    }
    return value;
  }

  function validatePersonalVocabularyCache(value) {
    assertExactFields(value, ['schemaVersion', 'entries'], 'personal vocabulary cache');
    if (value.schemaVersion !== 1) throw new Error('Personal vocabulary supports schemaVersion 1 only.');
    assertObject(value.entries, 'personal vocabulary entries');
    const entries = Object.entries(value.entries);
    if (entries.length > MAX_VOCABULARY_ENTRIES) throw new Error('Personal vocabulary allows at most 4,096 entries.');
    const result = Object.create(null);
    for (const [key, replacement] of entries) {
      if (UNSAFE_KEYS.has(key)) throw new Error(`Unsafe key ${JSON.stringify(key)} is not allowed.`);
      if (key.length < 1 || key.length > 160) throw new Error('Personal vocabulary keys must be 1 to 160 characters.');
      if (typeof replacement !== 'string') throw new Error('Every personal vocabulary replacement must be a string.');
      if (replacement.length > 1000) throw new Error('Personal vocabulary replacement values must be at most 1,000 characters.');
      result[key] = replacement;
    }
    return { schemaVersion: 1, entries: result };
  }

  function validatePersonalVocabularyText(text, byteLength) {
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw new Error('Personal vocabulary byte length is invalid.');
    if (byteLength > MAX_VOCABULARY_BYTES) throw new Error('Personal vocabulary exceeds the 256 KiB limit.');
    const value = parseJsonStrict(text, { maxDepth: 2, maxBytes: MAX_VOCABULARY_BYTES });
    if (isObject(value)) {
      for (const key of Object.keys(value)) if (!['schemaVersion', 'entries'].includes(key)) throw new Error(`Unexpected root field ${JSON.stringify(key)}.`);
    }
    return validatePersonalVocabularyCache(value);
  }

  function validateLayer(layer, target) {
    assertExactFields(layer, ['id', 'name', 'visible', 'locked', 'opacity', 'blendMode'], `appearance layer for ${target}`, ['id', 'name', 'visible', 'locked']);
    assertIdentifier(layer.id, 'Appearance layer identifier');
    assertString(layer.name, 'Appearance layer name', 120, { minimum: 1 });
    assertBoolean(layer.visible, 'Appearance layer visibility');
    assertBoolean(layer.locked, 'Appearance layer lock');
    if (Object.hasOwn(layer, 'opacity')) assertNumber(layer.opacity, 'Appearance layer opacity', 0, 1);
    if (Object.hasOwn(layer, 'blendMode')) assertString(layer.blendMode, 'Appearance layer blend mode', 32, { minimum: 1, pattern: /^[a-z-]+$/ });
    return cloneSafe(layer);
  }

  function validateStyleValue(property, value) {
    if (!STYLE_PROPERTIES.has(property)) throw new Error(`Unsupported or unsafe style property ${JSON.stringify(property)}.`);
    if (typeof value !== 'string' || value.length > 240 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`Style property ${property} has an invalid value.`);
    if (/(?:url\s*\(|expression\s*\(|@import|javascript:|data:|vbscript:|behavior\s*:|-moz-binding)/i.test(value)) throw new Error(`Style property ${property} contains an unsafe value.`);
    if (['color', 'backgroundColor', 'borderColor', 'outlineColor', 'textDecorationColor'].includes(property) && !COLOR_PATTERN.test(value.trim())) throw new Error(`Style property ${property} is not a supported color.`);
    return value;
  }

  function validateAppearanceMap(value) {
    assertObject(value, 'appearance map');
    if (Object.keys(value).length > 2048) throw new Error('Appearance map exceeds 2,048 targets.');
    const result = {};
    for (const [target, config] of Object.entries(value)) {
      assertIdentifier(target, 'Appearance target identifier');
      assertExactFields(config, ['state', 'layers', 'styles'], `appearance configuration for ${target}`);
      if (!STYLE_STATES.has(config.state)) throw new Error(`Appearance state for ${target} is unsupported.`);
      if (!Array.isArray(config.layers) || config.layers.length < 1 || config.layers.length > 64) throw new Error(`Appearance layers for ${target} must contain 1 to 64 items.`);
      const layerIds = new Set();
      const layers = config.layers.map((layer) => {
        const validated = validateLayer(layer, target);
        if (layerIds.has(validated.id)) throw new Error(`Duplicate appearance layer identifier ${validated.id}.`);
        layerIds.add(validated.id);
        return validated;
      });
      assertObject(config.styles, `appearance styles for ${target}`);
      const styles = {};
      for (const [state, properties] of Object.entries(config.styles)) {
        if (!STYLE_STATES.has(state)) throw new Error(`Appearance style state ${JSON.stringify(state)} is unsupported.`);
        assertObject(properties, `appearance style state ${state}`);
        if (Object.keys(properties).length > STYLE_PROPERTIES.size) throw new Error(`Appearance style state ${state} has too many properties.`);
        styles[state] = {};
        for (const [property, styleValue] of Object.entries(properties)) styles[state][property] = validateStyleValue(property, styleValue);
      }
      result[target] = { state: config.state, layers, styles };
    }
    return result;
  }

  function validateSettings(value) {
    const fields = ['language', 'funnyEn', 'funnyYue', 'dialogEmoji', 'schoolMode', 'schoolModeName', 'theme', 'density', 'accent', 'rainbow', 'rainbowSpeed', 'fontFamily', 'fontScale', 'dock', 'displayName', 'paletteSize', 'reducedMotion', 'narrator', 'logo', 'attention'];
    assertExactFields(value, fields, 'settings');
    if (!['en', 'yue', 'both'].includes(value.language)) throw new Error('Settings language is unsupported.');
    assertNumber(value.funnyEn, 'English funny level', 1, 5, { integer: true });
    assertNumber(value.funnyYue, 'Cantonese funny level', 1, 5, { integer: true });
    assertBoolean(value.dialogEmoji, 'Dialog emoji setting');
    assertBoolean(value.schoolMode, 'School mode setting');
    assertString(value.schoolModeName, 'School mode display name', 80, { minimum: 1 });
    if (!['dark', 'light', 'contrast'].includes(value.theme)) throw new Error('Settings theme is unsupported.');
    if (!['compact', 'comfortable', 'spacious'].includes(value.density)) throw new Error('Settings density is unsupported.');
    validateStyleValue('color', value.accent);
    assertBoolean(value.rainbow, 'Rainbow setting');
    assertNumber(value.rainbowSpeed, 'Rainbow speed', 1, 5, { integer: true });
    assertString(value.fontFamily, 'Font family', 120, { minimum: 1 });
    assertNumber(value.fontScale, 'Font scale', 0.75, 2);
    if (!['left', 'right', 'top', 'bottom'].includes(value.dock)) throw new Error('Tab dock is unsupported.');
    assertString(value.displayName, 'Display name', 120, { minimum: 1 });
    if (!['card', 'full'].includes(value.paletteSize)) throw new Error('Command palette size is unsupported.');
    assertBoolean(value.reducedMotion, 'Reduced motion setting');
    assertExactFields(value.narrator, ['enabled', 'voiceEn', 'voiceYue', 'rate', 'pitch'], 'narrator settings');
    assertBoolean(value.narrator.enabled, 'Narrator enabled setting');
    assertString(value.narrator.voiceEn, 'English narrator voice identity', 512, { minimum: 1 });
    assertString(value.narrator.voiceYue, 'Cantonese narrator voice identity', 512, { minimum: 1 });
    assertNumber(value.narrator.rate, 'Narrator rate', 0.1, 10);
    assertNumber(value.narrator.pitch, 'Narrator pitch', 0, 2);
    assertExactFields(value.logo, ['preset', 'customLogoData', 'fit', 'background'], 'logo settings');
    if (!['strand', 'ruler', 'monogram'].includes(value.logo.preset)) throw new Error('Logo preset is unsupported.');
    assertString(value.logo.customLogoData, 'Custom logo data', 1_500_000);
    if (value.logo.customLogoData && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.logo.customLogoData)) throw new Error('Custom logo data is invalid.');
    if (!['contain', 'cover', 'fill'].includes(value.logo.fit)) throw new Error('Logo fit is unsupported.');
    validateStyleValue('backgroundColor', value.logo.background);
    assertExactFields(value.attention, ['focus', 'lowStim', 'time', 'one', 'momentum', 'nextAction', 'snoozedUntil'], 'attention settings');
    for (const key of ['focus', 'lowStim', 'time', 'one', 'momentum']) assertBoolean(value.attention[key], `Attention setting ${key}`);
    assertString(value.attention.nextAction, 'Next action', 160);
    assertNumber(value.attention.snoozedUntil, 'Momentum snooze time', 0, Number.MAX_SAFE_INTEGER, { integer: true });
    return cloneSafe(value);
  }

  function validateEstimator(value) {
    const fields = ['baselineDate', 'baselineLengthCm', 'manualBaselineDate', 'manualBaselineLengthCm', 'growthRateCmPerMonth', 'targetLengthCm', 'unit'];
    assertExactFields(value, fields, 'estimator state');
    for (const field of ['baselineDate', 'manualBaselineDate']) assertString(value[field], field, 10, { minimum: 10, pattern: DATE_PATTERN });
    for (const field of ['baselineLengthCm', 'manualBaselineLengthCm', 'growthRateCmPerMonth', 'targetLengthCm']) assertNumber(value[field], field, 0, 10000);
    if (!['cm', 'in'].includes(value.unit)) throw new Error('Estimator unit is unsupported.');
    return cloneSafe(value);
  }

  function validateArray(value, label, maximum, validator) {
    if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} must be an array with at most ${maximum} items.`);
    return value.map((entry, index) => validator(entry, `${label}[${index}]`));
  }

  function validateHaircut(record, label) {
    assertExactFields(record, ['id', 'date', 'postCutLengthCm', 'note', 'updatedAt'], label);
    assertIdentifier(record.id, `${label} identifier`);
    assertString(record.date, `${label} date`, 10, { minimum: 10, pattern: DATE_PATTERN });
    assertNumber(record.postCutLengthCm, `${label} post-cut length`, 0, 10000);
    assertString(record.note, `${label} note`, 1000);
    assertString(record.updatedAt, `${label} updated time`, 32, { minimum: 20, pattern: ISO_PATTERN });
    return cloneSafe(record);
  }

  function validateTabs(value) {
    assertExactFields(value, ['order', 'pinned', 'closed', 'groups', 'groupOverrides'], 'tab state');
    const validateIds = (items, label) => validateArray(items, label, 256, (item) => assertIdentifier(item, `${label} identifier`));
    const result = { order: validateIds(value.order, 'tab order'), pinned: validateIds(value.pinned, 'pinned tabs'), closed: validateIds(value.closed, 'closed tabs'), groups: {}, groupOverrides: {} };
    for (const list of [result.order, result.pinned, result.closed]) if (new Set(list).size !== list.length) throw new Error('Tab lists must not contain duplicate identifiers.');
    assertObject(value.groups, 'tab groups');
    if (Object.keys(value.groups).length > 128) throw new Error('Tab groups exceed 128 items.');
    for (const [name, group] of Object.entries(value.groups)) {
      assertString(name, 'Tab group name', 80, { minimum: 1 });
      assertExactFields(group, ['color', 'collapsed'], `tab group ${name}`);
      validateStyleValue('color', group.color);
      assertBoolean(group.collapsed, `tab group ${name} collapsed state`);
      result.groups[name] = cloneSafe(group);
    }
    assertObject(value.groupOverrides, 'tab group overrides');
    for (const [id, name] of Object.entries(value.groupOverrides)) {
      assertIdentifier(id, 'Tab group override identifier');
      assertString(name, 'Tab group override name', 80, { minimum: 1 });
      result.groupOverrides[id] = name;
    }
    return result;
  }

  function validateNotification(record, label) {
    assertExactFields(record, ['id', 'title', 'body', 'type', 'at', 'dismissed'], label);
    assertIdentifier(record.id, `${label} identifier`);
    assertString(record.title, `${label} title`, 160, { minimum: 1 });
    assertString(record.body, `${label} body`, 1000);
    if (!['info', 'success', 'warning', 'error', 'progress'].includes(record.type)) throw new Error(`${label} type is unsupported.`);
    assertString(record.at, `${label} time`, 32, { minimum: 20, pattern: ISO_PATTERN });
    assertBoolean(record.dismissed, `${label} dismissed state`);
    return cloneSafe(record);
  }

  function validateHistory(record, label) {
    assertExactFields(record, ['id', 'action', 'detail', 'at'], label);
    assertIdentifier(record.id, `${label} identifier`);
    assertString(record.action, `${label} action`, 160, { minimum: 1 });
    assertString(record.detail, `${label} detail`, 400);
    assertString(record.at, `${label} time`, 32, { minimum: 20, pattern: ISO_PATTERN });
    return cloneSafe(record);
  }

  function validateSchedule(record, label) {
    assertExactFields(record, ['id', 'label', 'start', 'end', 'days', 'theme', 'enabled', 'createdAt'], label);
    assertIdentifier(record.id, `${label} identifier`);
    assertString(record.label, `${label} name`, 80, { minimum: 1 });
    assertString(record.start, `${label} start`, 5, { minimum: 5, pattern: /^\d{2}:\d{2}$/ });
    assertString(record.end, `${label} end`, 5, { minimum: 5, pattern: /^\d{2}:\d{2}$/ });
    const days = validateArray(record.days, `${label} days`, 7, (day, dayLabel) => assertNumber(day, dayLabel, 0, 6, { integer: true }));
    if (!days.length || new Set(days).size !== days.length) throw new Error(`${label} days must be unique and nonempty.`);
    if (!['dark', 'light', 'contrast'].includes(record.theme)) throw new Error(`${label} theme is unsupported.`);
    assertBoolean(record.enabled, `${label} enabled state`);
    assertString(record.createdAt, `${label} creation time`, 32, { minimum: 20, pattern: ISO_PATTERN });
    return cloneSafe(record);
  }

  function validateTicket(record, label) {
    assertExactFields(record, ['id', 'number', 'category', 'description', 'severity', 'status', 'createdAt'], label);
    assertIdentifier(record.id, `${label} identifier`);
    assertString(record.number, `${label} number`, 40, { minimum: 1, pattern: /^LOCAL-\d{5,12}$/ });
    assertString(record.category, `${label} category`, 80, { minimum: 1 });
    assertString(record.description, `${label} description`, 1000, { minimum: 1 });
    assertString(record.severity, `${label} severity`, 80, { minimum: 1 });
    assertString(record.status, `${label} status`, 120, { minimum: 1 });
    assertString(record.createdAt, `${label} creation time`, 32, { minimum: 20, pattern: ISO_PATTERN });
    return cloneSafe(record);
  }

  function validateTotp(record, label) {
    assertExactFields(record, ['id', 'label', 'issuer', 'totpSecret', 'algorithm', 'digits', 'period', 'createdAt'], label);
    assertIdentifier(record.id, `${label} identifier`);
    assertString(record.label, `${label} name`, 120, { minimum: 1 });
    assertString(record.issuer, `${label} issuer`, 120);
    assertString(record.totpSecret, `${label} secret`, 512, { minimum: 1, pattern: /^[A-Z2-7]+=*$/i });
    if (!['SHA-1', 'SHA-256', 'SHA-512'].includes(record.algorithm)) throw new Error(`${label} algorithm is unsupported.`);
    assertNumber(record.digits, `${label} digits`, 6, 8, { integer: true });
    assertNumber(record.period, `${label} period`, 1, 3600, { integer: true });
    assertString(record.createdAt, `${label} creation time`, 32, { minimum: 20, pattern: ISO_PATTERN });
    return cloneSafe(record);
  }

  function validateSimpleMap(value, label, maximum, valueValidator) {
    assertObject(value, label);
    if (Object.keys(value).length > maximum) throw new Error(`${label} exceeds ${maximum} entries.`);
    const result = {};
    for (const [id, item] of Object.entries(value)) {
      assertIdentifier(id, `${label} identifier`);
      result[id] = valueValidator(item, `${label} ${id}`, id);
    }
    return result;
  }

  function validateLock(lock, label, mapId) {
    assertObject(lock, label);
    const allowed = ['id', 'name', 'policy', 'duration', 'createdAt', 'salt', 'attempts', 'blockedUntil', 'pinHash', 'passwordHash', 'totpSecret'];
    assertExactFields(lock, allowed, label, ['id', 'name', 'policy', 'duration', 'createdAt', 'salt', 'attempts', 'blockedUntil']);
    assertIdentifier(lock.id, `${label} identifier`);
    if (lock.id !== mapId) throw new Error(`${label} identifier does not match its map key.`);
    assertString(lock.name, `${label} name`, 160, { minimum: 1 });
    if (!['pin', 'password', 'pin-password', 'password-totp', 'pin-totp', 'password-pin-totp'].includes(lock.policy)) throw new Error(`${label} policy is unsupported.`);
    if (!['surface', '5', '30', 'session'].includes(String(lock.duration))) throw new Error(`${label} duration is unsupported.`);
    assertString(lock.createdAt, `${label} creation time`, 32, { minimum: 20, pattern: ISO_PATTERN });
    assertString(lock.salt, `${label} salt`, 160, { minimum: 1 });
    assertNumber(lock.attempts, `${label} attempts`, 0, 10000, { integer: true });
    assertNumber(lock.blockedUntil, `${label} blocked time`, 0, Number.MAX_SAFE_INTEGER, { integer: true });
    for (const key of ['pinHash', 'passwordHash', 'totpSecret']) if (Object.hasOwn(lock, key)) assertString(lock[key], `${label} ${key}`, 512, { minimum: 1 });
    return cloneSafe(lock);
  }

  function validateRegexOwner(value, label) {
    assertExactFields(value, ['enabled', 'pattern', 'flags', 'plain', 'sample', 'replacement', 'cases'], label, ['enabled', 'pattern', 'flags', 'plain']);
    assertBoolean(value.enabled, `${label} enabled state`);
    assertString(value.pattern, `${label} pattern`, 2000);
    assertString(value.flags, `${label} flags`, 8, { pattern: /^[dgimsuvy]*$/ });
    if (new Set(value.flags).size !== value.flags.length) throw new Error(`${label} flags contain duplicates.`);
    assertString(value.plain, `${label} plain query`, 20000);
    if (Object.hasOwn(value, 'sample')) assertString(value.sample, `${label} sample`, 20000);
    if (Object.hasOwn(value, 'replacement')) assertString(value.replacement, `${label} replacement`, 2000);
    if (Object.hasOwn(value, 'cases')) validateArray(value.cases, `${label} cases`, 100, (item, caseLabel) => {
      assertExactFields(item, ['id', 'sample', 'expected'], caseLabel);
      assertIdentifier(item.id, `${caseLabel} identifier`);
      assertString(item.sample, `${caseLabel} sample`, 2000, { minimum: 1 });
      if (!['match', 'no-match'].includes(item.expected)) throw new Error(`${caseLabel} expected result is unsupported.`);
      return cloneSafe(item);
    });
    return cloneSafe(value);
  }

  function validateOllama(value) {
    assertExactFields(value, ['url', 'models', 'checkedAt'], 'local model state');
    assertString(value.url, 'Local model URL', 512, { minimum: 1, pattern: /^http:\/\/(?:127\.0\.0\.1|localhost):11434\/?$/ });
    const models = validateArray(value.models, 'local models', 2000, (model, label) => {
      assertExactFields(model, ['name', 'size'], label);
      assertString(model.name, `${label} name`, 300, { minimum: 1 });
      if (model.size !== null) assertNumber(model.size, `${label} size`, 0, Number.MAX_SAFE_INTEGER, { integer: true });
      return cloneSafe(model);
    });
    if (value.checkedAt !== null) assertString(value.checkedAt, 'Local model check time', 32, { minimum: 20, pattern: ISO_PATTERN });
    return { url: value.url, models, checkedAt: value.checkedAt };
  }

  function validateConversion(value) {
    if (value === null) return null;
    assertExactFields(value, ['output', 'extension', 'type', 'sourceName'], 'conversion state');
    assertString(value.output, 'Conversion output', 2_000_000);
    assertString(value.extension, 'Conversion extension', 16, { minimum: 1, pattern: /^[a-z0-9.]+$/i });
    assertString(value.type, 'Conversion media type', 120, { minimum: 1, pattern: /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i });
    assertString(value.sourceName, 'Conversion source name', 120, { minimum: 1 });
    return cloneSafe(value);
  }

  function validateBrowserState(value) {
    const rootFields = ['schemaVersion', 'visited', 'activeTab', 'settings', 'estimator', 'haircuts', 'tabs', 'notifications', 'history', 'schedules', 'locks', 'unlocks', 'tickets', 'totpEntries', 'appearance', 'regexOwners', 'vocabulary', 'ollama', 'conversion', 'schoolLock'];
    const required = rootFields.filter((field) => field !== 'schoolLock');
    assertExactFields(value, rootFields, 'state', required);
    if (value.schemaVersion !== 1) throw new Error('Browser state supports schemaVersion 1 only.');
    assertBoolean(value.visited, 'Visited state');
    assertIdentifier(value.activeTab, 'Active tab identifier');
    const result = {
      schemaVersion: 1,
      visited: value.visited,
      activeTab: value.activeTab,
      settings: validateSettings(value.settings),
      estimator: validateEstimator(value.estimator),
      haircuts: validateArray(value.haircuts, 'haircut records', 5000, validateHaircut),
      tabs: validateTabs(value.tabs),
      notifications: validateArray(value.notifications, 'notification records', 200, validateNotification),
      history: validateArray(value.history, 'history records', 500, validateHistory),
      schedules: validateArray(value.schedules, 'scheduled setting records', 512, validateSchedule),
      locks: validateSimpleMap(value.locks, 'element locks', 4096, validateLock),
      unlocks: validateSimpleMap(value.unlocks, 'element unlocks', 4096, (item, label) => assertNumber(item, label, 0, Number.MAX_SAFE_INTEGER, { integer: true })),
      tickets: validateArray(value.tickets, 'support ticket records', 1000, validateTicket),
      totpEntries: validateArray(value.totpEntries, 'authenticator records', 1000, validateTotp),
      appearance: validateAppearanceMap(value.appearance),
      regexOwners: validateSimpleMap(value.regexOwners, 'regex owners', 4096, validateRegexOwner),
      vocabulary: validatePersonalVocabularyCache(value.vocabulary),
      ollama: validateOllama(value.ollama),
      conversion: validateConversion(value.conversion)
    };
    if (Object.hasOwn(value, 'schoolLock')) {
      assertExactFields(value.schoolLock, ['salt', 'hash'], 'School verifier');
      assertString(value.schoolLock.salt, 'School verifier salt', 160, { minimum: 1 });
      assertString(value.schoolLock.hash, 'School verifier hash', 512, { minimum: 1 });
      result.schoolLock = cloneSafe(value.schoolLock);
    }
    return result;
  }

  function rejectVerifierMaterial(value, path = 'import') {
    if (Array.isArray(value)) {
      value.forEach((child, index) => rejectVerifierMaterial(child, `${path}[${index}]`));
      return;
    }
    if (!isObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (['schoolLock', 'salt', 'hash', 'pinHash', 'passwordHash', 'lockHash', 'totpSecret', 'vocabulary', 'customLogoData'].includes(key)) throw new Error(`Import contains verifier material or private local data at ${path}.${key}.`);
      rejectVerifierMaterial(child, `${path}.${key}`);
    }
  }

  function buildRedactedExportState(value) {
    assertObject(value, 'state');
    const exportCandidate = {
      ...cloneSafe(value),
      locks: {},
      unlocks: {},
      totpEntries: [],
      vocabulary: { schemaVersion: 1, entries: {} }
    };
    delete exportCandidate.schoolLock;
    const source = validateBrowserState(exportCandidate);
    const settings = {
      language: source.settings.language,
      funnyEn: source.settings.funnyEn,
      funnyYue: source.settings.funnyYue,
      dialogEmoji: source.settings.dialogEmoji,
      schoolMode: false,
      schoolModeName: source.settings.schoolModeName,
      theme: source.settings.theme,
      density: source.settings.density,
      accent: source.settings.accent,
      rainbow: source.settings.rainbow,
      rainbowSpeed: source.settings.rainbowSpeed,
      fontFamily: source.settings.fontFamily,
      fontScale: source.settings.fontScale,
      dock: source.settings.dock,
      displayName: source.settings.displayName,
      paletteSize: source.settings.paletteSize,
      reducedMotion: source.settings.reducedMotion,
      narrator: cloneSafe(source.settings.narrator),
      logo: { preset: source.settings.logo.preset, customLogoData: '', fit: source.settings.logo.fit, background: source.settings.logo.background },
      attention: cloneSafe(source.settings.attention)
    };
    return {
      schemaVersion: 1,
      visited: source.visited,
      activeTab: source.activeTab,
      settings,
      estimator: cloneSafe(source.estimator),
      haircuts: cloneSafe(source.haircuts),
      tabs: cloneSafe(source.tabs),
      notifications: cloneSafe(source.notifications),
      history: cloneSafe(source.history),
      schedules: cloneSafe(source.schedules),
      tickets: cloneSafe(source.tickets),
      appearance: cloneSafe(source.appearance),
      regexOwners: cloneSafe(source.regexOwners),
      ollama: cloneSafe(source.ollama),
      conversion: null
    };
  }

  function sanitizeImportedState(value) {
    rejectVerifierMaterial(value);
    const fields = ['schemaVersion', 'visited', 'activeTab', 'settings', 'estimator', 'haircuts', 'tabs', 'notifications', 'history', 'schedules', 'tickets', 'appearance', 'regexOwners', 'ollama', 'conversion'];
    assertExactFields(value, fields, 'imported state', fields.filter((field) => field !== 'conversion'));
    const candidate = {
      ...cloneSafe(value),
      conversion: null,
      locks: {},
      unlocks: {},
      totpEntries: [],
      vocabulary: { schemaVersion: 1, entries: {} }
    };
    return validateBrowserState(candidate);
  }

  function validateStoredStateEnvelopeText(text, fallbackState) {
    if (text === null || text === undefined || text === '') return { storageEnvelopeSchema: 1, revision: 0, writerId: 'empty-state', writtenAt: null, state: validateBrowserState(fallbackState), legacy: false };
    const parsed = parseJsonStrict(text, { maxDepth: 12, maxBytes: 4 * 1024 * 1024 });
    if (parsed.storageEnvelopeSchema === 1) {
      assertExactFields(parsed, ['storageEnvelopeSchema', 'revision', 'writerId', 'writtenAt', 'state'], 'storage envelope');
      assertNumber(parsed.revision, 'Storage revision', 0, Number.MAX_SAFE_INTEGER, { integer: true });
      assertIdentifier(parsed.writerId, 'Storage writer identity');
      if (parsed.writtenAt !== null) assertString(parsed.writtenAt, 'Storage write time', 32, { minimum: 20, pattern: ISO_PATTERN });
      return { storageEnvelopeSchema: 1, revision: parsed.revision, writerId: parsed.writerId, writtenAt: parsed.writtenAt, state: validateBrowserState(parsed.state), legacy: false };
    }
    const state = validateBrowserState(parsed);
    return { storageEnvelopeSchema: 1, revision: 0, writerId: 'legacy-unversioned-state', writtenAt: null, state, legacy: true };
  }

  root.HairGrowthSecurityContract = Object.freeze({
    MAX_VOCABULARY_BYTES,
    MAX_VOCABULARY_ENTRIES,
    STYLE_PROPERTIES,
    buildRedactedExportState,
    parseJsonStrict,
    sanitizeImportedState,
    validateAppearanceMap,
    validateBrowserState,
    validatePersonalVocabularyCache,
    validatePersonalVocabularyText,
    validateStoredStateEnvelopeText
  });
}(typeof globalThis === 'object' ? globalThis : window));
