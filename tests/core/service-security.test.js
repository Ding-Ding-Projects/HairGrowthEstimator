'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createServiceCredentialRecord,
  isPublicServiceEndpoint,
  resolveServiceSecurityContext,
  serviceCredentialHeaders
} = require('../../app/core/service-security');

const VALID_KEY = 'a'.repeat(24);

function direct(serverUrl, mode = 'server') {
  return resolveServiceSecurityContext({ mode, serverUrl }, { status: 'disconnected' });
}

function sshSettings(overrides = {}) {
  return {
    mode: 'ssh',
    ssh: {
      host: 'HAIRBOX.LAN',
      port: 22,
      remoteApiPort: 4782,
      localForwardPort: 14782,
      ...overrides
    }
  };
}

function connectedTunnel(overrides = {}) {
  return {
    status: 'connected',
    host: 'hairbox.lan',
    port: 22,
    remoteApiPort: 4782,
    localForwardPort: 14782,
    ...overrides
  };
}

test('direct loopback HTTP URLs are canonicalized and accepted', () => {
  const localhost = direct('http://LOCALHOST:4782/api');
  assert.deepEqual(localhost, {
    mode: 'server',
    transport: 'direct-http-loopback',
    baseUrl: 'http://localhost:4782/api/',
    credentialScope: 'http://localhost:4782'
  });
  assert.equal(direct('http://127.12.3.4:4782/').credentialScope, 'http://127.12.3.4:4782');
  assert.equal(direct('http://[::1]:4782/').credentialScope, 'http://[::1]:4782');
  assert.equal(direct('http://127.0.0.1:4782/', 'local').mode, 'local');
});

test('direct non-loopback HTTP is rejected while HTTPS is canonicalized', () => {
  assert.throws(() => direct('http://hair.example.test:4782/'), /HTTPS is required/);
  assert.deepEqual(direct('https://HAIR.Example.test:443/api'), {
    mode: 'server',
    transport: 'direct-https',
    baseUrl: 'https://hair.example.test/api/',
    credentialScope: 'https://hair.example.test'
  });
});

test('invalid URLs and unexpected protocols are rejected', () => {
  assert.throws(() => direct('not a URL'), /valid HTTP or HTTPS/);
  assert.throws(() => direct('file:///tmp/hair.json'), /Only HTTP or HTTPS/);
  assert.throws(() => direct('ssh://hair.example.test/'), /Only HTTP or HTTPS/);
  assert.throws(() => direct(`https://${'a'.repeat(2050)}.test/`), /at most 2048/);
  assert.throws(() => resolveServiceSecurityContext({ mode: 'automatic', serverUrl: 'https://hair.example.test/' }), /local, server, or ssh/);
});

test('userinfo, query strings, and fragments are rejected from service base URLs', () => {
  assert.throws(() => direct('https://owner:secret@hair.example.test/'), /Credentials must not be embedded/);
  assert.throws(() => direct('https://hair.example.test/?profile=owner'), /query string/);
  assert.throws(() => direct('https://hair.example.test/#settings'), /fragment/);
});

test('an active matching SSH tunnel produces a canonical forwarded scope', () => {
  assert.deepEqual(resolveServiceSecurityContext(sshSettings(), connectedTunnel()), {
    mode: 'ssh',
    transport: 'ssh-forward',
    baseUrl: 'http://127.0.0.1:14782/',
    credentialScope: 'ssh://hairbox.lan:22/127.0.0.1:4782'
  });
  const ipv6 = resolveServiceSecurityContext(
    sshSettings({ host: '[2001:DB8::4]', port: 2222 }),
    connectedTunnel({ host: '2001:db8::4', port: 2222 })
  );
  assert.equal(ipv6.credentialScope, 'ssh://[2001:db8::4]:2222/127.0.0.1:4782');
});

test('inactive and mismatched SSH tunnels are rejected', () => {
  assert.throws(() => resolveServiceSecurityContext(sshSettings(), connectedTunnel({ status: 'disconnected' })), /connected SSH tunnel/);
  assert.throws(() => resolveServiceSecurityContext(sshSettings(), connectedTunnel({ localForwardPort: 14783 })), /local forwarded port/);
  assert.throws(() => resolveServiceSecurityContext(sshSettings(), connectedTunnel({ host: 'other.lan' })), /host/);
  assert.throws(() => resolveServiceSecurityContext(sshSettings(), connectedTunnel({ port: 2222 })), /SSH port/);
  assert.throws(() => resolveServiceSecurityContext(sshSettings(), connectedTunnel({ remoteApiPort: 4783 })), /remote API port/);
});

test('malformed SSH identities and port values are rejected', () => {
  assert.throws(() => resolveServiceSecurityContext(sshSettings({ host: 'owner@hairbox.lan' }), connectedTunnel()), /valid SSH host/);
  assert.throws(() => resolveServiceSecurityContext(sshSettings({ host: 'hairbox.lan#fragment' }), connectedTunnel()), /valid SSH host/);
  assert.throws(() => resolveServiceSecurityContext(sshSettings({ port: 0 }), connectedTunnel()), /between 1 and 65535/);
  assert.throws(() => resolveServiceSecurityContext(sshSettings({ remoteApiPort: 70000 }), connectedTunnel()), /between 1 and 65535/);
});

test('health and version endpoints are always public', () => {
  assert.equal(isPublicServiceEndpoint('/health'), true);
  assert.equal(isPublicServiceEndpoint('/health?details=1'), true);
  assert.equal(isPublicServiceEndpoint('/version'), true);
  assert.equal(isPublicServiceEndpoint('/version?format=json'), true);
  assert.equal(isPublicServiceEndpoint('/profiles'), false);

  const context = direct('http://127.0.0.1:4782/');
  const record = createServiceCredentialRecord(context, VALID_KEY);
  assert.deepEqual(serviceCredentialHeaders(context, '/health', record), {});
  assert.deepEqual(serviceCredentialHeaders(context, '/version?format=json', record), {});
});

test('credentials are attached only to a protected endpoint at the exact scope', () => {
  const context = direct('https://hair.example.test/api/');
  const record = createServiceCredentialRecord(context, VALID_KEY);
  assert.deepEqual(record, { schemaVersion: 1, scope: 'https://hair.example.test', value: VALID_KEY });
  assert.deepEqual(serviceCredentialHeaders(context, '/profiles/owner', record), { 'x-api-key': VALID_KEY });
  assert.deepEqual(serviceCredentialHeaders(context, '/profiles/owner', { ...record, scope: 'https://other.example.test' }), {});
  assert.deepEqual(serviceCredentialHeaders(context, '/profiles/owner', null), {});
});

test('credential values and records are bounded and validated', () => {
  const context = direct('https://hair.example.test/');
  assert.throws(() => createServiceCredentialRecord(context, 'a'.repeat(23)), /24 to 512/);
  assert.throws(() => createServiceCredentialRecord(context, 'a'.repeat(513)), /24 to 512/);
  assert.throws(() => serviceCredentialHeaders(context, '/profiles', { schemaVersion: 2, scope: context.credentialScope, value: VALID_KEY }), /schema version/);
  assert.throws(() => serviceCredentialHeaders(context, '/profiles', { schemaVersion: 1, scope: context.credentialScope, value: 'short' }), /24 to 512/);
});

test('endpoint validation prevents cross-origin credential forwarding', () => {
  const context = direct('https://hair.example.test/api/');
  const record = createServiceCredentialRecord(context, VALID_KEY);
  assert.throws(() => serviceCredentialHeaders(context, 'https://other.example.test/profiles', record), /relative path/);
  assert.throws(() => serviceCredentialHeaders(context, '//other.example.test/profiles', record), /relative path/);
  assert.throws(() => serviceCredentialHeaders(context, '/profiles#secret', record), /fragment/);
  assert.throws(() => serviceCredentialHeaders(context, `/${'a'.repeat(513)}`, record), /at most 512/);
});
