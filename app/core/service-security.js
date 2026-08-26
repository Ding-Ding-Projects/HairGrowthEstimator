'use strict';

const net = require('node:net');

const MAX_SERVICE_URL_LENGTH = 2048;
const MAX_ENDPOINT_LENGTH = 512;
const MAX_SCOPE_LENGTH = 512;
const MIN_API_KEY_LENGTH = 24;
const MAX_API_KEY_LENGTH = 512;
const PUBLIC_SERVICE_PATHS = new Set(['/health', '/version']);

function boundedPort(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new RangeError(`${label} must be between 1 and 65535.`);
  }
  return parsed;
}

function boundedString(value, maximum, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`);
  if (value.length > maximum) throw new RangeError(`${label} must contain at most ${maximum} characters.`);
  return value;
}

function normalizeSshHost(value) {
  const supplied = boundedString(String(value || '').trim(), 253, 'SSH host').toLowerCase();
  if (!supplied) throw new TypeError('Enter a valid SSH host name or IP address.');

  if (supplied.startsWith('[') || supplied.endsWith(']')) {
    if (!(supplied.startsWith('[') && supplied.endsWith(']'))) {
      throw new TypeError('Enter a valid SSH host name or IP address.');
    }
    const address = supplied.slice(1, -1);
    if (net.isIP(address) !== 6) throw new TypeError('Enter a valid SSH host name or IP address.');
    return new URL(`http://[${address}]/`).hostname.slice(1, -1);
  }

  const ipVersion = net.isIP(supplied);
  if (ipVersion === 4) return supplied;
  if (ipVersion === 6) return new URL(`http://[${supplied}]/`).hostname.slice(1, -1);

  if (supplied.endsWith('.') || supplied.includes('..')) {
    throw new TypeError('Enter a valid SSH host name or IP address.');
  }
  const labels = supplied.split('.');
  if (!labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new TypeError('Enter a valid SSH host name or IP address.');
  }
  return supplied;
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost') return true;
  if (normalized === '::1') return true;
  if (net.isIP(normalized) === 4) return normalized.split('.')[0] === '127';
  return false;
}

function validatedServiceUrl(raw) {
  const supplied = boundedString(raw, MAX_SERVICE_URL_LENGTH, 'Service server URL');
  let url;
  try {
    url = new URL(supplied);
  } catch {
    throw new TypeError('Enter a valid HTTP or HTTPS server URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError('Only HTTP or HTTPS server URLs are supported.');
  }
  if (!url.hostname) throw new TypeError('Enter a valid HTTP or HTTPS server URL.');
  if (url.username || url.password) throw new TypeError('Credentials must not be embedded in the server URL.');
  if (url.search) throw new TypeError('The service server URL must not include a query string.');
  if (url.hash) throw new TypeError('The service server URL must not include a fragment.');
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    throw new TypeError('HTTPS is required for direct non-loopback service connections.');
  }
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
  return url;
}

function directContext(syncSettings) {
  const url = validatedServiceUrl(syncSettings.serverUrl);
  return Object.freeze({
    mode: syncSettings.mode,
    transport: url.protocol === 'https:' ? 'direct-https' : 'direct-http-loopback',
    baseUrl: url.href,
    credentialScope: url.origin
  });
}

function sshContext(syncSettings, tunnelState) {
  const ssh = syncSettings.ssh;
  if (!ssh || typeof ssh !== 'object') throw new TypeError('SSH settings are required.');
  const host = normalizeSshHost(ssh.host);
  const port = boundedPort(ssh.port, 'SSH port');
  const remoteApiPort = boundedPort(ssh.remoteApiPort, 'Remote API port');
  const localForwardPort = boundedPort(ssh.localForwardPort, 'Local forwarded port');

  if (!tunnelState || tunnelState.status !== 'connected') {
    throw new Error('A connected SSH tunnel is required before contacting the service.');
  }
  const connectedHost = normalizeSshHost(tunnelState.host);
  const connectedPort = boundedPort(tunnelState.port, 'Connected SSH port');
  const connectedRemoteApiPort = boundedPort(tunnelState.remoteApiPort, 'Connected remote API port');
  const connectedLocalForwardPort = boundedPort(tunnelState.localForwardPort, 'Connected local forwarded port');
  if (connectedHost !== host) throw new Error('The configured SSH host does not match the connected SSH tunnel.');
  if (connectedPort !== port) throw new Error('The configured SSH port does not match the connected SSH tunnel.');
  if (connectedRemoteApiPort !== remoteApiPort) {
    throw new Error('The configured remote API port does not match the connected SSH tunnel.');
  }
  if (connectedLocalForwardPort !== localForwardPort) {
    throw new Error('The configured local forwarded port does not match the connected SSH tunnel.');
  }

  const scopeHost = net.isIP(host) === 6 ? `[${host}]` : host;
  return Object.freeze({
    mode: 'ssh',
    transport: 'ssh-forward',
    baseUrl: `http://127.0.0.1:${localForwardPort}/`,
    credentialScope: `ssh://${scopeHost}:${port}/127.0.0.1:${remoteApiPort}`
  });
}

function resolveServiceSecurityContext(syncSettings, tunnelState) {
  if (!syncSettings || typeof syncSettings !== 'object') throw new TypeError('Sync settings are required.');
  if (!['local', 'server', 'ssh'].includes(syncSettings.mode)) {
    throw new TypeError('Sync mode must be local, server, or ssh.');
  }
  return syncSettings.mode === 'ssh' ? sshContext(syncSettings, tunnelState) : directContext(syncSettings);
}

function normalizeEndpoint(endpoint) {
  const supplied = boundedString(endpoint, MAX_ENDPOINT_LENGTH, 'Service endpoint');
  if (!supplied.startsWith('/') || supplied.startsWith('//') || supplied.includes('\\')) {
    throw new TypeError('Service endpoints must be relative paths on the selected service origin.');
  }
  const parsed = new URL(supplied, 'https://service.invalid/');
  if (parsed.origin !== 'https://service.invalid') {
    throw new TypeError('Service endpoints must be relative paths on the selected service origin.');
  }
  if (parsed.hash) throw new TypeError('Service endpoints must not include a fragment.');
  return parsed;
}

function canonicalEndpointPath(endpoint) {
  const parsed = normalizeEndpoint(endpoint);
  return parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname;
}

function isPublicServiceEndpoint(endpoint) {
  return PUBLIC_SERVICE_PATHS.has(canonicalEndpointPath(endpoint));
}

function validatedContext(context) {
  if (!context || typeof context !== 'object') throw new TypeError('A service security context is required.');
  if (!['local', 'server', 'ssh'].includes(context.mode)) throw new TypeError('The service security context has an invalid mode.');
  if (!['direct-https', 'direct-http-loopback', 'ssh-forward'].includes(context.transport)) {
    throw new TypeError('The service security context has an invalid transport.');
  }
  boundedString(context.baseUrl, MAX_SERVICE_URL_LENGTH, 'Service base URL');
  const scope = boundedString(context.credentialScope, MAX_SCOPE_LENGTH, 'Service credential scope');
  if (!scope) throw new TypeError('The service credential scope is required.');
  return context;
}

function validatedApiKey(value) {
  if (typeof value !== 'string' || value.length < MIN_API_KEY_LENGTH || value.length > MAX_API_KEY_LENGTH) {
    throw new RangeError('API key must contain 24 to 512 characters.');
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new TypeError('API key must not contain control characters.');
  return value;
}

function createServiceCredentialRecord(context, value) {
  const safeContext = validatedContext(context);
  return Object.freeze({
    schemaVersion: 1,
    scope: safeContext.credentialScope,
    value: validatedApiKey(value)
  });
}

function serviceCredentialHeaders(context, endpoint, record) {
  const safeContext = validatedContext(context);
  if (isPublicServiceEndpoint(endpoint)) return Object.freeze({});
  if (record === null || record === undefined) return Object.freeze({});
  if (!record || typeof record !== 'object') throw new TypeError('Service credential record must be an object.');
  if (record.schemaVersion !== 1) throw new TypeError('Unsupported service credential schema version.');
  const scope = boundedString(record.scope, MAX_SCOPE_LENGTH, 'Service credential scope');
  if (scope !== safeContext.credentialScope) return Object.freeze({});
  return Object.freeze({ 'x-api-key': validatedApiKey(record.value) });
}

module.exports = {
  createServiceCredentialRecord,
  isLoopbackHostname,
  isPublicServiceEndpoint,
  resolveServiceSecurityContext,
  serviceCredentialHeaders,
  validatedServiceUrl
};
