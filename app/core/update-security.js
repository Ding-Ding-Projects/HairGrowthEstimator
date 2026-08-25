'use strict';

const CANONICAL_UPDATE_FEED_URL = 'https://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/latest/download/';
const MAX_FEED_URL_LENGTH = 2048;
const VERSION_PATTERN = /^(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})(?:-[0-9A-Za-z](?:[0-9A-Za-z.-]{0,63})?)?$/;
const DOWNLOADED_UPDATE_FIELDS = new Set(['provider', 'releaseName', 'downloadedEvent']);
const CANONICAL_FEED = new URL(CANONICAL_UPDATE_FEED_URL);
const OBSERVED_DOWNLOADED_UPDATE = Symbol('observed-squirrel-downloaded-update');

function policyError(ErrorType, code, message) {
  const error = new ErrorType(message);
  error.code = code;
  return error;
}

function assertCanonicalUpdateFeed(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_FEED_URL_LENGTH) {
    throw policyError(TypeError, 'ERR_UPDATE_FEED_TYPE', 'The update feed must be a bounded string.');
  }
  if (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw policyError(TypeError, 'ERR_UPDATE_FEED_CANONICAL', 'The update feed must use its canonical spelling.');
  }

  let candidate;
  try {
    candidate = new URL(value);
  } catch {
    throw policyError(TypeError, 'ERR_UPDATE_FEED_URL', 'The update feed must be a valid URL.');
  }

  if (candidate.protocol !== 'https:') {
    throw policyError(TypeError, 'ERR_UPDATE_FEED_HTTPS', 'The update feed must use HTTPS.');
  }
  if (candidate.username || candidate.password) {
    throw policyError(TypeError, 'ERR_UPDATE_FEED_CREDENTIALS', 'The update feed must not contain credentials.');
  }
  if (candidate.search || candidate.hash) {
    throw policyError(TypeError, 'ERR_UPDATE_FEED_SUFFIX', 'The update feed must not contain a query or fragment.');
  }
  if (candidate.origin !== CANONICAL_FEED.origin || candidate.pathname !== CANONICAL_FEED.pathname) {
    throw policyError(TypeError, 'ERR_UPDATE_FEED_ALLOWLIST', 'The update feed is outside the allowed origin or path.');
  }
  if (candidate.href !== CANONICAL_UPDATE_FEED_URL || value !== candidate.href) {
    throw policyError(TypeError, 'ERR_UPDATE_FEED_CANONICAL', 'The update feed must exactly match the canonical URL.');
  }
  return CANONICAL_UPDATE_FEED_URL;
}

function assertApplicationUrl(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_FEED_URL_LENGTH || value !== value.trim()) {
    throw policyError(TypeError, 'ERR_UPDATE_APPLICATION_URL', 'The application URL must be a canonical bounded string.');
  }
  let applicationUrl;
  try {
    applicationUrl = new URL(value);
  } catch {
    throw policyError(TypeError, 'ERR_UPDATE_APPLICATION_URL', 'The application URL must be valid.');
  }
  if (
    applicationUrl.protocol !== 'file:' ||
    applicationUrl.username ||
    applicationUrl.password ||
    applicationUrl.search ||
    applicationUrl.hash ||
    applicationUrl.href !== value
  ) {
    throw policyError(TypeError, 'ERR_UPDATE_APPLICATION_URL', 'The application URL must be an exact local file URL.');
  }
  return value;
}

function assertTrustedMainFrame({ senderFrame, mainFrame, applicationUrl } = {}) {
  const expectedUrl = assertApplicationUrl(applicationUrl);
  if (!senderFrame || !mainFrame || senderFrame !== mainFrame) {
    throw policyError(Error, 'ERR_UNTRUSTED_UPDATE_SENDER', 'The update request did not originate from the application main frame.');
  }
  if (senderFrame.detached === true) {
    throw policyError(Error, 'ERR_UNTRUSTED_UPDATE_SENDER', 'The update request originated from a detached frame.');
  }
  if (senderFrame.url !== expectedUrl || mainFrame.url !== expectedUrl) {
    throw policyError(Error, 'ERR_UNTRUSTED_UPDATE_LOCATION', 'The update request originated from an unexpected location.');
  }
  return true;
}

function createObservedDownloadedUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw policyError(TypeError, 'ERR_UPDATE_DOWNLOADED_EVENT', 'An observed downloaded update event is required.');
  }
  for (const field of Object.keys(input)) {
    if (!DOWNLOADED_UPDATE_FIELDS.has(field)) {
      throw policyError(TypeError, 'ERR_UPDATE_DOWNLOADED_EVENT_FIELD', 'The downloaded update event contains an unexpected field.');
    }
  }
  if (input.provider !== 'squirrel-windows') {
    throw policyError(TypeError, 'ERR_UPDATE_PROVIDER', 'The downloaded update must come from the Squirrel.Windows provider.');
  }
  if (input.downloadedEvent !== true) {
    throw policyError(TypeError, 'ERR_UPDATE_NOT_DOWNLOADED', 'The update-downloaded event must be observed before restart authorization.');
  }
  const observedUpdate = {
    provider: 'squirrel-windows',
    releaseName: normalizeVersion(input.releaseName),
    downloadedEvent: true
  };
  Object.defineProperty(observedUpdate, OBSERVED_DOWNLOADED_UPDATE, { value: true });
  return Object.freeze(observedUpdate);
}

function assertObservedDownloadedUpdate(observedUpdate) {
  if (
    !observedUpdate ||
    typeof observedUpdate !== 'object' ||
    Array.isArray(observedUpdate) ||
    observedUpdate[OBSERVED_DOWNLOADED_UPDATE] !== true ||
    !Object.isFrozen(observedUpdate)
  ) {
    throw policyError(TypeError, 'ERR_UPDATE_EVENT_UNOBSERVED', 'The update must come from the privileged update-downloaded event boundary.');
  }
  return observedUpdate;
}

function downloadedUpdateIdentityKey(observedUpdate) {
  const normalized = assertObservedDownloadedUpdate(observedUpdate);
  return `${normalized.provider}\n${normalized.releaseName}\n${normalized.downloadedEvent}`;
}

function normalizeVersion(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.length > 80) {
    throw policyError(TypeError, 'ERR_UPDATE_VERSION', 'The update version must use a bounded semantic version.');
  }
  const normalized = /^[vV]/.test(value) ? value.slice(1) : value;
  if (!VERSION_PATTERN.test(normalized)) {
    throw policyError(TypeError, 'ERR_UPDATE_VERSION', 'The update version must use a bounded semantic version.');
  }
  return normalized;
}

function normalizeGeneration(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw policyError(TypeError, 'ERR_UPDATE_GENERATION', 'The update generation must be a positive safe integer.');
  }
  return value;
}

function normalizeAuthorization(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw policyError(TypeError, 'ERR_UPDATE_AUTHORIZATION', 'A ready update authorization is required.');
  }
  const version = normalizeVersion(input.version);
  const observedUpdate = assertObservedDownloadedUpdate(input.observedUpdate);
  if (observedUpdate.releaseName !== version) {
    throw policyError(Error, 'ERR_UPDATE_RELEASE_MISMATCH', 'The downloaded release name does not match the authorized version.');
  }
  return Object.freeze({
    version,
    feedUrl: assertCanonicalUpdateFeed(input.feedUrl),
    generation: normalizeGeneration(input.generation),
    observedUpdate
  });
}

class UpdateRestartAuthorization {
  constructor() {
    this._feedUrl = CANONICAL_UPDATE_FEED_URL;
    this._generation = 0;
    this._ready = null;
    this._lastInvalidation = 'initial';
  }

  _advance(reason) {
    this._ready = null;
    this._lastInvalidation = reason;
    if (this._generation >= Number.MAX_SAFE_INTEGER) {
      throw policyError(RangeError, 'ERR_UPDATE_GENERATION_EXHAUSTED', 'The update generation counter is exhausted.');
    }
    this._generation += 1;
    return this._generation;
  }

  beginCheck() {
    const generation = this._advance('check-started');
    return Object.freeze({ feedUrl: this._feedUrl, generation });
  }

  applyMainProcessFeed(value) {
    this._advance('feed-change');
    const feedUrl = assertCanonicalUpdateFeed(value);
    this._feedUrl = feedUrl;
    return feedUrl;
  }

  markReady(input) {
    this._ready = null;
    this._lastInvalidation = 'ready-pending';
    try {
      const ready = normalizeAuthorization(input);
      if (ready.feedUrl !== this._feedUrl || ready.generation !== this._generation) {
        throw policyError(Error, 'ERR_UPDATE_READY_STALE', 'The ready update does not match the active feed generation.');
      }
      this._ready = ready;
      this._lastInvalidation = null;
      return ready;
    } catch (error) {
      this._ready = null;
      this._lastInvalidation = 'ready-error';
      if (this._generation < Number.MAX_SAFE_INTEGER) this._generation += 1;
      throw error;
    }
  }

  recordError() {
    return this._advance('error');
  }

  supersede() {
    return this._advance('superseded');
  }

  consumeRestart(input) {
    const ready = this._ready;
    this._advance('consumed');
    if (!ready) {
      throw policyError(Error, 'ERR_UPDATE_NOT_READY', 'No observed downloaded update is ready to restart.');
    }

    const requested = normalizeAuthorization(input);
    if (
      requested.version !== ready.version ||
      requested.feedUrl !== ready.feedUrl ||
      requested.generation !== ready.generation ||
      downloadedUpdateIdentityKey(requested.observedUpdate) !== downloadedUpdateIdentityKey(ready.observedUpdate)
    ) {
      throw policyError(Error, 'ERR_UPDATE_AUTHORIZATION_MISMATCH', 'The restart request does not match the observed ready update.');
    }
    return ready;
  }

  snapshot() {
    return Object.freeze({
      feedUrl: this._feedUrl,
      generation: this._generation,
      ready: this._ready,
      lastInvalidation: this._lastInvalidation
    });
  }
}

module.exports = {
  CANONICAL_UPDATE_FEED_URL,
  UpdateRestartAuthorization,
  assertCanonicalUpdateFeed,
  assertObservedDownloadedUpdate,
  assertTrustedMainFrame,
  createObservedDownloadedUpdate,
  downloadedUpdateIdentityKey
};
