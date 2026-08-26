'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSshArguments, resolveServiceBaseUrl } = require('../../app/core/ssh');
const { hashSecret, verifySecret, factorOrder } = require('../../app/core/credentials');
const { encodeBase32, hotp } = require('../../app/core/totp');
const { createDefaultState, validateState } = require('../../app/core/state');

test('SSH arguments enforce strict persistent host-key verification without a shell bypass', () => {
  const args = buildSshArguments({ host: 'hairbox.lan', port: 22, username: 'owner', remoteApiPort: 4782, localForwardPort: 14782, keyFile: 'C:\\keys\\hair.pem' }, 'C:\\Users\\owner');
  assert.ok(args.includes('BatchMode=yes'));
  assert.ok(args.includes('StrictHostKeyChecking=yes'));
  assert.ok(args.includes('UpdateHostKeys=no'));
  assert.ok(args.includes('ExitOnForwardFailure=yes'));
  assert.ok(args.some((value) => value.includes('known_hosts')));
  assert.ok(!args.some((value) => /StrictHostKeyChecking=(?:no|off|accept-new)/i.test(value)));
  assert.ok(!args.some((value) => /UserKnownHostsFile=(?:NUL|\/dev\/null)/i.test(value)));
  assert.equal(args.at(-1), 'owner@hairbox.lan');
});

test('credential hashes verify without retaining plaintext values', () => {
  const record = hashSecret('123456', 'pin');
  assert.ok(!JSON.stringify(record).includes('123456'));
  assert.equal(verifySecret('123456', record, 'pin'), true);
  assert.equal(verifySecret('654321', record, 'pin'), false);
  assert.deepEqual(factorOrder('password+pin+totp'), ['password', 'pin', 'totp']);
});

test('TOTP implementation matches RFC 6238 vectors at 59 seconds', () => {
  const sha1Secret = encodeBase32(Buffer.from('12345678901234567890'));
  const sha256Secret = encodeBase32(Buffer.from('12345678901234567890123456789012'));
  const sha512Secret = encodeBase32(Buffer.from('1234567890123456789012345678901234567890123456789012345678901234'));
  assert.equal(hotp(sha1Secret, 1, { algorithm: 'sha1', digits: 8 }), '94287082');
  assert.equal(hotp(sha256Secret, 1, { algorithm: 'sha256', digits: 8 }), '46119246');
  assert.equal(hotp(sha512Secret, 1, { algorithm: 'sha512', digits: 8 }), '90693936');
});

test('default profile starts at adjustable 1.0 cm per month', () => {
  const defaults = createDefaultState('2026-08-24');
  assert.equal(defaults.profile.growthRateCmPerMonth, 1);
  const validated = validateState(defaults, '2026-08-24');
  assert.equal(validated.profile.growthRateCmPerMonth, 1);
  assert.equal(validated.profile.displayUnit, 'cm');
});

test('state bounds reject oversized and invalid core records', () => {
  const defaults = createDefaultState('2026-08-24');
  assert.throws(() => validateState({ ...defaults, profile: { ...defaults.profile, targetLengthCm: 301 } }, '2026-08-24'), /between/);
  assert.throws(() => validateState({ ...defaults, profile: { ...defaults.profile, baselineDate: '2026-02-30' } }, '2026-08-24'), /calendar date/);
  const huge = { ...defaults, appearance: { a: 'x'.repeat(1024 * 1024) } };
  assert.throws(() => validateState(huge, '2026-08-24'), /1 MiB/);
});

test('key paths resolve through the persistent user SSH directory', () => {
  const args = buildSshArguments({ host: '192.168.50.10', port: 2222, username: 'docker', remoteApiPort: 4782, localForwardPort: 14782, keyFile: '' }, 'C:\\Users\\owner');
  const option = args.find((value) => value.startsWith('UserKnownHostsFile='));
  assert.equal(option.slice('UserKnownHostsFile='.length), path.resolve('C:\\Users\\owner', '.ssh', 'known_hosts'));
  assert.throws(() => buildSshArguments({ host: '192.168.50.10', port: 2222, username: 'docker', remoteApiPort: 4782, localForwardPort: 14782, keyFile: 'relative-key.pem' }, 'C:\\Users\\owner'), /must be absolute/);
});

test('SSH service requests use only the validated connected local forward', () => {
  const sync = {
    mode: 'ssh',
    serverUrl: 'https://unrelated.example.test:9443/base/',
    ssh: { localForwardPort: 14782 }
  };
  assert.equal(resolveServiceBaseUrl(sync, { status: 'connected', localForwardPort: 14782 }).href, 'http://127.0.0.1:14782/');
  assert.throws(() => resolveServiceBaseUrl(sync, { status: 'connected', localForwardPort: 14783 }), /does not match/);
  assert.throws(() => resolveServiceBaseUrl(sync, { status: 'disconnected' }), /connected SSH tunnel/);
  assert.throws(() => resolveServiceBaseUrl({ ...sync, ssh: { localForwardPort: 70000 } }, { status: 'connected' }), /between 1 and 65535/);
});

test('direct service requests preserve the validated configured server URL', () => {
  const direct = resolveServiceBaseUrl({ mode: 'server', serverUrl: 'https://hair.example.test:9443/base/' }, { status: 'disconnected' });
  assert.equal(direct.href, 'https://hair.example.test:9443/base/');
  assert.equal(resolveServiceBaseUrl({ mode: 'local', serverUrl: 'http://127.0.0.1:4782/' }, { status: 'disconnected' }).href, 'http://127.0.0.1:4782/');
  assert.throws(() => resolveServiceBaseUrl({ mode: 'server', serverUrl: 'file:///tmp/hair.json' }, { status: 'disconnected' }), /HTTP or HTTPS/);
  assert.throws(() => resolveServiceBaseUrl({ mode: 'server', serverUrl: 'https://owner:secret@hair.example.test/' }, { status: 'disconnected' }), /Credentials/);
  assert.throws(() => resolveServiceBaseUrl({ mode: 'automatic', serverUrl: 'https://hair.example.test/' }, { status: 'connected' }), /local, server, or ssh/);
});
