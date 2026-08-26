'use strict';

const path = require('node:path');

function boundedPort(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new RangeError(`${label} must be between 1 and 65535.`);
  return parsed;
}

function validatedServiceUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError('Enter a valid HTTP or HTTPS server URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Only HTTP or HTTPS server URLs are supported.');
  if (url.username || url.password) throw new TypeError('Credentials must not be embedded in the server URL.');
  return url;
}

function resolveServiceBaseUrl(syncSettings, tunnelState) {
  if (!syncSettings || typeof syncSettings !== 'object') throw new TypeError('Sync settings are required.');
  if (!['local', 'server', 'ssh'].includes(syncSettings.mode)) throw new TypeError('Sync mode must be local, server, or ssh.');
  if (syncSettings.mode !== 'ssh') return validatedServiceUrl(syncSettings.serverUrl);

  const localForwardPort = boundedPort(syncSettings.ssh?.localForwardPort, 'Local forwarded port');
  if (tunnelState?.status !== 'connected') throw new Error('A connected SSH tunnel is required before contacting the service.');
  const connectedPort = boundedPort(tunnelState.localForwardPort, 'Connected local forwarded port');
  if (connectedPort !== localForwardPort) {
    throw new Error('The configured local forwarded port does not match the connected SSH tunnel.');
  }
  return new URL(`http://127.0.0.1:${localForwardPort}/`);
}

function buildSshArguments(config, homePath) {
  if (!config || typeof config !== 'object') throw new TypeError('SSH configuration is required.');
  const host = String(config.host || '').trim();
  const username = String(config.username || '').trim();
  if (!/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?|\[[0-9a-fA-F:]+\])$/.test(host)) {
    throw new TypeError('Enter a valid SSH host name or IP address.');
  }
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(username)) throw new TypeError('Enter a valid SSH username.');
  const port = boundedPort(config.port, 'SSH port');
  const remoteApiPort = boundedPort(config.remoteApiPort, 'Remote API port');
  const localForwardPort = boundedPort(config.localForwardPort, 'Local forwarded port');
  const knownHosts = path.resolve(homePath, '.ssh', 'known_hosts');
  const args = [
    '-N',
    '-T',
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'UpdateHostKeys=no',
    '-o', `UserKnownHostsFile=${knownHosts}`,
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ConnectTimeout=10',
    '-o', 'ConnectionAttempts=1',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-p', String(port),
    '-L', `127.0.0.1:${localForwardPort}:127.0.0.1:${remoteApiPort}`
  ];
  if (config.keyFile) {
    const suppliedKeyFile = String(config.keyFile).trim();
    if (!path.isAbsolute(suppliedKeyFile)) throw new TypeError('SSH key path must be absolute.');
    const keyFile = path.resolve(suppliedKeyFile);
    args.push('-i', keyFile);
  }
  args.push(`${username}@${host}`);
  return args;
}

module.exports = { boundedPort, buildSshArguments, resolveServiceBaseUrl, validatedServiceUrl };
