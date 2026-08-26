'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function networkPolicy() {
  return require('../../app/core/network-policy');
}

function apiSource(url = 'https://settings.example.test/v1/current?profile=work') {
  return { type: 'api', url };
}

function homeAssistantSource(overrides = {}) {
  return {
    type: 'home-assistant',
    baseUrl: 'https://home.hair.lan:8123/',
    entityId: 'input_boolean.hair_work_mode',
    credentialRef: 'home-assistant:primary',
    ...overrides
  };
}

function records(...addresses) {
  const { isIP } = require('node:net');
  return addresses.map((address) => ({ address, family: isIP(address) }));
}

function approvedScope(source, kind, origin, addresses) {
  const { canonicalScheduledSourceScope, createApprovedNetworkScope } = networkPolicy();
  return createApprovedNetworkScope({
    kind,
    canonicalSourceScope: canonicalScheduledSourceScope(source),
    origin,
    addresses
  });
}

test('exports the complete immutable address-category contract', () => {
  const { ADDRESS_CATEGORIES, MAX_RESOLVED_ADDRESSES } = networkPolicy();
  assert.deepEqual(ADDRESS_CATEGORIES, [
    'public',
    'loopback',
    'private',
    'link-local',
    'metadata',
    'unspecified',
    'multicast',
    'reserved',
    'ipv4-mapped'
  ]);
  assert.equal(Object.isFrozen(ADDRESS_CATEGORIES), true);
  assert.equal(MAX_RESOLVED_ADDRESSES, 16);
});

test('classifies globally reachable IPv4 and IPv6 addresses as public', () => {
  const { classifyIpAddress } = networkPolicy();
  assert.deepEqual(classifyIpAddress('8.8.8.8'), {
    address: '8.8.8.8',
    family: 4,
    category: 'public'
  });
  assert.deepEqual(classifyIpAddress('2001:4860:4860::8888'), {
    address: '2001:4860:4860::8888',
    family: 6,
    category: 'public'
  });
});

test('classifies every blocked IPv4 scope with metadata taking precedence', () => {
  const { classifyIpAddress } = networkPolicy();
  const examples = new Map([
    ['127.0.0.1', 'loopback'],
    ['10.1.2.3', 'private'],
    ['172.31.255.254', 'private'],
    ['192.168.50.233', 'private'],
    ['169.254.40.2', 'link-local'],
    ['169.254.169.254', 'metadata'],
    ['168.63.129.16', 'metadata'],
    ['100.100.100.200', 'metadata'],
    ['0.0.0.0', 'unspecified'],
    ['224.0.0.1', 'multicast'],
    ['100.64.0.1', 'reserved'],
    ['192.0.2.1', 'reserved'],
    ['198.18.0.1', 'reserved'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'reserved']
  ]);
  for (const [address, category] of examples) {
    assert.equal(classifyIpAddress(address).category, category, address);
  }
});

test('classifies every blocked IPv6 scope including mapped and special ranges', () => {
  const { classifyIpAddress } = networkPolicy();
  const examples = new Map([
    ['::1', 'loopback'],
    ['fd12:3456::1', 'private'],
    ['fe80::1', 'link-local'],
    ['fd00:ec2::254', 'metadata'],
    ['::', 'unspecified'],
    ['ff02::1', 'multicast'],
    ['2001:db8::1', 'reserved'],
    ['3fff::1', 'reserved'],
    ['64:ff9b::1', 'reserved'],
    ['::ffff:127.0.0.1', 'ipv4-mapped']
  ]);
  for (const [address, category] of examples) {
    assert.equal(classifyIpAddress(address).category, category, address);
  }
});

test('rejects malformed literals, zone identifiers, and noncanonical numeric aliases', () => {
  const { classifyHost, classifyIpAddress } = networkPolicy();
  assert.throws(() => classifyIpAddress('fe80::1%5'), { code: 'ERR_NETWORK_ADDRESS_INVALID' });
  assert.throws(() => classifyIpAddress('999.1.1.1'), { code: 'ERR_NETWORK_ADDRESS_INVALID' });
  for (const alias of ['2130706433', '0x7f000001', '0177.0.0.1', '127.1']) {
    assert.equal(classifyHost(alias).category, 'numeric-alias', alias);
  }
  assert.equal(classifyHost('metadata.google.internal').category, 'metadata');
  assert.throws(() => classifyHost('bad host name'), { code: 'ERR_NETWORK_HOST_INVALID' });
});

test('creates an immutable public HTTPS plan only after every address is public', () => {
  const { createScheduledSourceNetworkPlan } = networkPolicy();
  const plan = createScheduledSourceNetworkPlan({
    source: apiSource(),
    resolvedAddresses: records('93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946')
  });
  assert.equal(plan.canonicalSourceScope, 'api:https://settings.example.test/v1/current?profile=work');
  assert.equal(plan.url, 'https://settings.example.test/v1/current?profile=work');
  assert.equal(plan.hostname, 'settings.example.test');
  assert.equal(plan.port, 443);
  assert.equal(plan.addressScope, 'public');
  assert.deepEqual(plan.addresses, records('93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'));
  assert.deepEqual(plan.redirectPolicy, { redirect: 'error', maxRedirects: 0 });
  assert.deepEqual(plan.tls, {
    rejectUnauthorized: true,
    verificationHost: 'settings.example.test',
    servername: 'settings.example.test',
    checkServerIdentity: 'node-default'
  });
  assert.equal(plan.credentialBinding, null);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.addresses), true);
  assert.equal(Object.isFrozen(plan.tls), true);
});

test('fails closed when any DNS answer is unsafe even if another answer is public', () => {
  const { createScheduledSourceNetworkPlan } = networkPolicy();
  const unsafeAnswers = [
    '127.0.0.1',
    '10.0.0.8',
    '169.254.169.254',
    '0.0.0.0',
    '224.0.0.1',
    '192.0.2.4',
    '::ffff:127.0.0.1'
  ];
  for (const address of unsafeAnswers) {
    assert.throws(
      () => createScheduledSourceNetworkPlan({
        source: apiSource(),
        resolvedAddresses: records('93.184.216.34', address)
      }),
      { code: 'ERR_NETWORK_ADDRESS_SCOPE' },
      address
    );
  }
});

test('rejects empty, oversized, duplicate, malformed, and family-mismatched resolutions', () => {
  const { MAX_RESOLVED_ADDRESSES, createScheduledSourceNetworkPlan } = networkPolicy();
  const source = apiSource();
  assert.throws(
    () => createScheduledSourceNetworkPlan({ source, resolvedAddresses: [] }),
    { code: 'ERR_NETWORK_RESOLUTION_EMPTY' }
  );
  assert.throws(
    () => createScheduledSourceNetworkPlan({
      source,
      resolvedAddresses: Array.from({ length: MAX_RESOLVED_ADDRESSES + 1 }, (_, index) => ({
        address: `8.8.8.${index + 1}`,
        family: 4
      }))
    }),
    { code: 'ERR_NETWORK_RESOLUTION_LIMIT' }
  );
  assert.throws(
    () => createScheduledSourceNetworkPlan({ source, resolvedAddresses: records('8.8.8.8', '8.8.8.8') }),
    { code: 'ERR_NETWORK_RESOLUTION_DUPLICATE' }
  );
  assert.throws(
    () => createScheduledSourceNetworkPlan({ source, resolvedAddresses: [{ address: 'not-an-ip', family: 4 }] }),
    { code: 'ERR_NETWORK_ADDRESS_INVALID' }
  );
  assert.throws(
    () => createScheduledSourceNetworkPlan({ source, resolvedAddresses: [{ address: '8.8.8.8', family: 6 }] }),
    { code: 'ERR_NETWORK_ADDRESS_FAMILY' }
  );
});

test('permits exact loopback HTTP only through a matching explicit approval', () => {
  const { createScheduledSourceNetworkPlan } = networkPolicy();
  const source = apiSource('http://localhost:8123/v1/current');
  const resolvedAddresses = records('127.0.0.1', '::1');
  assert.throws(
    () => createScheduledSourceNetworkPlan({ source, resolvedAddresses }),
    { code: 'ERR_NETWORK_HTTP_SCOPE' }
  );
  const approval = approvedScope(source, 'loopback', 'http://localhost:8123', ['127.0.0.1', '::1']);
  const plan = createScheduledSourceNetworkPlan({ source, resolvedAddresses, approvedScope: approval });
  assert.equal(plan.addressScope, 'loopback');
  assert.equal(plan.protocol, 'http:');
  assert.equal(plan.tls, null);
  assert.equal(plan.approvalKind, 'loopback');
});

test('an approval cannot be forged, widened, or reused for another source', () => {
  const { createApprovedNetworkScope, createScheduledSourceNetworkPlan } = networkPolicy();
  const source = apiSource('http://localhost:8123/v1/current');
  const approval = approvedScope(source, 'loopback', 'http://localhost:8123', ['127.0.0.1']);
  assert.throws(
    () => createScheduledSourceNetworkPlan({
      source,
      resolvedAddresses: records('127.0.0.1'),
      approvedScope: { ...approval }
    }),
    { code: 'ERR_NETWORK_APPROVAL_UNOBSERVED' }
  );
  assert.throws(
    () => createScheduledSourceNetworkPlan({
      source: apiSource('http://localhost:8123/v1/other'),
      resolvedAddresses: records('127.0.0.1'),
      approvedScope: approval
    }),
    { code: 'ERR_NETWORK_APPROVAL_SCOPE' }
  );
  assert.throws(
    () => createScheduledSourceNetworkPlan({
      source,
      resolvedAddresses: records('127.0.0.1', '127.0.0.2'),
      approvedScope: approval
    }),
    { code: 'ERR_NETWORK_APPROVAL_ADDRESSES' }
  );
  assert.throws(
    () => createApprovedNetworkScope({
      kind: 'loopback',
      canonicalSourceScope: 'api:http://localhost:8123/v1/current',
      origin: 'http://localhost:8123',
      addresses: ['127.0.0.1', '10.0.0.1']
    }),
    { code: 'ERR_NETWORK_APPROVAL_ADDRESS_SCOPE' }
  );
});

test('permits an exact approved private LAN source without admitting link-local or metadata addresses', () => {
  const { createApprovedNetworkScope, createScheduledSourceNetworkPlan } = networkPolicy();
  const source = homeAssistantSource();
  const approval = approvedScope(source, 'private-lan', 'https://home.hair.lan:8123', ['192.168.50.242', 'fd12:3456::242']);
  const plan = createScheduledSourceNetworkPlan({
    source,
    resolvedAddresses: records('192.168.50.242', 'fd12:3456::242'),
    approvedScope: approval
  });
  assert.equal(plan.addressScope, 'private');
  assert.equal(plan.approvalKind, 'private-lan');
  for (const address of ['169.254.40.2', '169.254.169.254', 'fe80::1', 'fd00:ec2::254']) {
    assert.throws(
      () => createApprovedNetworkScope({
        kind: 'private-lan',
        canonicalSourceScope: plan.canonicalSourceScope,
        origin: 'https://home.hair.lan:8123',
        addresses: [address]
      }),
      { code: 'ERR_NETWORK_APPROVAL_ADDRESS_SCOPE' },
      address
    );
  }
});

test('pins an IP-literal source to the exact literal and rejects numeric URL aliases', () => {
  const { createScheduledSourceNetworkPlan } = networkPolicy();
  const source = apiSource('https://8.8.8.8/v1/current');
  const plan = createScheduledSourceNetworkPlan({ source, resolvedAddresses: records('8.8.8.8') });
  assert.equal(plan.hostname, '8.8.8.8');
  assert.deepEqual(plan.addresses, records('8.8.8.8'));
  assert.throws(
    () => createScheduledSourceNetworkPlan({
      source: apiSource('https://2130706433/v1/current'),
      resolvedAddresses: records('127.0.0.1')
    }),
    { code: 'ERR_NETWORK_NUMERIC_ALIAS' }
  );
  assert.throws(
    () => createScheduledSourceNetworkPlan({
      source: apiSource('https://127.1/v1/current'),
      resolvedAddresses: records('127.0.0.1')
    }),
    { code: 'ERR_NETWORK_NUMERIC_ALIAS' }
  );
});

test('requires canonical HTTPS, certificate host verification, and a zero-redirect policy', () => {
  const { createScheduledSourceNetworkPlan } = networkPolicy();
  for (const url of [
    'HTTP://settings.example.test/v1/current',
    'https://settings.example.test:443/v1/current',
    'https://owner:secret@settings.example.test/v1/current',
    'https://settings.example.test/v1/current#fragment'
  ]) {
    assert.throws(
      () => createScheduledSourceNetworkPlan({ source: apiSource(url), resolvedAddresses: records('93.184.216.34') }),
      { code: /^ERR_NETWORK_/ }
    );
  }
  const plan = createScheduledSourceNetworkPlan({
    source: apiSource(),
    resolvedAddresses: records('93.184.216.34')
  });
  assert.equal(plan.redirectPolicy.redirect, 'error');
  assert.equal(plan.redirectPolicy.maxRedirects, 0);
  assert.equal(plan.tls.rejectUnauthorized, true);
  assert.equal(plan.tls.verificationHost, plan.hostname);
  assert.equal(plan.tls.checkServerIdentity, 'node-default');
});

test('binds a Home Assistant credential reference to one exact canonical source and request', () => {
  const { canonicalScheduledSourceScope, createScheduledSourceNetworkPlan } = networkPolicy();
  const source = homeAssistantSource({ baseUrl: 'https://home.example.test/' });
  const plan = createScheduledSourceNetworkPlan({
    source,
    resolvedAddresses: records('93.184.216.34')
  });
  assert.equal(
    canonicalScheduledSourceScope(source),
    'home-assistant:https://home.example.test/|input_boolean.hair_work_mode|home-assistant:primary'
  );
  assert.deepEqual(plan.credentialBinding, {
    credentialRef: 'home-assistant:primary',
    canonicalSourceScope: 'home-assistant:https://home.example.test/|input_boolean.hair_work_mode|home-assistant:primary',
    requestOrigin: 'https://home.example.test',
    requestUrl: 'https://home.example.test/api/states/input_boolean.hair_work_mode'
  });
  assert.equal(Object.isFrozen(plan.credentialBinding), true);
});

test('rejects credential material without reflecting it through results or errors', () => {
  const { createScheduledSourceNetworkPlan } = networkPolicy();
  const secretValue = 'do-not-reflect-this-value';
  let caught;
  try {
    createScheduledSourceNetworkPlan({
      source: { ...homeAssistantSource({ baseUrl: 'https://home.example.test/' }), accessToken: secretValue },
      resolvedAddresses: records('93.184.216.34')
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(caught.code, 'ERR_NETWORK_SOURCE_FIELDS');
  assert.equal(String(caught).includes(secretValue), false);
  assert.equal(JSON.stringify(caught).includes(secretValue), false);
});

test('the pinned lookup never performs another resolution or accepts another hostname', async () => {
  const { createPinnedLookup, createScheduledSourceNetworkPlan } = networkPolicy();
  const plan = createScheduledSourceNetworkPlan({
    source: apiSource(),
    resolvedAddresses: records('93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946')
  });
  const lookup = createPinnedLookup(plan);
  const all = await new Promise((resolve, reject) => {
    lookup(plan.hostname, { all: true, family: 0, order: 'verbatim' }, (error, answer) => {
      if (error) reject(error);
      else resolve(answer);
    });
  });
  assert.deepEqual(all, plan.addresses);
  assert.notEqual(all, plan.addresses);
  const oneV6 = await new Promise((resolve, reject) => {
    lookup(plan.hostname, { all: false, family: 6 }, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
    });
  });
  assert.deepEqual(oneV6, { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 });
  await assert.rejects(
    new Promise((resolve, reject) => {
      lookup('other.example.test', { all: true }, (error, answer) => error ? reject(error) : resolve(answer));
    }),
    { code: 'ERR_NETWORK_LOOKUP_HOST' }
  );
  await assert.rejects(
    new Promise((resolve, reject) => {
      lookup(plan.hostname, { all: false, family: 7 }, (error, answer) => error ? reject(error) : resolve(answer));
    }),
    { code: 'ERR_NETWORK_LOOKUP_OPTIONS' }
  );
});

test('createPinnedLookup rejects a forged or mutable connection plan', () => {
  const { createPinnedLookup, createScheduledSourceNetworkPlan } = networkPolicy();
  const plan = createScheduledSourceNetworkPlan({
    source: apiSource(),
    resolvedAddresses: records('93.184.216.34')
  });
  assert.throws(() => createPinnedLookup({ ...plan }), { code: 'ERR_NETWORK_PLAN_UNOBSERVED' });
  assert.equal(typeof createPinnedLookup(plan), 'function');
});
