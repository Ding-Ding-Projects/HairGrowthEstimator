'use strict';

const IPC_CHANNEL_POLICY = Object.freeze({
  PUBLIC: 'public',
  TRUSTED_MAIN_FRAME: 'trusted-main-frame'
});

function inventoryRow(channel, policy = IPC_CHANNEL_POLICY.TRUSTED_MAIN_FRAME) {
  return Object.freeze({ channel, policy });
}

const IPC_CHANNEL_INVENTORY = Object.freeze([
  inventoryRow('window:minimize'),
  inventoryRow('window:maximize'),
  inventoryRow('window:close'),
  inventoryRow('window:setTitle'),
  inventoryRow('provenance:read', IPC_CHANNEL_POLICY.PUBLIC),
  inventoryRow('state:read'),
  inventoryRow('state:write'),
  inventoryRow('school:read'),
  inventoryRow('school:configure'),
  inventoryRow('school:disable'),
  inventoryRow('accessibility:status'),
  inventoryRow('delight:photo'),
  inventoryRow('schedule:resolve'),
  inventoryRow('schedule:setHomeAssistantToken'),
  inventoryRow('schedule:hasHomeAssistantToken'),
  inventoryRow('secret:setApiKey'),
  inventoryRow('secret:hasApiKey'),
  inventoryRow('lock:set'),
  inventoryRow('lock:list'),
  inventoryRow('lock:verify'),
  inventoryRow('lock:remove'),
  inventoryRow('auth:createSecret'),
  inventoryRow('auth:add'),
  inventoryRow('auth:list'),
  inventoryRow('auth:remove'),
  inventoryRow('file:chooseKey'),
  inventoryRow('vocabulary:read'),
  inventoryRow('vocabulary:replace'),
  inventoryRow('vocabulary:clear'),
  inventoryRow('file:chooseLogo'),
  inventoryRow('file:chooseConverterSource'),
  inventoryRow('file:convert'),
  inventoryRow('file:export'),
  inventoryRow('file:showAppData'),
  inventoryRow('external:openVsCode'),
  inventoryRow('external:openUrl'),
  inventoryRow('history:setCredential'),
  inventoryRow('history:list'),
  inventoryRow('history:read'),
  inventoryRow('history:diff'),
  inventoryRow('history:restore'),
  inventoryRow('history:label'),
  inventoryRow('history:prune'),
  inventoryRow('history:export'),
  inventoryRow('server:request'),
  inventoryRow('ssh:start'),
  inventoryRow('ssh:stop'),
  inventoryRow('ssh:state'),
  inventoryRow('ollama:request'),
  inventoryRow('regex:evaluate'),
  inventoryRow('update:state'),
  inventoryRow('update:check'),
  inventoryRow('update:restart')
]);

const PUBLIC_IPC_CHANNELS = Object.freeze(
  IPC_CHANNEL_INVENTORY
    .filter(({ policy }) => policy === IPC_CHANNEL_POLICY.PUBLIC)
    .map(({ channel }) => channel)
);

const PROTECTED_IPC_CHANNELS = Object.freeze(
  IPC_CHANNEL_INVENTORY
    .filter(({ policy }) => policy === IPC_CHANNEL_POLICY.TRUSTED_MAIN_FRAME)
    .map(({ channel }) => channel)
);

const CHANNEL_BY_NAME = new Map(IPC_CHANNEL_INVENTORY.map((row) => [row.channel, row]));
const VALID_POLICIES = new Set(Object.values(IPC_CHANNEL_POLICY));

function policyError(ErrorType, code, message, cause) {
  const error = new ErrorType(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function assertKnownIpcChannel(channel) {
  if (typeof channel !== 'string' || channel.length === 0 || channel.length > 128 || channel.trim() !== channel) {
    throw policyError(TypeError, 'ERR_UNKNOWN_IPC_CHANNEL', 'The IPC channel is not in the exact authorization inventory.');
  }
  const row = CHANNEL_BY_NAME.get(channel);
  if (!row) {
    throw policyError(TypeError, 'ERR_UNKNOWN_IPC_CHANNEL', 'The IPC channel is not in the exact authorization inventory.');
  }
  return row;
}

function getIpcChannelPolicy(channel) {
  return assertKnownIpcChannel(channel).policy;
}

function assertIpcChannelPolicy(channel, expectedPolicy) {
  if (!VALID_POLICIES.has(expectedPolicy)) {
    throw policyError(TypeError, 'ERR_IPC_CHANNEL_POLICY', 'The expected IPC authorization policy is not recognized.');
  }
  const actualPolicy = getIpcChannelPolicy(channel);
  if (actualPolicy !== expectedPolicy) {
    throw policyError(Error, 'ERR_IPC_CHANNEL_POLICY', 'The IPC channel does not use the required authorization policy.');
  }
  return true;
}

function assertApplicationUrl(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    value.trim() !== value
  ) {
    throw policyError(TypeError, 'ERR_IPC_APPLICATION_URL', 'The application URL must be one exact bounded local file URL.');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw policyError(TypeError, 'ERR_IPC_APPLICATION_URL', 'The application URL must be valid.', cause);
  }
  if (
    parsed.protocol !== 'file:' ||
    parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.href !== value
  ) {
    throw policyError(TypeError, 'ERR_IPC_APPLICATION_URL', 'The application URL must be an exact local file URL.');
  }
  return value;
}

function untrustedSender(message, cause) {
  throw policyError(Error, 'ERR_UNTRUSTED_IPC_SENDER', message, cause);
}

function assertTrustedMainIpc({ event, mainWebContents, applicationUrl } = {}) {
  if (!event || typeof event !== 'object' || !mainWebContents || typeof mainWebContents !== 'object') {
    untrustedSender('The IPC request did not provide the live application WebContents.');
  }
  if (event.sender !== mainWebContents) {
    untrustedSender('The IPC request did not originate from the application WebContents.');
  }
  if (typeof mainWebContents.isDestroyed !== 'function') {
    untrustedSender('The application WebContents destruction state is unavailable.');
  }
  let destroyed;
  try {
    destroyed = mainWebContents.isDestroyed();
  } catch (cause) {
    untrustedSender('The application WebContents destruction state could not be read.', cause);
  }
  if (destroyed !== false) {
    untrustedSender('The IPC request originated from destroyed application WebContents.');
  }
  if (typeof mainWebContents.getURL !== 'function') {
    untrustedSender('The application WebContents location is unavailable.');
  }

  const expectedUrl = assertApplicationUrl(applicationUrl);
  let mainFrame;
  let senderFrame;
  let senderUrl;
  try {
    mainFrame = mainWebContents.mainFrame;
    senderFrame = event.senderFrame;
    senderUrl = mainWebContents.getURL();
  } catch (cause) {
    untrustedSender('The IPC sender identity could not be read.', cause);
  }
  if (!mainFrame || !senderFrame || senderFrame !== mainFrame) {
    untrustedSender('The IPC request did not originate from the exact application main frame.');
  }

  let detached;
  let parent;
  let frameUrl;
  try {
    detached = senderFrame.detached;
    parent = senderFrame.parent;
    frameUrl = senderFrame.url;
  } catch (cause) {
    untrustedSender('The IPC main-frame state could not be read.', cause);
  }
  if (detached === true || parent !== null && parent !== undefined) {
    untrustedSender('The IPC request originated from a detached or nested frame.');
  }
  if (senderUrl !== expectedUrl || frameUrl !== expectedUrl || mainFrame.url !== expectedUrl) {
    untrustedSender('The IPC request originated from an unexpected application location.');
  }
  return true;
}

module.exports = {
  IPC_CHANNEL_INVENTORY,
  IPC_CHANNEL_POLICY,
  PROTECTED_IPC_CHANNELS,
  PUBLIC_IPC_CHANNELS,
  assertIpcChannelPolicy,
  assertKnownIpcChannel,
  assertTrustedMainIpc,
  getIpcChannelPolicy
};
