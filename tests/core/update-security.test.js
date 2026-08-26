'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CANONICAL_UPDATE_FEED_URL,
  UpdateRestartAuthorization,
  assertCanonicalUpdateFeed,
  assertObservedDownloadedUpdate,
  assertTrustedMainFrame,
  createObservedDownloadedUpdate,
  downloadedUpdateIdentityKey
} = require('../../app/core/update-security');

const APPLICATION_URL = 'file:///C:/Program%20Files/HairGrowthEstimator/app/renderer/index.html';

function downloadedUpdate(overrides = {}) {
  return createObservedDownloadedUpdate({
    provider: 'squirrel-windows',
    releaseName: '1.2.3',
    downloadedEvent: true,
    ...overrides
  });
}

function markReady(policy, overrides = {}) {
  const check = policy.beginCheck();
  const observedUpdate = downloadedUpdate();
  const ready = policy.markReady({
    version: '1.2.3',
    feedUrl: check.feedUrl,
    generation: check.generation,
    observedUpdate,
    ...overrides
  });
  return { check, observedUpdate, ready };
}

test('the canonical update feed is one exact public HTTPS location', () => {
  assert.equal(
    CANONICAL_UPDATE_FEED_URL,
    'https://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/latest/download/'
  );
  assert.equal(assertCanonicalUpdateFeed(CANONICAL_UPDATE_FEED_URL), CANONICAL_UPDATE_FEED_URL);
});

test('the update feed rejects insecure transport, credentials, query, and fragment data', () => {
  const rejected = [
    'http://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/latest/download/',
    'https://user:password@github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/latest/download/',
    `${CANONICAL_UPDATE_FEED_URL}?channel=preview`,
    `${CANONICAL_UPDATE_FEED_URL}#preview`
  ];
  for (const candidate of rejected) assert.throws(() => assertCanonicalUpdateFeed(candidate));
});

test('the update feed rejects sibling paths, lookalike hosts, and noncanonical spellings', () => {
  const rejected = [
    'https://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/download/',
    'https://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/latest/download/../preview/',
    'https://github.com.evil.example/Ding-Ding-Projects/HairGrowthEstimator/releases/latest/download/',
    'https://github.com@evil.example/Ding-Ding-Projects/HairGrowthEstimator/releases/latest/download/',
    'https://github.com:443/Ding-Ding-Projects/HairGrowthEstimator/releases/latest/download/',
    'HTTPS://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/latest/download/',
    ` ${CANONICAL_UPDATE_FEED_URL}`
  ];
  for (const candidate of rejected) assert.throws(() => assertCanonicalUpdateFeed(candidate));
});

test('the exact application main frame is accepted', () => {
  const mainFrame = { url: APPLICATION_URL };
  assert.equal(assertTrustedMainFrame({ senderFrame: mainFrame, mainFrame, applicationUrl: APPLICATION_URL }), true);
});

test('lookalike, child, detached, and wrong-location frames are rejected', () => {
  const mainFrame = { url: APPLICATION_URL };
  assert.throws(() => assertTrustedMainFrame({
    senderFrame: { url: APPLICATION_URL },
    mainFrame,
    applicationUrl: APPLICATION_URL
  }));
  assert.throws(() => assertTrustedMainFrame({
    senderFrame: { url: APPLICATION_URL, parent: mainFrame },
    mainFrame,
    applicationUrl: APPLICATION_URL
  }));
  assert.throws(() => assertTrustedMainFrame({ senderFrame: null, mainFrame, applicationUrl: APPLICATION_URL }));
  const detachedFrame = { url: APPLICATION_URL, detached: true };
  assert.throws(() => assertTrustedMainFrame({
    senderFrame: detachedFrame,
    mainFrame: detachedFrame,
    applicationUrl: APPLICATION_URL
  }));
  assert.throws(() => assertTrustedMainFrame({
    senderFrame: mainFrame,
    mainFrame,
    applicationUrl: 'file:///C:/Program%20Files/HairGrowthEstimator/app/renderer/other.html'
  }));
  mainFrame.url = 'https://example.invalid/';
  assert.throws(() => assertTrustedMainFrame({ senderFrame: mainFrame, mainFrame, applicationUrl: APPLICATION_URL }));
});

test('observed Squirrel.Windows downloaded events are bounded and immutable', () => {
  const observedUpdate = downloadedUpdate();
  assert.deepEqual(observedUpdate, {
    provider: 'squirrel-windows',
    releaseName: '1.2.3',
    downloadedEvent: true
  });
  assert.equal(Object.isFrozen(observedUpdate), true);
  assert.equal(assertObservedDownloadedUpdate(observedUpdate), observedUpdate);
  assert.equal(downloadedUpdate({ releaseName: 'v1.2.3' }).releaseName, '1.2.3');
  assert.equal(
    downloadedUpdateIdentityKey(observedUpdate),
    'squirrel-windows\n1.2.3\ntrue'
  );
  assert.throws(() => assertObservedDownloadedUpdate({ ...observedUpdate }));
  assert.throws(() => downloadedUpdateIdentityKey({ ...observedUpdate }));
});

test('unobserved, unsupported, malformed, and embellished downloaded events are rejected', () => {
  const rejected = [
    { downloadedEvent: false },
    { provider: 'generic' },
    { releaseName: 'release-1.2.3' },
    { releaseName: '' },
    { unexpected: true }
  ];
  for (const overrides of rejected) assert.throws(() => downloadedUpdate(overrides));
});

test('beginCheck binds a new generation to the canonical main-process feed', () => {
  const policy = new UpdateRestartAuthorization();
  assert.deepEqual(policy.beginCheck(), { feedUrl: CANONICAL_UPDATE_FEED_URL, generation: 1 });
  assert.deepEqual(policy.beginCheck(), { feedUrl: CANONICAL_UPDATE_FEED_URL, generation: 2 });
});

test('markReady binds version, feed, generation, and the observed downloaded event', () => {
  const policy = new UpdateRestartAuthorization();
  const { ready, observedUpdate } = markReady(policy);
  assert.deepEqual(ready, {
    version: '1.2.3',
    feedUrl: CANONICAL_UPDATE_FEED_URL,
    generation: 1,
    observedUpdate
  });
  assert.equal(Object.isFrozen(ready), true);
  assert.equal(policy.snapshot().ready, ready);
});

test('stale and malformed ready events are refused and invalidate their generation', () => {
  const mismatchPolicy = new UpdateRestartAuthorization();
  const mismatchCheck = mismatchPolicy.beginCheck();
  assert.throws(() => mismatchPolicy.markReady({
    version: '1.2.3',
    feedUrl: mismatchCheck.feedUrl,
    generation: mismatchCheck.generation,
    observedUpdate: downloadedUpdate({ releaseName: '1.2.4' })
  }));
  assert.equal(mismatchPolicy.snapshot().ready, null);

  const policy = new UpdateRestartAuthorization();
  const stale = policy.beginCheck();
  const current = policy.beginCheck();
  assert.throws(() => policy.markReady({
    version: '1.2.3',
    feedUrl: stale.feedUrl,
    generation: stale.generation,
    observedUpdate: downloadedUpdate()
  }));
  assert.equal(policy.snapshot().ready, null);
  assert.ok(policy.snapshot().generation > current.generation);
});

test('starting another check invalidates a previously ready update', () => {
  const policy = new UpdateRestartAuthorization();
  markReady(policy);
  policy.beginCheck();
  assert.equal(policy.snapshot().ready, null);
  assert.equal(policy.snapshot().lastInvalidation, 'check-started');
});

test('an update error invalidates readiness and advances the generation', () => {
  const policy = new UpdateRestartAuthorization();
  const { ready } = markReady(policy);
  policy.recordError();
  const state = policy.snapshot();
  assert.equal(state.ready, null);
  assert.ok(state.generation > ready.generation);
  assert.equal(state.lastInvalidation, 'error');
});

test('supersession invalidates readiness and advances the generation', () => {
  const policy = new UpdateRestartAuthorization();
  const { ready } = markReady(policy);
  const generation = policy.supersede();
  assert.ok(generation > ready.generation);
  assert.equal(policy.snapshot().ready, null);
  assert.equal(policy.snapshot().lastInvalidation, 'superseded');
});

test('feed application invalidates readiness before accepting or rejecting a value', () => {
  const policy = new UpdateRestartAuthorization();
  markReady(policy);
  assert.equal(policy.applyMainProcessFeed(CANONICAL_UPDATE_FEED_URL), CANONICAL_UPDATE_FEED_URL);
  assert.equal(policy.snapshot().ready, null);
  markReady(policy);
  assert.throws(() => policy.applyMainProcessFeed('https://example.invalid/releases/latest/download/'));
  assert.equal(policy.snapshot().ready, null);
  assert.equal(policy.snapshot().lastInvalidation, 'feed-change');
});

test('an exact restart authorization is consumed once', () => {
  const policy = new UpdateRestartAuthorization();
  const { ready } = markReady(policy);
  assert.deepEqual(policy.consumeRestart(ready), ready);
  assert.equal(policy.snapshot().ready, null);
  assert.equal(policy.snapshot().lastInvalidation, 'consumed');
  assert.throws(() => policy.consumeRestart(ready));
});

test('a mismatched restart attempt invalidates the current ready update', () => {
  const policy = new UpdateRestartAuthorization();
  const { ready } = markReady(policy);
  assert.throws(() => policy.consumeRestart({ ...ready, version: '1.2.4' }));
  assert.equal(policy.snapshot().ready, null);
  assert.equal(policy.snapshot().lastInvalidation, 'consumed');
});

test('a different observed release cannot authorize restart', () => {
  const policy = new UpdateRestartAuthorization();
  const { ready } = markReady(policy);
  const differentObservedUpdate = downloadedUpdate({ releaseName: '1.2.4' });
  assert.throws(() => policy.consumeRestart({
    ...ready,
    version: '1.2.4',
    observedUpdate: differentObservedUpdate
  }));
  assert.equal(policy.snapshot().ready, null);
});

test('an invalid ready replacement clears the previous authorization', () => {
  const policy = new UpdateRestartAuthorization();
  const { ready } = markReady(policy);
  assert.throws(() => policy.markReady({ ...ready, feedUrl: 'https://example.invalid/' }));
  assert.equal(policy.snapshot().ready, null);
  assert.equal(policy.snapshot().lastInvalidation, 'ready-error');
});
