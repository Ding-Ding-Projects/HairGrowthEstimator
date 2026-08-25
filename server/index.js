const http = require('node:http');
const crypto = require('node:crypto');
const { readDatabase, transact } = require('./store');

const VERSION = '1.0.0';
const HOST = process.env.HAIR_HOST || '127.0.0.1';
const PORT = boundedInteger(process.env.HAIR_PORT || '4782', 1, 65535, 'HAIR_PORT');
const MAX_BODY_BYTES = 64 * 1024;
const API_KEY = process.env.HAIR_API_KEY || '';
const CORS_ORIGINS = new Set((process.env.HAIR_CORS_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));

function boundedInteger(value, min, max, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  return parsed;
}

function isLoopback(host) {
  return ['127.0.0.1', '::1', 'localhost'].includes(host.toLowerCase());
}

if (!isLoopback(HOST) && API_KEY.length < 24) {
  throw new Error('HAIR_API_KEY with at least 24 characters is required when HAIR_HOST is not loopback.');
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(left || '', 'utf8');
  const b = Buffer.from(right || '', 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sendJson(response, status, body, origin) {
  const encoded = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': encoded.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(origin && CORS_ORIGINS.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {})
  });
  response.end(encoded);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body exceeds 64 KiB.'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function validateIsoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw Object.assign(new Error(`${label} must be a valid YYYY-MM-DD date.`), { statusCode: 400 });
  return value;
}

function validateLength(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 300) throw Object.assign(new Error(`${label} must be between 0 and 300 centimetres.`), { statusCode: 400 });
  return Math.round(value * 10000) / 10000;
}

function validateProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Profile must be an object.'), { statusCode: 400 });
  return {
    baselineLengthCm: validateLength(value.baselineLengthCm, 'baselineLengthCm'),
    baselineDate: validateIsoDate(value.baselineDate, 'baselineDate'),
    growthRateCmPerMonth: validateLength(value.growthRateCmPerMonth, 'growthRateCmPerMonth'),
    targetLengthCm: validateLength(value.targetLengthCm, 'targetLengthCm'),
    displayUnit: value.displayUnit === 'in' ? 'in' : 'cm'
  };
}

function validateHaircut(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Haircut must be an object.'), { statusCode: 400 });
  const note = typeof value.note === 'string' ? value.note.trim() : '';
  if (note.length > 500) throw Object.assign(new Error('Haircut note must be 500 characters or fewer.'), { statusCode: 400 });
  return {
    id: typeof value.id === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(value.id) ? value.id : crypto.randomUUID(),
    date: validateIsoDate(value.date, 'date'),
    postCutLengthCm: validateLength(value.postCutLengthCm, 'postCutLengthCm'),
    note,
    updatedAt: new Date().toISOString()
  };
}

function profileIdFrom(pathname) {
  const match = pathname.match(/^\/api\/profiles\/([a-zA-Z0-9_-]{1,64})(?:\/(haircuts)(?:\/([a-zA-Z0-9-]{8,64}))?)?$/);
  return match ? { profileId: match[1], resource: match[2], haircutId: match[3] } : null;
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (origin && !CORS_ORIGINS.has(origin)) return sendJson(response, 403, { error: 'Origin is not allowed.' });
    if (request.method === 'OPTIONS') {
      if (!origin || !CORS_ORIGINS.has(origin)) return sendJson(response, 403, { error: 'Origin is not allowed.' });
      response.writeHead(204, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,x-api-key', vary: 'Origin' });
      return response.end();
    }
    if (url.pathname === '/health' && request.method === 'GET') return sendJson(response, 200, { status: 'ok', version: VERSION, bind: isLoopback(HOST) ? 'loopback' : 'network' }, origin);
    if (url.pathname === '/version' && request.method === 'GET') return sendJson(response, 200, { name: 'hair-growth-api', version: VERSION }, origin);
    if (API_KEY && !timingSafeEqual(request.headers['x-api-key'], API_KEY)) return sendJson(response, 401, { error: 'A valid API key is required.' }, origin);

    const route = profileIdFrom(url.pathname);
    if (!route) return sendJson(response, 404, { error: 'Route not found.' }, origin);
    const { profileId, resource, haircutId } = route;

    if (!resource && request.method === 'GET') {
      const database = await readDatabase();
      return sendJson(response, 200, database.profiles[profileId] || null, origin);
    }
    if (!resource && request.method === 'PUT') {
      const body = await readJson(request);
      const profile = validateProfile(body.profile);
      const result = await transact((database) => {
        const current = database.profiles[profileId] || { haircuts: [] };
        database.profiles[profileId] = { profile, haircuts: current.haircuts || [], updatedAt: new Date().toISOString() };
        return database.profiles[profileId];
      });
      return sendJson(response, 200, result, origin);
    }
    if (resource === 'haircuts' && request.method === 'POST' && !haircutId) {
      const haircut = validateHaircut(await readJson(request));
      const result = await transact((database) => {
        const current = database.profiles[profileId] || { profile: null, haircuts: [] };
        current.haircuts = [...(current.haircuts || []).filter((item) => item.id !== haircut.id), haircut].sort((a, b) => b.date.localeCompare(a.date));
        current.updatedAt = new Date().toISOString();
        database.profiles[profileId] = current;
        return haircut;
      });
      return sendJson(response, 201, result, origin);
    }
    if (resource === 'haircuts' && request.method === 'DELETE' && haircutId) {
      const removed = await transact((database) => {
        const current = database.profiles[profileId];
        if (!current) return false;
        const before = current.haircuts.length;
        current.haircuts = current.haircuts.filter((item) => item.id !== haircutId);
        current.updatedAt = new Date().toISOString();
        return current.haircuts.length !== before;
      });
      return sendJson(response, removed ? 200 : 404, removed ? { deleted: true } : { error: 'Haircut not found.' }, origin);
    }
    return sendJson(response, 405, { error: 'Method not allowed.' }, origin);
  } catch (error) {
    if (!response.headersSent) sendJson(response, error.statusCode || 500, { error: error.statusCode ? error.message : 'The server could not complete the request.' }, origin);
  }
});

server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(PORT, HOST, () => {
  console.log(`Hair Growth API ${VERSION} listening on ${HOST}:${PORT} (${isLoopback(HOST) ? 'loopback only' : 'private network mode'}).`);
});
