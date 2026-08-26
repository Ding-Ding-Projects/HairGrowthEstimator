'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createStore } = require('../../server/store');
const {
  CENTIMETRES_PER_INCH,
  MAX_BODY_BYTES,
  createHairGrowthService,
  loadConfig,
  timingSafeApiKeyEqual,
  validateHaircut,
  validateProfile
} = require('../../server/service');

const API_KEY = 'focused-test-key-0123456789abcdef';
const ALLOWED_ORIGIN = 'https://hair.example.test';

async function readResponse(response) {
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null
  };
}

test('service profile growth-rate validation matches the desktop 0.05 through 5 cm range', () => {
  const source = {
    baselineLengthCm: 1,
    baselineDate: '2026-08-01',
    growthRateCmPerMonth: 1,
    targetLengthCm: 20,
    displayUnit: 'cm'
  };
  assert.equal(validateProfile({ ...source, growthRateCmPerMonth: 0.05 }).growthRateCmPerMonth, 0.05);
  assert.equal(validateProfile({ ...source, growthRateCmPerMonth: 5 }).growthRateCmPerMonth, 5);
  assert.throws(() => validateProfile({ ...source, growthRateCmPerMonth: 0.0499 }), /between 0.05 and 5/);
  assert.throws(() => validateProfile({ ...source, growthRateCmPerMonth: 5.0001 }), /between 0.05 and 5/);
});

test('service haircut validation requires both lengths and forbids apparent growth during a cut', () => {
  const source = {
    id: 'cut-00000001',
    date: '2026-08-20',
    preCutLengthCm: 10,
    postCutLengthCm: 4,
    note: ''
  };
  assert.equal(validateHaircut(source).preCutLengthCm, 10);
  const { preCutLengthCm: _omitted, ...withoutPreCutLength } = source;
  assert.throws(() => validateHaircut(withoutPreCutLength), /preCutLengthCm is required/);
  assert.throws(() => validateHaircut({ ...source, postCutLengthCm: 10.0001 }), /must not exceed pre-cut length/);
});

test('hair growth HTTP service contract', async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'hair-growth-service-'));
  const dataFile = path.join(temporaryDirectory, 'hair-growth.json');
  const config = loadConfig({
    HAIR_HOST: '127.0.0.1',
    HAIR_PORT: '4782',
    HAIR_DATA_FILE: dataFile,
    HAIR_API_KEY: API_KEY,
    HAIR_CORS_ORIGINS: ALLOWED_ORIGIN,
    HAIR_BODY_TIMEOUT_MS: '1000',
    HAIR_REQUEST_TIMEOUT_MS: '5000',
    HAIR_HEADERS_TIMEOUT_MS: '5000'
  });
  const store = createStore({ filePath: dataFile });
  const service = createHairGrowthService({ config, store });
  const address = await service.listen({ port: 0, host: '127.0.0.1' });
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await service.closeGracefully();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function request(pathname, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.key !== null) headers.set('x-api-key', options.key === undefined ? API_KEY : options.key);
    if (options.origin) headers.set('origin', options.origin);
    let body;
    if (options.body !== undefined) {
      headers.set('content-type', options.contentType || 'application/json');
      body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }
    return readResponse(await fetch(`${baseUrl}${pathname}`, {
      method: options.method || 'GET',
      headers,
      body
    }));
  }

  await t.test('requires a strong key for non-loopback binds and compares key digests safely', () => {
    assert.throws(() => loadConfig({ HAIR_HOST: '0.0.0.0', HAIR_PORT: '4782' }), /strong HAIR_API_KEY/);
    assert.doesNotThrow(() => loadConfig({ HAIR_HOST: '0.0.0.0', HAIR_PORT: '4782', HAIR_API_KEY: API_KEY }));
    assert.equal(timingSafeApiKeyEqual(API_KEY, API_KEY), true);
    assert.equal(timingSafeApiKeyEqual('short', API_KEY), false);
    assert.equal(timingSafeApiKeyEqual(undefined, API_KEY), false);
  });

  await t.test('exposes public health and version data without exposing protected records', async () => {
    const health = await request('/health', { key: null });
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { status: 'ok', version: '1.0.0', bind: 'loopback', canonicalUnit: 'cm' });
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.headers.get('x-frame-options'), 'DENY');
    assert.match(health.headers.get('content-security-policy'), /default-src 'none'/);
    assert.ok(health.headers.get('x-request-id'));

    const version = await request('/version', { key: null });
    assert.equal(version.status, 200);
    assert.equal(version.body.centimetresPerInch, CENTIMETRES_PER_INCH);
    assert.equal(version.body.canonicalUnit, 'cm');

    assert.equal((await request('/api/profiles', { key: null })).status, 401);
    assert.equal((await request('/api/profiles', { key: 'wrong-key' })).status, 401);
  });

  await t.test('applies an explicit CORS allowlist and validates preflight requests', async () => {
    const allowed = await request('/health', { key: null, origin: ALLOWED_ORIGIN });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
    assert.equal(allowed.headers.get('vary'), 'Origin');

    const refused = await request('/health', { key: null, origin: 'https://not-allowed.example' });
    assert.equal(refused.status, 403);
    assert.equal(refused.headers.get('access-control-allow-origin'), null);

    const preflight = await request('/api/profiles/primary', {
      method: 'OPTIONS',
      key: null,
      origin: ALLOWED_ORIGIN,
      headers: {
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type, x-api-key'
      }
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-methods'), /PUT/);

    const refusedHeaders = await request('/api/profiles/primary', {
      method: 'OPTIONS',
      key: null,
      origin: ALLOWED_ORIGIN,
      headers: {
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'authorization'
      }
    });
    assert.equal(refusedHeaders.status, 403);
  });

  await t.test('stores cm canonically while accepting exact inch inputs', async () => {
    const created = await request('/api/profiles', {
      method: 'POST',
      body: {
        id: 'primary',
        profile: {
          name: 'Primary',
          baselineLength: 1,
          baselineDate: '2026-08-01',
          growthRatePerMonth: 0.5,
          targetLength: 4,
          displayUnit: 'in'
        }
      }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.profile.baselineLengthCm, 2.54);
    assert.equal(created.body.profile.growthRateCmPerMonth, 1.27);
    assert.equal(created.body.profile.targetLengthCm, 10.16);
    assert.equal(created.body.profile.displayUnit, 'in');

    const listed = await request('/api/profiles?limit=10&offset=0');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.total, 1);
    assert.equal(listed.body.items[0].id, 'primary');
    assert.equal(listed.body.items[0].haircutCount, 0);

    const updated = await request('/api/profiles/primary', {
      method: 'PUT',
      body: {
        profile: {
          name: 'Primary profile',
          baselineLengthCm: 3.5,
          baselineDate: '2026-08-02',
          growthRateCmPerMonth: 1.25,
          targetLengthCm: 20,
          displayUnit: 'cm'
        }
      }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.profile.baselineLengthCm, 3.5);

    const fetched = await request('/api/profiles/primary');
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.profile.name, 'Primary profile');
  });

  let haircutId;
  await t.test('creates, lists, reads, updates, and deletes complete haircut records', async () => {
    const created = await request('/api/profiles/primary/haircuts', {
      method: 'POST',
      body: {
        id: 'cut-00000001',
        date: '2026-08-20',
        preCutLength: 4,
        postCutLength: 2,
        unit: 'in',
        note: 'Summer reset'
      }
    });
    assert.equal(created.status, 201);
    haircutId = created.body.id;
    assert.equal(created.body.preCutLengthCm, 10.16);
    assert.equal(created.body.postCutLengthCm, 5.08);
    assert.equal(created.body.note, 'Summer reset');

    const listed = await request('/api/profiles/primary/haircuts?limit=20');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.total, 1);
    assert.equal(listed.body.items[0].id, haircutId);

    const fetched = await request(`/api/profiles/primary/haircuts/${haircutId}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.preCutLengthCm, 10.16);

    const updated = await request(`/api/profiles/primary/haircuts/${haircutId}`, {
      method: 'PUT',
      body: {
        date: '2026-08-21',
        preCutLengthCm: 10,
        postCutLengthCm: 4,
        note: 'Updated measurement'
      }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.id, haircutId);
    assert.equal(updated.body.date, '2026-08-21');
    assert.equal(updated.body.createdAt, created.body.createdAt);
    assert.equal(updated.body.note, 'Updated measurement');

    const mismatchedId = await request(`/api/profiles/primary/haircuts/${haircutId}`, {
      method: 'PUT',
      body: {
        id: 'different-00000001',
        date: '2026-08-22',
        postCutLengthCm: 1,
        note: ''
      }
    });
    assert.equal(mismatchedId.status, 400);
    assert.equal(mismatchedId.body.code, 'haircut_id_mismatch');

    const deleted = await request(`/api/profiles/primary/haircuts/${haircutId}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.deleted, true);
    assert.equal((await request(`/api/profiles/primary/haircuts/${haircutId}`)).status, 404);
  });

  await t.test('rejects impossible dates, out-of-range values, oversized bodies, and unsupported methods', async () => {
    const impossibleDate = await request('/api/profiles/primary/haircuts', {
      method: 'POST',
      body: { date: '2026-02-30', postCutLengthCm: 1, note: '' }
    });
    assert.equal(impossibleDate.status, 400);
    assert.equal(impossibleDate.body.code, 'invalid_date');

    const outOfRange = await request('/api/profiles/primary/haircuts', {
      method: 'POST',
      body: { date: '2026-08-22', preCutLengthCm: 300, postCutLengthCm: 300.0001, note: '' }
    });
    assert.equal(outOfRange.status, 400);
    assert.equal(outOfRange.body.code, 'invalid_measurement');

    const oversized = await request('/api/profiles/primary/haircuts', {
      method: 'POST',
      body: JSON.stringify({ note: 'x'.repeat(MAX_BODY_BYTES + 1) })
    });
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.code, 'body_too_large');

    const unsupported = await request('/api/profiles/primary', { method: 'PATCH', body: {} });
    assert.equal(unsupported.status, 405);
    assert.match(unsupported.headers.get('allow'), /PUT/);
  });

  await t.test('ends slow request bodies at the configured deadline', async () => {
    const result = await new Promise((resolve, reject) => {
      const clientRequest = http.request({
        host: '127.0.0.1',
        port: address.port,
        path: '/api/profiles/primary/haircuts',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': API_KEY
        }
      }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
          clientRequest.destroy();
        });
      });
      clientRequest.setTimeout(4000, () => clientRequest.destroy(new Error('The slow-body test timed out.')));
      clientRequest.on('error', reject);
      clientRequest.write('{"date":"2026-08-22",');
    });
    assert.equal(result.status, 408);
    assert.equal(result.body.code, 'body_timeout');
  });

  await t.test('serializes concurrent writes and leaves one valid atomic data file', async () => {
    const profile = await request('/api/profiles/concurrent', {
      method: 'PUT',
      body: {
        profile: {
          name: 'Concurrency',
          baselineLengthCm: 1,
          baselineDate: '2026-08-01',
          growthRateCmPerMonth: 1,
          targetLengthCm: 30,
          displayUnit: 'cm'
        }
      }
    });
    assert.equal(profile.status, 200);

    const writes = Array.from({ length: 30 }, (_value, index) => request('/api/profiles/concurrent/haircuts', {
      method: 'POST',
      body: {
        id: `batch-${String(index).padStart(8, '0')}`,
        date: `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
        preCutLengthCm: 10,
        postCutLengthCm: index / 10,
        note: `Batch ${index}`
      }
    }));
    const results = await Promise.all(writes);
    assert.equal(results.filter((result) => result.status === 201).length, 30);
    await store.waitForIdle();

    const persisted = JSON.parse(await fs.readFile(dataFile, 'utf8'));
    assert.equal(persisted.version, 1);
    assert.equal(persisted.profiles.concurrent.haircuts.length, 30);
    const siblings = await fs.readdir(temporaryDirectory);
    assert.deepEqual(siblings, ['hair-growth.json']);
  });

  await t.test('deletes profile records without affecting other profiles', async () => {
    const deleted = await request('/api/profiles/concurrent', { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.deleted, true);
    assert.equal((await request('/api/profiles/concurrent')).status, 404);
    assert.equal((await request('/api/profiles/primary')).status, 200);
  });
});
