'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const net = require('node:net');
const { createStore } = require('./store');

const SERVICE_NAME = 'hair-growth-api';
const DEFAULT_VERSION = '1.0.0';
const CENTIMETRES_PER_INCH = 2.54;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_PROFILES = 1000;
const MAX_HAIRCUTS_PER_PROFILE = 10000;
const MAX_NOTE_LENGTH = 500;
const MAX_PROFILE_NAME_LENGTH = 100;
const MAX_RESPONSE_PAGE = 500;
const RESERVED_PROFILE_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function httpError(statusCode, message, code = 'invalid_request') {
  return Object.assign(new Error(message), { statusCode, code });
}

function boundedInteger(value, min, max, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function isLoopback(host) {
  const normalised = String(host || '').trim().toLowerCase();
  if (normalised === 'localhost' || normalised === '::1' || normalised === '0:0:0:0:0:0:0:1') return true;
  if (normalised.startsWith('::ffff:127.')) return true;
  return net.isIPv4(normalised) && normalised.startsWith('127.');
}

function validateBindHost(value) {
  const host = String(value || '').trim();
  if (!host || host.length > 253) throw new Error('HAIR_HOST must be a valid bind host.');
  if (host.toLowerCase() === 'localhost' || net.isIP(host)) return host;
  if (!/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/.test(host)) {
    throw new Error('HAIR_HOST must be a valid bind host.');
  }
  return host;
}

function parseCorsAllowlist(value) {
  const origins = new Set();
  for (const rawOrigin of String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean)) {
    if (rawOrigin === '*' || rawOrigin === 'null') throw new Error('HAIR_CORS_ORIGINS must contain explicit HTTP or HTTPS origins.');
    let parsed;
    try {
      parsed = new URL(rawOrigin);
    } catch {
      throw new Error('HAIR_CORS_ORIGINS contains an invalid origin.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('HAIR_CORS_ORIGINS must contain origin-only HTTP or HTTPS URLs.');
    }
    origins.add(parsed.origin);
  }
  return origins;
}

function loadConfig(environment = process.env) {
  const host = validateBindHost(environment.HAIR_HOST || '127.0.0.1');
  const apiKey = String(environment.HAIR_API_KEY || '');
  const apiKeyBytes = Buffer.byteLength(apiKey, 'utf8');
  if (apiKeyBytes > 512) throw new Error('HAIR_API_KEY exceeds the supported size.');
  if (!isLoopback(host) && apiKeyBytes < 32) {
    throw new Error('A strong HAIR_API_KEY is required for every non-loopback bind.');
  }

  return Object.freeze({
    serviceName: SERVICE_NAME,
    version: String(environment.HAIR_VERSION || DEFAULT_VERSION).slice(0, 64),
    host,
    port: boundedInteger(environment.HAIR_PORT || '4782', 1, 65535, 'HAIR_PORT'),
    dataFile: environment.HAIR_DATA_FILE,
    apiKey,
    corsOrigins: parseCorsAllowlist(environment.HAIR_CORS_ORIGINS),
    bodyTimeoutMs: boundedInteger(environment.HAIR_BODY_TIMEOUT_MS || '10000', 1000, 30000, 'HAIR_BODY_TIMEOUT_MS'),
    requestTimeoutMs: boundedInteger(environment.HAIR_REQUEST_TIMEOUT_MS || '15000', 1000, 60000, 'HAIR_REQUEST_TIMEOUT_MS'),
    headersTimeoutMs: boundedInteger(environment.HAIR_HEADERS_TIMEOUT_MS || '10000', 1000, 30000, 'HAIR_HEADERS_TIMEOUT_MS'),
    maxBodyBytes: MAX_BODY_BYTES,
    maxProfiles: MAX_PROFILES,
    maxHaircutsPerProfile: MAX_HAIRCUTS_PER_PROFILE
  });
}

function timingSafeApiKeyEqual(provided, expected) {
  const providedValue = typeof provided === 'string' ? provided : '';
  const expectedValue = typeof expected === 'string' ? expected : '';
  const providedDigest = crypto.createHash('sha256').update(providedValue, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expectedValue, 'utf8').digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

function validateIsoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, `${label} must be a valid YYYY-MM-DD date.`, 'invalid_date');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw httpError(400, `${label} must be a valid YYYY-MM-DD date.`, 'invalid_date');
  }
  return value;
}

function validateNumber(value, min, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw httpError(400, `${label} must be between ${min} and ${max}.`, 'invalid_measurement');
  }
  return value;
}

function roundCentimetres(value) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function measurementInCentimetres(value, unit, min, max, label) {
  const numeric = validateNumber(value, unit === 'in' ? min / CENTIMETRES_PER_INCH : min, unit === 'in' ? max / CENTIMETRES_PER_INCH : max, label);
  return roundCentimetres(unit === 'in' ? numeric * CENTIMETRES_PER_INCH : numeric);
}

function readMeasurement(source, options) {
  const hasCanonical = Object.hasOwn(source, options.canonicalKey);
  const hasDisplay = Object.hasOwn(source, options.displayKey);
  if (hasCanonical && hasDisplay) {
    throw httpError(400, `Provide either ${options.canonicalKey} or ${options.displayKey}, not both.`, 'ambiguous_measurement');
  }
  if (!hasCanonical && !hasDisplay) {
    if (options.required === false) return null;
    throw httpError(400, `${options.canonicalKey} is required.`, 'missing_measurement');
  }
  const unit = hasCanonical ? 'cm' : source.unit || source.displayUnit || 'cm';
  if (!['cm', 'in'].includes(unit)) throw httpError(400, 'Measurement unit must be cm or in.', 'invalid_unit');
  const value = hasCanonical ? source[options.canonicalKey] : source[options.displayKey];
  return measurementInCentimetres(value, unit, options.min, options.max, hasCanonical ? options.canonicalKey : options.displayKey);
}

function validateProfileId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value) || RESERVED_PROFILE_IDS.has(value)) {
    throw httpError(400, 'Profile id must use 1 to 64 letters, numbers, underscores, or hyphens.', 'invalid_profile_id');
  }
  return value;
}

function validateProfile(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) && input.profile && typeof input.profile === 'object'
    ? input.profile
    : input;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw httpError(400, 'Profile must be an object.', 'invalid_profile');
  const displayUnit = source.displayUnit || source.unit || 'cm';
  if (!['cm', 'in'].includes(displayUnit)) throw httpError(400, 'displayUnit must be cm or in.', 'invalid_unit');
  const name = source.name === undefined ? '' : source.name;
  if (typeof name !== 'string' || name.trim().length > MAX_PROFILE_NAME_LENGTH) {
    throw httpError(400, `Profile name must be ${MAX_PROFILE_NAME_LENGTH} characters or fewer.`, 'invalid_profile_name');
  }

  return {
    name: name.trim(),
    baselineLengthCm: readMeasurement(source, { canonicalKey: 'baselineLengthCm', displayKey: 'baselineLength', min: 0, max: 300 }),
    baselineDate: validateIsoDate(source.baselineDate, 'baselineDate'),
    growthRateCmPerMonth: readMeasurement(source, { canonicalKey: 'growthRateCmPerMonth', displayKey: 'growthRatePerMonth', min: 0.05, max: 5 }),
    targetLengthCm: readMeasurement(source, { canonicalKey: 'targetLengthCm', displayKey: 'targetLength', min: 0, max: 300 }),
    displayUnit
  };
}

function validateHaircut(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'Haircut must be an object.', 'invalid_haircut');
  const note = input.note === undefined ? '' : input.note;
  if (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH) {
    throw httpError(400, `Haircut note must be ${MAX_NOTE_LENGTH} characters or fewer.`, 'invalid_note');
  }
  const id = options.id || (input.id === undefined ? crypto.randomUUID() : input.id);
  if (options.id && input.id !== undefined && input.id !== options.id) {
    throw httpError(400, 'Haircut id must match the requested record.', 'haircut_id_mismatch');
  }
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(id)) {
    throw httpError(400, 'Haircut id must use 8 to 64 letters, numbers, or hyphens.', 'invalid_haircut_id');
  }
  const date = validateIsoDate(input.date, 'date');
  const preCutLengthCm = readMeasurement(input, { canonicalKey: 'preCutLengthCm', displayKey: 'preCutLength', min: 0, max: 300 });
  const postCutLengthCm = readMeasurement(input, { canonicalKey: 'postCutLengthCm', displayKey: 'postCutLength', min: 0, max: 300 });
  if (postCutLengthCm > preCutLengthCm) {
    throw httpError(400, 'postCutLengthCm must not exceed pre-cut length.', 'invalid_haircut_lengths');
  }
  const timestamp = new Date().toISOString();
  return {
    id,
    date,
    preCutLengthCm,
    postCutLengthCm,
    note: note.trim(),
    createdAt: options.createdAt || timestamp,
    updatedAt: timestamp
  };
}

function routeFor(pathname) {
  if (pathname === '/health') return { kind: 'health', allow: ['GET'] };
  if (pathname === '/version') return { kind: 'version', allow: ['GET'] };
  if (pathname === '/api/profiles') return { kind: 'profiles', allow: ['GET', 'POST'] };
  const match = pathname.match(/^\/api\/profiles\/([a-zA-Z0-9_-]{1,64})(?:\/(haircuts)(?:\/([a-zA-Z0-9-]{8,64}))?)?$/);
  if (!match) return null;
  const profileId = validateProfileId(match[1]);
  if (!match[2]) return { kind: 'profile', profileId, allow: ['GET', 'PUT', 'DELETE'] };
  if (!match[3]) return { kind: 'haircuts', profileId, allow: ['GET', 'POST'] };
  return { kind: 'haircut', profileId, haircutId: match[3], allow: ['GET', 'PUT', 'DELETE'] };
}

function parsePagination(url) {
  const limitRaw = url.searchParams.get('limit') || '100';
  const offsetRaw = url.searchParams.get('offset') || '0';
  let limit;
  let offset;
  try {
    limit = boundedInteger(limitRaw, 1, MAX_RESPONSE_PAGE, 'limit');
    offset = boundedInteger(offsetRaw, 0, 1000000, 'offset');
  } catch (error) {
    throw httpError(400, error.message, 'invalid_pagination');
  }
  return { limit, offset };
}

function securityHeaders(config, origin, requestId) {
  return {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'cross-origin-resource-policy': 'cross-origin',
    'permissions-policy': 'camera=(), geolocation=(), microphone=()',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'x-request-id': requestId,
    ...(origin && config.corsOrigins.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {})
  };
}

function sendJson(response, config, statusCode, body, origin, requestId, extraHeaders = {}) {
  if (response.destroyed || response.headersSent) return;
  const encoded = Buffer.from(JSON.stringify(body), 'utf8');
  response.writeHead(statusCode, {
    ...securityHeaders(config, origin, requestId),
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(encoded.length),
    ...extraHeaders
  });
  response.end(encoded);
}

function sendEmpty(response, config, statusCode, origin, requestId, extraHeaders = {}) {
  if (response.destroyed || response.headersSent) return;
  response.writeHead(statusCode, { ...securityHeaders(config, origin, requestId), ...extraHeaders });
  response.end();
}

function readJson(request, config) {
  const contentType = String(request.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    request.resume();
    return Promise.reject(httpError(415, 'Request body must use application/json.', 'unsupported_media_type'));
  }
  const contentEncoding = String(request.headers['content-encoding'] || 'identity').toLowerCase();
  if (contentEncoding !== 'identity') {
    request.resume();
    return Promise.reject(httpError(415, 'Compressed request bodies are not supported.', 'unsupported_content_encoding'));
  }
  const declaredLength = request.headers['content-length'];
  if (declaredLength !== undefined && Number(declaredLength) > config.maxBodyBytes) {
    request.resume();
    return Promise.reject(httpError(413, 'Request body exceeds 64 KiB.', 'body_too_large'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let bytes = 0;
    const chunks = [];
    const timer = setTimeout(() => fail(httpError(408, 'Request body was not received in time.', 'body_timeout')), config.bodyTimeoutMs);
    timer.unref?.();

    function cleanup() {
      clearTimeout(timer);
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('aborted', onAborted);
      request.off('error', onError);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      cleanup();
      request.resume();
      reject(error);
    }

    function onData(chunk) {
      bytes += chunk.length;
      if (bytes > config.maxBodyBytes) return fail(httpError(413, 'Request body exceeds 64 KiB.', 'body_too_large'));
      chunks.push(chunk);
    }

    function onEnd() {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(httpError(400, 'Request body must be valid JSON.', 'invalid_json'));
      }
    }

    function onAborted() {
      fail(httpError(400, 'Request body was interrupted.', 'body_interrupted'));
    }

    function onError() {
      fail(httpError(400, 'Request body could not be read.', 'body_read_error'));
    }

    request.on('data', onData);
    request.once('end', onEnd);
    request.once('aborted', onAborted);
    request.once('error', onError);
  });
}

function createRecord(profile, existing) {
  const timestamp = new Date().toISOString();
  return {
    profile,
    haircuts: existing?.haircuts || [],
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp
  };
}

function requireProfile(database, profileId) {
  const record = Object.hasOwn(database.profiles, profileId) ? database.profiles[profileId] : null;
  if (!record) throw httpError(404, 'Profile not found.', 'profile_not_found');
  return record;
}

function createHairGrowthService(options = {}) {
  const config = options.config || loadConfig(options.environment);
  const store = options.store || createStore({ filePath: config.dataFile });
  const sockets = new Set();

  const server = http.createServer(async (request, response) => {
    const requestId = crypto.randomUUID();
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '';
    try {
      if (!request.url || request.url.length > 2048) throw httpError(414, 'Request URL is too long.', 'url_too_long');
      const url = new URL(request.url, 'http://localhost');
      const route = routeFor(url.pathname);
      if (!route) return sendJson(response, config, 404, { error: 'Route not found.', code: 'route_not_found' }, origin, requestId);

      if (origin && !config.corsOrigins.has(origin)) {
        return sendJson(response, config, 403, { error: 'Origin is not allowed.', code: 'origin_not_allowed' }, '', requestId);
      }

      if (request.method === 'OPTIONS') {
        if (!origin || !config.corsOrigins.has(origin)) {
          return sendJson(response, config, 403, { error: 'Origin is not allowed.', code: 'origin_not_allowed' }, '', requestId);
        }
        const requestedMethod = String(request.headers['access-control-request-method'] || '').toUpperCase();
        if (!route.allow.includes(requestedMethod)) {
          return sendJson(response, config, 405, { error: 'Method not allowed.', code: 'method_not_allowed' }, origin, requestId, { allow: route.allow.join(', ') });
        }
        const requestedHeaders = String(request.headers['access-control-request-headers'] || '')
          .split(',')
          .map((header) => header.trim().toLowerCase())
          .filter(Boolean);
        if (requestedHeaders.some((header) => !['content-type', 'x-api-key'].includes(header))) {
          return sendJson(response, config, 403, { error: 'Requested headers are not allowed.', code: 'headers_not_allowed' }, origin, requestId);
        }
        return sendEmpty(response, config, 204, origin, requestId, {
          'access-control-allow-methods': route.allow.join(', '),
          'access-control-allow-headers': 'content-type, x-api-key',
          'access-control-max-age': '600'
        });
      }

      if (!route.allow.includes(request.method)) {
        return sendJson(response, config, 405, { error: 'Method not allowed.', code: 'method_not_allowed' }, origin, requestId, { allow: route.allow.join(', ') });
      }

      if (route.kind === 'health') {
        return sendJson(response, config, 200, {
          status: 'ok',
          version: config.version,
          bind: isLoopback(config.host) ? 'loopback' : 'network',
          canonicalUnit: 'cm'
        }, origin, requestId);
      }

      if (route.kind === 'version') {
        return sendJson(response, config, 200, {
          name: config.serviceName,
          version: config.version,
          canonicalUnit: 'cm',
          centimetresPerInch: CENTIMETRES_PER_INCH
        }, origin, requestId);
      }

      const providedApiKey = request.headers['x-api-key'];
      if (config.apiKey && (!timingSafeApiKeyEqual(providedApiKey, config.apiKey) || typeof providedApiKey !== 'string')) {
        return sendJson(response, config, 401, { error: 'A valid API key is required.', code: 'authentication_required' }, origin, requestId);
      }

      if (route.kind === 'profiles' && request.method === 'GET') {
        const database = await store.readDatabase();
        const { limit, offset } = parsePagination(url);
        const allProfiles = Object.entries(database.profiles)
          .map(([id, record]) => ({ id, profile: record.profile, haircutCount: (record.haircuts || []).length, createdAt: record.createdAt, updatedAt: record.updatedAt }))
          .sort((left, right) => left.id.localeCompare(right.id));
        return sendJson(response, config, 200, { total: allProfiles.length, limit, offset, items: allProfiles.slice(offset, offset + limit) }, origin, requestId);
      }

      if (route.kind === 'profiles' && request.method === 'POST') {
        const body = await readJson(request, config);
        const profileId = validateProfileId(body.id);
        const profile = validateProfile(body);
        const result = await store.transact((database) => {
          if (Object.hasOwn(database.profiles, profileId)) throw httpError(409, 'Profile already exists.', 'profile_exists');
          if (Object.keys(database.profiles).length >= config.maxProfiles) throw httpError(409, 'Profile limit reached.', 'profile_limit');
          database.profiles[profileId] = createRecord(profile);
          return database.profiles[profileId];
        });
        return sendJson(response, config, 201, { id: profileId, ...result }, origin, requestId);
      }

      if (route.kind === 'profile' && request.method === 'GET') {
        const database = await store.readDatabase();
        const record = requireProfile(database, route.profileId);
        return sendJson(response, config, 200, { id: route.profileId, ...record }, origin, requestId);
      }

      if (route.kind === 'profile' && request.method === 'PUT') {
        const profile = validateProfile(await readJson(request, config));
        const result = await store.transact((database) => {
          const existing = Object.hasOwn(database.profiles, route.profileId) ? database.profiles[route.profileId] : null;
          if (!existing && Object.keys(database.profiles).length >= config.maxProfiles) throw httpError(409, 'Profile limit reached.', 'profile_limit');
          database.profiles[route.profileId] = createRecord(profile, existing);
          return database.profiles[route.profileId];
        });
        return sendJson(response, config, 200, { id: route.profileId, ...result }, origin, requestId);
      }

      if (route.kind === 'profile' && request.method === 'DELETE') {
        const removed = await store.transact((database) => {
          if (!Object.hasOwn(database.profiles, route.profileId)) return false;
          delete database.profiles[route.profileId];
          return true;
        });
        if (!removed) throw httpError(404, 'Profile not found.', 'profile_not_found');
        return sendJson(response, config, 200, { deleted: true, id: route.profileId }, origin, requestId);
      }

      if (route.kind === 'haircuts' && request.method === 'GET') {
        const database = await store.readDatabase();
        const record = requireProfile(database, route.profileId);
        const { limit, offset } = parsePagination(url);
        const haircuts = [...(record.haircuts || [])].sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt));
        return sendJson(response, config, 200, { total: haircuts.length, limit, offset, items: haircuts.slice(offset, offset + limit) }, origin, requestId);
      }

      if (route.kind === 'haircuts' && request.method === 'POST') {
        const haircut = validateHaircut(await readJson(request, config));
        const result = await store.transact((database) => {
          const record = requireProfile(database, route.profileId);
          const haircuts = record.haircuts || [];
          if (haircuts.length >= config.maxHaircutsPerProfile) throw httpError(409, 'Haircut limit reached for this profile.', 'haircut_limit');
          if (haircuts.some((item) => item.id === haircut.id)) throw httpError(409, 'Haircut already exists.', 'haircut_exists');
          record.haircuts = [...haircuts, haircut].sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt));
          record.updatedAt = new Date().toISOString();
          return haircut;
        });
        return sendJson(response, config, 201, result, origin, requestId);
      }

      if (route.kind === 'haircut' && request.method === 'GET') {
        const database = await store.readDatabase();
        const record = requireProfile(database, route.profileId);
        const haircut = (record.haircuts || []).find((item) => item.id === route.haircutId);
        if (!haircut) throw httpError(404, 'Haircut not found.', 'haircut_not_found');
        return sendJson(response, config, 200, haircut, origin, requestId);
      }

      if (route.kind === 'haircut' && request.method === 'PUT') {
        const body = await readJson(request, config);
        const result = await store.transact((database) => {
          const record = requireProfile(database, route.profileId);
          const index = (record.haircuts || []).findIndex((item) => item.id === route.haircutId);
          if (index < 0) throw httpError(404, 'Haircut not found.', 'haircut_not_found');
          const current = record.haircuts[index];
          const haircut = validateHaircut(body, { id: route.haircutId, createdAt: current.createdAt });
          record.haircuts[index] = haircut;
          record.haircuts.sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt));
          record.updatedAt = new Date().toISOString();
          return haircut;
        });
        return sendJson(response, config, 200, result, origin, requestId);
      }

      if (route.kind === 'haircut' && request.method === 'DELETE') {
        const removed = await store.transact((database) => {
          const record = requireProfile(database, route.profileId);
          const before = (record.haircuts || []).length;
          record.haircuts = (record.haircuts || []).filter((item) => item.id !== route.haircutId);
          if (record.haircuts.length === before) return false;
          record.updatedAt = new Date().toISOString();
          return true;
        });
        if (!removed) throw httpError(404, 'Haircut not found.', 'haircut_not_found');
        return sendJson(response, config, 200, { deleted: true, id: route.haircutId }, origin, requestId);
      }

      throw httpError(404, 'Route not found.', 'route_not_found');
    } catch (error) {
      if (!response.headersSent && !response.destroyed) {
        sendJson(response, config, error.statusCode || 500, {
          error: error.statusCode ? error.message : 'The server could not complete the request.',
          code: error.statusCode ? error.code : 'internal_error'
        }, origin, requestId);
      }
    }
  });

  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = Math.min(config.headersTimeoutMs, config.requestTimeoutMs);
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 64;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });

  let closePromise;
  function listen(optionsOverride = {}) {
    const port = optionsOverride.port === undefined ? config.port : optionsOverride.port;
    const host = optionsOverride.host || config.host;
    return new Promise((resolve, reject) => {
      const onError = (error) => reject(error);
      server.once('error', onError);
      server.listen(port, host, () => {
        server.off('error', onError);
        resolve(server.address());
      });
    });
  }

  function closeGracefully(timeoutMs = 5000) {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      if (server.listening) {
        const closed = new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
        server.closeIdleConnections?.();
        const timer = setTimeout(() => {
          server.closeAllConnections?.();
          for (const socket of sockets) socket.destroy();
        }, timeoutMs);
        timer.unref?.();
        try {
          await closed;
        } finally {
          clearTimeout(timer);
        }
      }
      await store.waitForIdle();
    })();
    return closePromise;
  }

  return Object.freeze({ config, store, server, listen, closeGracefully });
}

async function startFromEnvironment(environment = process.env) {
  const config = loadConfig(environment);
  const service = createHairGrowthService({ config });
  const address = await service.listen();
  const addressLabel = typeof address === 'string' ? address : `${address.address}:${address.port}`;
  console.log(`Hair Growth API ${config.version} listening on ${addressLabel} (${isLoopback(config.host) ? 'loopback only' : 'network mode'}).`);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await service.closeGracefully();
    } catch {
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return service;
}

module.exports = {
  CENTIMETRES_PER_INCH,
  DEFAULT_VERSION,
  MAX_BODY_BYTES,
  createHairGrowthService,
  isLoopback,
  loadConfig,
  parseCorsAllowlist,
  startFromEnvironment,
  timingSafeApiKeyEqual,
  validateHaircut,
  validateIsoDate,
  validateProfile
};
