'use strict';

const path = require('node:path');

function boundedPort(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new RangeError(`${label} must be between 1 and 65535.`);
  return parsed;
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

module.exports = { boundedPort, buildSshArguments };
