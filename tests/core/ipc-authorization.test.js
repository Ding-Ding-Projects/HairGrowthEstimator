'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  IPC_CHANNEL_INVENTORY,
  IPC_CHANNEL_POLICY,
  PROTECTED_IPC_CHANNELS,
  PUBLIC_IPC_CHANNELS,
  assertIpcChannelPolicy,
  assertKnownIpcChannel,
  assertTrustedMainIpc,
  getIpcChannelPolicy
} = require('../../app/core/ipc-authorization');

const APPLICATION_URL = 'file:///C:/Program%20Files/HairGrowthEstimator/app/renderer/index.html';
const EXPECTED_CHANNELS = Object.freeze([
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:setTitle',
  'provenance:read',
  'state:read',
  'state:write',
  'school:read',
  'school:configure',
  'school:disable',
  'accessibility:status',
  'delight:photo',
  'schedule:resolve',
  'schedule:setHomeAssistantToken',
  'schedule:hasHomeAssistantToken',
  'secret:setApiKey',
  'secret:hasApiKey',
  'lock:set',
  'lock:list',
  'lock:verify',
  'lock:remove',
  'auth:createSecret',
  'auth:add',
  'auth:list',
  'auth:remove',
  'file:chooseKey',
  'vocabulary:read',
  'vocabulary:replace',
  'vocabulary:clear',
  'file:chooseLogo',
  'file:chooseConverterSource',
  'file:convert',
  'file:export',
  'file:showAppData',
  'external:openVsCode',
  'external:openUrl',
  'history:setCredential',
  'history:list',
  'history:read',
  'history:diff',
  'history:restore',
  'history:label',
  'history:prune',
  'history:export',
  'server:request',
  'ssh:start',
  'ssh:stop',
  'ssh:state',
  'ollama:request',
  'regex:evaluate',
  'update:state',
  'update:check',
  'update:restart'
]);

function readRegisteredChannels() {
  const mainPath = path.join(__dirname, '..', '..', 'app', 'main.js');
  const source = fs.readFileSync(mainPath, 'utf8');
  return [
    ...source.matchAll(/(?:ipcMain\.handle|registerIpcHandler)\(\s*'([^']+)'/g)
  ].map((match) => match[1]);
}

function trustedFixture() {
  const mainFrame = { detached: false, parent: null, url: APPLICATION_URL };
  const mainWebContents = {
    getURL: () => APPLICATION_URL,
    isDestroyed: () => false,
    mainFrame
  };
  return {
    event: { sender: mainWebContents, senderFrame: mainFrame },
    mainFrame,
    mainWebContents
  };
}

function assertUntrusted(run) {
  assert.throws(run, (error) => error?.code === 'ERR_UNTRUSTED_IPC_SENDER');
}

test('the hand-written inventory exactly covers all 53 registered channels', () => {
  assert.equal(EXPECTED_CHANNELS.length, 53);
  assert.deepEqual(readRegisteredChannels(), [...EXPECTED_CHANNELS]);
  assert.deepEqual(IPC_CHANNEL_INVENTORY.map(({ channel }) => channel), [...EXPECTED_CHANNELS]);
  assert.equal(new Set(IPC_CHANNEL_INVENTORY.map(({ channel }) => channel)).size, 53);
});

test('one provenance read is public and the other 52 channels require the trusted main frame', () => {
  assert.deepEqual(PUBLIC_IPC_CHANNELS, ['provenance:read']);
  assert.equal(PROTECTED_IPC_CHANNELS.length, 52);
  assert.deepEqual(
    PROTECTED_IPC_CHANNELS,
    EXPECTED_CHANNELS.filter((channel) => channel !== 'provenance:read')
  );
  for (const row of IPC_CHANNEL_INVENTORY) {
    assert.equal(
      row.policy,
      row.channel === 'provenance:read'
        ? IPC_CHANNEL_POLICY.PUBLIC
        : IPC_CHANNEL_POLICY.TRUSTED_MAIN_FRAME
    );
  }
});

test('the inventory, its rows, policies, and derived channel lists are immutable', () => {
  assert.equal(Object.isFrozen(IPC_CHANNEL_POLICY), true);
  assert.equal(Object.isFrozen(IPC_CHANNEL_INVENTORY), true);
  assert.equal(Object.isFrozen(PUBLIC_IPC_CHANNELS), true);
  assert.equal(Object.isFrozen(PROTECTED_IPC_CHANNELS), true);
  assert.equal(IPC_CHANNEL_INVENTORY.every(Object.isFrozen), true);
  assert.throws(() => IPC_CHANNEL_INVENTORY.push({ channel: 'extra', policy: 'public' }), TypeError);
  assert.throws(() => { IPC_CHANNEL_INVENTORY[0].policy = 'public'; }, TypeError);
});

test('policy lookup and assertion reject unknown, malformed, and mismatched channels', () => {
  assert.equal(getIpcChannelPolicy('provenance:read'), IPC_CHANNEL_POLICY.PUBLIC);
  assert.equal(getIpcChannelPolicy('state:read'), IPC_CHANNEL_POLICY.TRUSTED_MAIN_FRAME);
  assert.equal(assertKnownIpcChannel('state:write').channel, 'state:write');
  assert.equal(
    assertIpcChannelPolicy('state:write', IPC_CHANNEL_POLICY.TRUSTED_MAIN_FRAME),
    true
  );
  for (const channel of ['', ' state:read', 'state:read ', 'state:unknown', null, undefined, 42]) {
    assert.throws(
      () => getIpcChannelPolicy(channel),
      (error) => error?.code === 'ERR_UNKNOWN_IPC_CHANNEL'
    );
  }
  assert.throws(
    () => assertIpcChannelPolicy('state:write', IPC_CHANNEL_POLICY.PUBLIC),
    (error) => error?.code === 'ERR_IPC_CHANNEL_POLICY'
  );
  assert.throws(
    () => assertIpcChannelPolicy('state:write', 'trusted'),
    (error) => error?.code === 'ERR_IPC_CHANNEL_POLICY'
  );
});

test('the exact live main WebContents and its exact main frame are trusted', () => {
  const { event, mainWebContents } = trustedFixture();
  assert.equal(assertTrustedMainIpc({ event, mainWebContents, applicationUrl: APPLICATION_URL }), true);
});

test('missing, destroyed, throwing, nested, detached, and foreign senders fail closed', () => {
  const trusted = trustedFixture();
  const cases = [
    () => assertTrustedMainIpc(),
    () => assertTrustedMainIpc({ event: null, mainWebContents: trusted.mainWebContents, applicationUrl: APPLICATION_URL }),
    () => assertTrustedMainIpc({ event: trusted.event, mainWebContents: null, applicationUrl: APPLICATION_URL }),
    () => {
      const fixture = trustedFixture();
      fixture.mainWebContents.isDestroyed = undefined;
      return assertTrustedMainIpc({
        event: fixture.event,
        mainWebContents: fixture.mainWebContents,
        applicationUrl: APPLICATION_URL
      });
    },
    () => {
      const fixture = trustedFixture();
      fixture.mainWebContents.isDestroyed = () => true;
      return assertTrustedMainIpc({
        event: fixture.event,
        mainWebContents: fixture.mainWebContents,
        applicationUrl: APPLICATION_URL
      });
    },
    () => {
      const fixture = trustedFixture();
      fixture.mainWebContents.isDestroyed = () => { throw new Error('destroyed'); };
      return assertTrustedMainIpc({
        event: fixture.event,
        mainWebContents: fixture.mainWebContents,
        applicationUrl: APPLICATION_URL
      });
    },
    () => assertTrustedMainIpc({
      event: { sender: { ...trusted.mainWebContents }, senderFrame: trusted.mainFrame },
      mainWebContents: trusted.mainWebContents,
      applicationUrl: APPLICATION_URL
    }),
    () => assertTrustedMainIpc({
      event: { sender: trusted.mainWebContents, senderFrame: { ...trusted.mainFrame } },
      mainWebContents: trusted.mainWebContents,
      applicationUrl: APPLICATION_URL
    }),
    () => assertTrustedMainIpc({
      event: {
        sender: trusted.mainWebContents,
        senderFrame: { detached: false, parent: trusted.mainFrame, url: APPLICATION_URL }
      },
      mainWebContents: trusted.mainWebContents,
      applicationUrl: APPLICATION_URL
    }),
    () => {
      const fixture = trustedFixture();
      fixture.mainFrame.detached = true;
      return assertTrustedMainIpc({
        event: fixture.event,
        mainWebContents: fixture.mainWebContents,
        applicationUrl: APPLICATION_URL
      });
    },
    () => {
      const fixture = trustedFixture();
      fixture.mainFrame.parent = {};
      return assertTrustedMainIpc({
        event: fixture.event,
        mainWebContents: fixture.mainWebContents,
        applicationUrl: APPLICATION_URL
      });
    }
  ];
  for (const run of cases) assertUntrusted(run);
});

test('lookalike, foreign, non-file, and noncanonical locations fail closed', () => {
  const wrongLocations = [
    'https://example.invalid/',
    'file:///C:/Program%20Files/HairGrowthEstimator/app/renderer/other.html',
    `${APPLICATION_URL}?view=main`,
    `${APPLICATION_URL}#main`,
    ` ${APPLICATION_URL}`
  ];
  for (const wrongLocation of wrongLocations) {
    const fixture = trustedFixture();
    fixture.mainFrame.url = wrongLocation;
    fixture.mainWebContents.getURL = () => wrongLocation;
    assertUntrusted(() => assertTrustedMainIpc({
      event: fixture.event,
      mainWebContents: fixture.mainWebContents,
      applicationUrl: APPLICATION_URL
    }));
  }
  const fixture = trustedFixture();
  assert.throws(
    () => assertTrustedMainIpc({
      event: fixture.event,
      mainWebContents: fixture.mainWebContents,
      applicationUrl: `${APPLICATION_URL}#main`
    }),
    (error) => error?.code === 'ERR_IPC_APPLICATION_URL'
  );
});
