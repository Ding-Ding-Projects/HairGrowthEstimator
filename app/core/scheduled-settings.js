'use strict';

const net = require('node:net');

const SCHEDULE_SCHEMA_VERSION = 1;
const MAX_DOCUMENT_BYTES = 65536;
const MAX_RULES = 128;
const MAX_SOURCE_RESPONSE_BYTES = 65536;

const ALLOWED_SETTING_FIELDS = Object.freeze([
  'displayName',
  'language',
  'theme',
  'density',
  'accent',
  'tabDock',
  'funnyEnglish',
  'funnyCantonese',
  'showDialogEmoji',
  'reducedMotion',
  'fontFamily',
  'fontScale',
  'fontWeight',
  'rainbowSpeedLevel'
]);

const SCHEDULE_SOURCE_TYPES = Object.freeze(['local', 'api', 'home-assistant']);

// Equal times cover the full local day. Cross-midnight windows belong to the
// local date and weekday on which they start, and their end time is exclusive.
// Matching rules apply from low to high priority, with later document order
// winning a tie, so removing an override always reveals the unchanged base.
const SCHEDULE_SEMANTICS = Object.freeze({
  equalTimes: 'full-day',
  endBoundary: 'exclusive',
  crossMidnightWeekday: 'start-day',
  dateBoundaries: 'inclusive-start-day',
  precedence: 'higher-priority-then-later-rule',
  externalFallback: 'base-settings'
});

const DOCUMENT_FIELDS = new Set(['schemaVersion', 'rules']);
const RULE_FIELDS = new Set([
  'id',
  'label',
  'enabled',
  'priority',
  'startDate',
  'endDate',
  'startTime',
  'endTime',
  'dayMode',
  'weekdays',
  'timezone',
  'source'
]);
const SETTING_FIELD_SET = new Set(ALLOWED_SETTING_FIELDS);
const SOURCE_TYPE_SET = new Set(SCHEDULE_SOURCE_TYPES);
const LANGUAGE_MODES = new Set(['en', 'yue', 'bilingual']);
const THEMES = new Set(['dark', 'light', 'contrast']);
const DENSITIES = new Set(['compact', 'comfortable', 'spacious']);
const TAB_DOCKS = new Set(['left', 'right', 'top', 'bottom']);
const formatterCache = new Map();

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function requireOwn(object, field, label) {
  if (!Object.prototype.hasOwnProperty.call(object, field)) {
    throw new TypeError(`${label} requires the ${field} field.`);
  }
}

function ownOrDefault(object, field, fallback) {
  return Object.prototype.hasOwnProperty.call(object, field) ? object[field] : fallback;
}

function rejectUnknownFields(object, allowed, label) {
  for (const field of Object.keys(object)) {
    if (!allowed.has(field)) throw new TypeError(`${label} contains unknown field ${field}.`);
  }
}

function serializedBytes(value, maximum, label) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError(`${label} must be serializable JSON.`);
  }
  if (typeof serialized !== 'string') throw new TypeError(`${label} must be serializable JSON.`);
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > maximum) throw new RangeError(`${label} must contain at most ${maximum} bytes.`);
  return bytes;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneJson(value, maximum, label) {
  serializedBytes(value, maximum, label);
  return JSON.parse(JSON.stringify(value));
}

function boundedString(value, minimum, maximum, label, options = {}) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`);
  const normalized = options.trim === false ? value : value.trim();
  if (normalized.length < minimum) throw new RangeError(`${label} must contain at least ${minimum} characters.`);
  if (normalized.length > maximum) throw new RangeError(`${label} must contain at most ${maximum} characters.`);
  if (/\p{Cc}/u.test(normalized)) throw new TypeError(`${label} must not contain control characters.`);
  return normalized;
}

function boundedInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function boundedNumber(value, minimum, maximum, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function validateCalendarDate(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new TypeError(`${label} must be an ISO calendar date or null.`);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new TypeError(`${label} must be a valid ISO calendar date.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1) throw new TypeError(`${label} must be a valid ISO calendar date.`);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TypeError(`${label} must be a valid ISO calendar date.`);
  }
  return value;
}

function validateClockTime(value, label) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new TypeError(`${label} must use HH:mm in the 24-hour clock.`);
  }
  return value;
}

function clockMinutes(value) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function validateTimezone(value) {
  const supplied = boundedString(value, 1, 128, 'Schedule timezone');
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: supplied }).format(new Date(0));
  } catch {
    throw new TypeError('Schedule timezone must be a valid IANA timezone.');
  }
  return supplied;
}

function validateSettings(input, label = 'Scheduled settings') {
  const settings = requirePlainObject(input, label);
  const output = {};
  for (const field of Object.keys(settings)) {
    if (!SETTING_FIELD_SET.has(field)) throw new TypeError(`${label} contains unknown setting field ${field}.`);
    const value = settings[field];
    switch (field) {
      case 'displayName':
        output[field] = boundedString(value, 1, 80, 'Display name');
        break;
      case 'language':
        if (!LANGUAGE_MODES.has(value)) throw new TypeError('Language must be en, yue, or bilingual.');
        output[field] = value;
        break;
      case 'theme':
        if (!THEMES.has(value)) throw new TypeError('Theme must be dark, light, or contrast.');
        output[field] = value;
        break;
      case 'density':
        if (!DENSITIES.has(value)) throw new TypeError('Density must be compact, comfortable, or spacious.');
        output[field] = value;
        break;
      case 'accent':
        if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
          throw new TypeError('Accent must be a six-digit hexadecimal color.');
        }
        output[field] = value;
        break;
      case 'tabDock':
        if (!TAB_DOCKS.has(value)) throw new TypeError('Tab dock must be left, right, top, or bottom.');
        output[field] = value;
        break;
      case 'funnyEnglish':
      case 'funnyCantonese':
      case 'rainbowSpeedLevel':
        output[field] = boundedInteger(value, 1, 5, field);
        break;
      case 'showDialogEmoji':
      case 'reducedMotion':
        if (typeof value !== 'boolean') throw new TypeError(`${field} must be a boolean.`);
        output[field] = value;
        break;
      case 'fontFamily':
        output[field] = boundedString(value, 1, 120, 'Font family');
        break;
      case 'fontScale':
        output[field] = boundedNumber(value, 0.75, 2, 'Font scale');
        break;
      case 'fontWeight':
        output[field] = boundedInteger(value, 100, 900, 'Font weight');
        break;
      default:
        throw new TypeError(`${label} contains unknown setting field ${field}.`);
    }
  }
  return deepFreeze(output);
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized === '::1') return true;
  return net.isIP(normalized) === 4 && normalized.split('.')[0] === '127';
}

function validateExternalUrl(value) {
  const supplied = boundedString(value, 1, 2048, 'External settings URL', { trim: false });
  if (/\s/u.test(supplied)) throw new TypeError('External settings URL must not contain whitespace.');
  let url;
  try {
    url = new URL(supplied);
  } catch {
    throw new TypeError('External settings URL must use HTTPS, except for exact loopback HTTP.');
  }
  if (url.username || url.password) {
    throw new TypeError('External settings URL must not contain embedded credentials.');
  }
  if (url.hash) throw new TypeError('External settings URL must not include a fragment.');
  if (url.protocol === 'http:' && isLoopbackHostname(url.hostname)) return url.href;
  if (url.protocol !== 'https:') {
    throw new TypeError('External settings URL must use HTTPS, except for exact loopback HTTP.');
  }
  return url.href;
}

function validateRequestBounds(source, label) {
  const timeoutMs = boundedInteger(source.timeoutMs, 1000, 30000, `${label} timeout`);
  const refreshIntervalMs = boundedInteger(source.refreshIntervalMs, 30000, 3600000, `${label} refresh interval`);
  const maxResponseBytes = boundedInteger(source.maxResponseBytes, 256, MAX_SOURCE_RESPONSE_BYTES, `${label} response bytes`);
  if (source.redirectPolicy !== 'error') {
    throw new TypeError(`${label} redirect policy must be error so the caller rejects every redirect.`);
  }
  return { timeoutMs, refreshIntervalMs, maxResponseBytes, redirectPolicy: 'error' };
}

function normalizeLocalSource(source) {
  const allowed = new Set(['type', 'settings']);
  rejectUnknownFields(source, allowed, 'Local schedule source');
  requireOwn(source, 'settings', 'Local schedule source');
  return deepFreeze({ type: 'local', settings: validateSettings(source.settings) });
}

function normalizeApiSource(source) {
  const allowed = new Set([
    'type',
    'url',
    'timeoutMs',
    'refreshIntervalMs',
    'maxResponseBytes',
    'redirectPolicy'
  ]);
  rejectUnknownFields(source, allowed, 'API schedule source');
  for (const field of allowed) requireOwn(source, field, 'API schedule source');
  const bounds = validateRequestBounds(source, 'API source');
  return deepFreeze({
    type: 'api',
    url: validateExternalUrl(source.url),
    ...bounds
  });
}

function validateEntityId(value) {
  const entityId = boundedString(value, 3, 253, 'Home Assistant entity ID');
  if (!/^(?:binary_sensor|input_boolean)\.[a-z0-9_]+$/.test(entityId)) {
    throw new TypeError('Home Assistant entity ID must use binary_sensor or input_boolean and contain only lowercase letters, digits, and underscores.');
  }
  return entityId;
}

function normalizeHomeAssistantSource(source) {
  const allowed = new Set([
    'type',
    'baseUrl',
    'entityId',
    'credentialRef',
    'settings',
    'timeoutMs',
    'refreshIntervalMs',
    'maxResponseBytes',
    'redirectPolicy'
  ]);
  rejectUnknownFields(source, allowed, 'Home Assistant schedule source');
  for (const field of allowed) requireOwn(source, field, 'Home Assistant schedule source');
  const bounds = validateRequestBounds(source, 'Home Assistant source');
  const baseUrl = new URL(validateExternalUrl(source.baseUrl));
  if (baseUrl.search) throw new TypeError('Home Assistant base URL must not include a query string.');
  if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname = `${baseUrl.pathname}/`;
  const credentialRef = boundedString(source.credentialRef, 1, 128, 'Home Assistant credential reference');
  if (!/^[A-Za-z0-9._:-]+$/.test(credentialRef)) {
    throw new TypeError('Home Assistant credential reference contains unsupported characters.');
  }
  return deepFreeze({
    type: 'home-assistant',
    baseUrl: baseUrl.href,
    entityId: validateEntityId(source.entityId),
    credentialRef,
    settings: validateSettings(source.settings),
    ...bounds
  });
}

function normalizeSource(input) {
  const source = requirePlainObject(input, 'Schedule source');
  requireOwn(source, 'type', 'Schedule source');
  if (!SOURCE_TYPE_SET.has(source.type)) {
    throw new TypeError(`Schedule source type must be one of ${SCHEDULE_SOURCE_TYPES.join(', ')}.`);
  }
  if (source.type === 'local') return normalizeLocalSource(source);
  if (source.type === 'api') return normalizeApiSource(source);
  return normalizeHomeAssistantSource(source);
}

function normalizeScheduleRule(input) {
  const rule = requirePlainObject(input, 'Schedule rule');
  rejectUnknownFields(rule, RULE_FIELDS, 'Schedule rule');
  for (const field of ['id', 'label', 'timezone', 'source']) requireOwn(rule, field, 'Schedule rule');

  const id = boundedString(rule.id, 1, 64, 'Schedule rule ID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
    throw new TypeError('Schedule rule ID contains unsupported characters.');
  }
  const label = boundedString(rule.label, 1, 120, 'Schedule rule label');
  const enabled = ownOrDefault(rule, 'enabled', true);
  if (typeof enabled !== 'boolean') throw new TypeError('Schedule rule enabled must be a boolean.');
  const priorityValue = ownOrDefault(rule, 'priority', 0);
  const priority = boundedInteger(priorityValue, -1000, 1000, 'Schedule rule priority');
  const startDate = validateCalendarDate(ownOrDefault(rule, 'startDate', null), 'Schedule start date');
  const endDate = validateCalendarDate(ownOrDefault(rule, 'endDate', null), 'Schedule end date');
  if (startDate && endDate && startDate > endDate) {
    throw new RangeError('Schedule start date must not be after its end date.');
  }
  const startTime = validateClockTime(ownOrDefault(rule, 'startTime', '00:00'), 'Schedule start time');
  const endTime = validateClockTime(ownOrDefault(rule, 'endTime', '00:00'), 'Schedule end time');
  const dayMode = ownOrDefault(rule, 'dayMode', 'every-day');
  if (!['every-day', 'weekdays'].includes(dayMode)) {
    throw new TypeError('Schedule day mode must be every-day or weekdays.');
  }
  const weekdayInput = ownOrDefault(rule, 'weekdays', []);
  if (!Array.isArray(weekdayInput) || weekdayInput.length > 7) {
    throw new RangeError('Schedule weekdays must be an array with at most seven entries.');
  }
  const weekdays = weekdayInput.map((day) => boundedInteger(day, 0, 6, 'Schedule weekday'));
  if (new Set(weekdays).size !== weekdays.length) throw new TypeError('Schedule weekdays must not contain duplicates.');
  weekdays.sort((left, right) => left - right);
  if (dayMode === 'every-day' && weekdays.length) {
    throw new TypeError('Schedule weekdays must be empty when day mode is every-day.');
  }

  return deepFreeze({
    id,
    label,
    enabled,
    priority,
    startDate,
    endDate,
    startTime,
    endTime,
    dayMode,
    weekdays,
    timezone: validateTimezone(rule.timezone),
    source: normalizeSource(rule.source)
  });
}

function validateScheduleDocument(input) {
  serializedBytes(input, MAX_DOCUMENT_BYTES, 'Schedule document');
  const document = requirePlainObject(input, 'Schedule document');
  rejectUnknownFields(document, DOCUMENT_FIELDS, 'Schedule document');
  requireOwn(document, 'schemaVersion', 'Schedule document');
  requireOwn(document, 'rules', 'Schedule document');
  if (document.schemaVersion !== SCHEDULE_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported schedule schema version ${document.schemaVersion}.`);
  }
  if (!Array.isArray(document.rules) || document.rules.length > MAX_RULES) {
    throw new RangeError(`Schedule document must contain at most ${MAX_RULES} rules.`);
  }
  const rules = document.rules.map((rule) => normalizeScheduleRule(rule));
  const ids = new Set();
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new TypeError(`Duplicate schedule rule ID ${rule.id}.`);
    ids.add(rule.id);
  }
  return deepFreeze({ schemaVersion: SCHEDULE_SCHEMA_VERSION, rules });
}

function formatterForTimezone(timezone) {
  if (!formatterCache.has(timezone)) {
    formatterCache.set(timezone, new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }));
  }
  return formatterCache.get(timezone);
}

function validInstant(value) {
  const instant = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new TypeError('Schedule evaluation instant must be a valid date.');
  return instant;
}

function zonedParts(instant, timezone) {
  const values = {};
  for (const part of formatterForTimezone(timezone).formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  const date = `${values.year}-${values.month}-${values.day}`;
  return {
    date,
    minutes: Number(values.hour) * 60 + Number(values.minute)
  };
}

function shiftIsoDate(value, days) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day + days);
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function weekdayForDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCDay();
}

function isRuleActive(input, instantValue) {
  const rule = normalizeScheduleRule(input);
  if (!rule.enabled) return false;
  const instant = validInstant(instantValue);
  const current = zonedParts(instant, rule.timezone);
  const start = clockMinutes(rule.startTime);
  const end = clockMinutes(rule.endTime);
  let effectiveDate = current.date;

  if (start < end) {
    if (current.minutes < start || current.minutes >= end) return false;
  } else if (start > end) {
    if (current.minutes >= start) {
      effectiveDate = current.date;
    } else if (current.minutes < end) {
      effectiveDate = shiftIsoDate(current.date, -1);
    } else {
      return false;
    }
  }

  if (rule.startDate && effectiveDate < rule.startDate) return false;
  if (rule.endDate && effectiveDate > rule.endDate) return false;
  if (rule.dayMode === 'weekdays' && !rule.weekdays.includes(weekdayForDate(effectiveDate))) return false;
  return true;
}

function matchesScheduleRule(input, instantValue) {
  return isRuleActive(input, instantValue);
}

function normalizeDocumentOrRules(input) {
  if (Array.isArray(input)) return validateScheduleDocument({ schemaVersion: SCHEDULE_SCHEMA_VERSION, rules: input });
  return validateScheduleDocument(input);
}

function chooseWinningRules(documentOrRules, instantValue) {
  const document = normalizeDocumentOrRules(documentOrRules);
  const indexed = document.rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => isRuleActive(rule, instantValue));
  indexed.sort((left, right) => left.rule.priority - right.rule.priority || left.index - right.index);
  return deepFreeze(indexed.map(({ rule }) => rule));
}

function sourceFromRuleOrSource(input) {
  if (isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'source')) {
    return normalizeScheduleRule(input).source;
  }
  return normalizeSource(input);
}

function canonicalSourceScope(input) {
  const source = sourceFromRuleOrSource(input);
  if (source.type === 'local') return 'local';
  if (source.type === 'api') return `api:${source.url}`;
  return `home-assistant:${source.baseUrl}|${source.entityId}|${source.credentialRef}`;
}

function createExternalRequestDescriptor(ruleInput) {
  const rule = normalizeScheduleRule(ruleInput);
  const source = rule.source;
  if (source.type === 'local') throw new TypeError('Local schedule sources do not create external requests.');
  const base = {
    url: source.type === 'api'
      ? source.url
      : new URL(`api/states/${source.entityId}`, source.baseUrl).href,
    method: 'GET',
    redirect: 'error',
    credentials: 'omit',
    timeoutMs: source.timeoutMs,
    maxResponseBytes: source.maxResponseBytes,
    headers: { accept: 'application/json' }
  };
  if (source.type === 'home-assistant') base.credentialRef = source.credentialRef;
  return deepFreeze(base);
}

function validateGeneration(value) {
  return boundedInteger(value, 1, Number.MAX_SAFE_INTEGER, 'Source generation');
}

function validateTimestamp(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp or null.`);
  return new Date(value).toISOString();
}

function validateSourceContext(input) {
  const context = requirePlainObject(input, 'Source result context');
  const allowed = new Set(['generation', 'receivedAt']);
  rejectUnknownFields(context, allowed, 'Source result context');
  requireOwn(context, 'generation', 'Source result context');
  return {
    generation: validateGeneration(context.generation),
    receivedAt: validateTimestamp(ownOrDefault(context, 'receivedAt', null), 'Source result received time')
  };
}

function validateApiPayload(source, payload) {
  serializedBytes(payload, source.maxResponseBytes, `API source response for limit ${source.maxResponseBytes}`);
  const object = requirePlainObject(payload, 'API source response');
  const allowed = new Set(['schemaVersion', 'settings']);
  rejectUnknownFields(object, allowed, 'API source response');
  requireOwn(object, 'schemaVersion', 'API source response');
  requireOwn(object, 'settings', 'API source response');
  if (object.schemaVersion !== SCHEDULE_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported API source schema version ${object.schemaVersion}.`);
  }
  return validateSettings(object.settings, 'API source settings');
}

function validateHomeAssistantPayload(source, payload) {
  serializedBytes(payload, source.maxResponseBytes, `Home Assistant source response for limit ${source.maxResponseBytes}`);
  const object = requirePlainObject(payload, 'Home Assistant source response');
  const allowed = new Set([
    'entity_id',
    'state',
    'attributes',
    'last_changed',
    'last_reported',
    'last_updated',
    'context'
  ]);
  rejectUnknownFields(object, allowed, 'Home Assistant source response');
  requireOwn(object, 'entity_id', 'Home Assistant source response');
  requireOwn(object, 'state', 'Home Assistant source response');
  if (object.entity_id !== source.entityId) throw new TypeError('Home Assistant response entity does not match the configured entity ID.');
  if (!['on', 'off'].includes(object.state)) throw new TypeError('Home Assistant boolean state must be on or off.');
  if (Object.prototype.hasOwnProperty.call(object, 'attributes') && object.attributes !== undefined) {
    requirePlainObject(object.attributes, 'Home Assistant response attributes');
  }
  if (Object.prototype.hasOwnProperty.call(object, 'context') && object.context !== undefined) {
    requirePlainObject(object.context, 'Home Assistant response context');
  }
  return object.state === 'on';
}

function validateSourceResult(ruleInput, payload, contextInput) {
  const rule = normalizeScheduleRule(ruleInput);
  const context = validateSourceContext(contextInput);
  let active = true;
  let settings;
  if (rule.source.type === 'local') {
    if (payload !== null && payload !== undefined) throw new TypeError('Local schedule sources do not accept an external response.');
    settings = rule.source.settings;
  } else if (rule.source.type === 'api') {
    settings = validateApiPayload(rule.source, payload);
  } else {
    active = validateHomeAssistantPayload(rule.source, payload);
    settings = active ? rule.source.settings : deepFreeze({});
  }
  return deepFreeze({
    schemaVersion: SCHEDULE_SCHEMA_VERSION,
    ruleId: rule.id,
    sourceScope: canonicalSourceScope(rule),
    generation: context.generation,
    active,
    settings,
    receivedAt: context.receivedAt
  });
}

function assertNormalizedSourceResult(input, label) {
  const result = requirePlainObject(input, label);
  const allowed = new Set(['schemaVersion', 'ruleId', 'sourceScope', 'generation', 'active', 'settings', 'receivedAt']);
  rejectUnknownFields(result, allowed, label);
  for (const field of allowed) requireOwn(result, field, label);
  if (result.schemaVersion !== SCHEDULE_SCHEMA_VERSION) throw new TypeError(`${label} has an unsupported schema version.`);
  const ruleId = boundedString(result.ruleId, 1, 64, `${label} rule ID`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(ruleId)) throw new TypeError(`${label} rule ID is invalid.`);
  boundedString(result.sourceScope, 1, 4096, `${label} source scope`, { trim: false });
  validateGeneration(result.generation);
  if (typeof result.active !== 'boolean') throw new TypeError(`${label} active must be a boolean.`);
  const settings = validateSettings(result.settings, `${label} settings`);
  if (!result.active && Object.keys(settings).length) throw new TypeError(`${label} must not apply settings while inactive.`);
  validateTimestamp(result.receivedAt, `${label} received time`);
  return result;
}

function nextSourceGeneration(current) {
  if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Source generation cannot advance from this value.');
  }
  return current + 1;
}

function selectNewestSourceResult(current, candidate) {
  if (current === null || current === undefined) return assertNormalizedSourceResult(candidate, 'Candidate source result');
  if (candidate === null || candidate === undefined) return assertNormalizedSourceResult(current, 'Current source result');
  const safeCurrent = assertNormalizedSourceResult(current, 'Current source result');
  const safeCandidate = assertNormalizedSourceResult(candidate, 'Candidate source result');
  if (safeCurrent.ruleId !== safeCandidate.ruleId) throw new TypeError('Source results must belong to the same rule.');
  if (safeCurrent.sourceScope !== safeCandidate.sourceScope) {
    throw new TypeError('Source results must belong to the same canonical source scope.');
  }
  return safeCandidate.generation > safeCurrent.generation ? safeCandidate : safeCurrent;
}

function normalizedResultForRule(rule, sourceResults) {
  if (rule.source.type === 'local') {
    return { active: true, settings: rule.source.settings };
  }
  if (!sourceResults || !Object.prototype.hasOwnProperty.call(sourceResults, rule.id)) return null;
  const result = assertNormalizedSourceResult(sourceResults[rule.id], `Source result for ${rule.id}`);
  if (result.ruleId !== rule.id) throw new TypeError(`Source result for ${rule.id} has the wrong rule ID.`);
  if (result.sourceScope !== canonicalSourceScope(rule)) return null;
  return result;
}

function resolveScheduledSettings(documentInput, instantValue, baseSettings, sourceResults = {}) {
  const document = validateScheduleDocument(documentInput);
  const base = requirePlainObject(baseSettings, 'Base settings');
  const resultMap = requirePlainObject(sourceResults, 'Source result map');
  const settings = cloneJson(base, MAX_DOCUMENT_BYTES, 'Base settings');
  const matched = chooseWinningRules(document, instantValue);
  const appliedRuleIds = [];
  for (const rule of matched) {
    const result = normalizedResultForRule(rule, resultMap);
    if (!result || !result.active) continue;
    Object.assign(settings, result.settings);
    appliedRuleIds.push(rule.id);
  }
  return deepFreeze({
    settings,
    matchedRuleIds: matched.map((rule) => rule.id),
    appliedRuleIds
  });
}

module.exports = {
  ALLOWED_SOURCE_TYPES: SCHEDULE_SOURCE_TYPES,
  ALLOWED_SETTING_FIELDS,
  MAX_DOCUMENT_BYTES,
  MAX_RULES,
  MAX_SOURCE_RESPONSE_BYTES,
  SCHEDULE_SCHEMA_VERSION,
  SCHEDULE_SEMANTICS,
  SCHEDULE_SOURCE_TYPES,
  SOURCE_TYPES: SCHEDULE_SOURCE_TYPES,
  canonicalSourceScope,
  chooseWinningRules,
  createExternalRequestDescriptor,
  isRuleActive,
  matchesScheduleRule,
  nextSourceGeneration,
  normalizeScheduleRule,
  resolveScheduledSettings,
  selectNewestSourceResult,
  validateExternalUrl,
  validateScheduleDocument,
  validateScheduleRule: normalizeScheduleRule,
  validateSourceResult
};
