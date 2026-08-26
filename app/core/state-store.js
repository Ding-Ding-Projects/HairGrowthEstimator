'use strict';

const fs = require('node:fs/promises');
const { atomicWriteJson } = require('./atomic');
const { createDefaultState, validateState } = require('./state');

class StaleStateError extends Error {
  constructor(candidateRevision, authoritativeRevision) {
    super(`State revision ${candidateRevision} is stale; the authoritative revision is ${authoritativeRevision}.`);
    this.name = 'StaleStateError';
    this.code = 'ERR_STALE_STATE';
    this.candidateRevision = candidateRevision;
    this.authoritativeRevision = authoritativeRevision;
  }
}

class StateStore {
  constructor(options) {
    if (!options || typeof options !== 'object') throw new TypeError('State store options are required.');
    if (typeof options.filePath !== 'string' || !options.filePath) throw new TypeError('State file path is required.');
    this.filePath = options.filePath;
    this.history = options.history || null;
    this.today = options.today || (() => new Date().toISOString().slice(0, 10));
    this.now = options.now || (() => new Date().toISOString());
    this.readFile = options.readFile || fs.readFile;
    this.writeJson = options.writeJson || atomicWriteJson;
    this.redact = options.redact || ((state) => state);
    this.current = null;
    this.queue = Promise.resolve();
  }

  enqueue(operation) {
    const result = this.queue.then(operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async loadAuthoritative() {
    if (this.current) return this.current;
    try {
      const parsed = JSON.parse(await this.readFile(this.filePath, 'utf8'));
      this.current = validateState(parsed, this.today());
    } catch (error) {
      if (error.code === 'ENOENT' || error.name === 'SyntaxError' || error instanceof TypeError || error instanceof RangeError) {
        this.current = createDefaultState(this.today());
      } else {
        throw error;
      }
    }
    return this.current;
  }

  read() {
    return this.enqueue(async () => structuredClone(await this.loadAuthoritative()));
  }

  write(input, event = 'Application state updated') {
    return this.enqueue(async () => {
      const authoritative = await this.loadAuthoritative();
      const candidate = validateState(input, this.today());
      if (candidate.revision !== authoritative.revision) {
        throw new StaleStateError(candidate.revision, authoritative.revision);
      }
      if (authoritative.revision >= Number.MAX_SAFE_INTEGER) throw new RangeError('State revision limit has been reached.');
      const next = validateState({
        ...candidate,
        revision: authoritative.revision + 1,
        updatedAt: this.now()
      }, this.today());
      await this.writeJson(this.filePath, next, { maxBytes: 1024 * 1024 });
      this.current = next;

      let history;
      if (!this.history || typeof this.history.record !== 'function') {
        history = { status: 'unavailable', recorded: false, message: 'Local history is unavailable.' };
      } else {
        try {
          const detail = await this.history.record(event, this.redact(structuredClone(next)));
          history = { status: detail.recorded ? 'recorded' : 'unchanged', ...detail };
        } catch (error) {
          history = {
            status: 'degraded',
            recorded: false,
            message: error?.message || String(error)
          };
        }
      }
      return { state: structuredClone(next), history };
    });
  }

  async flush() {
    await this.queue;
    if (this.history && typeof this.history.flush === 'function') await this.history.flush();
  }
}

async function drainStateAndHistory(stateStore, history) {
  if (stateStore && typeof stateStore.flush === 'function') await stateStore.flush();
  if (history && history !== stateStore?.history && typeof history.flush === 'function') await history.flush();
}

module.exports = { StateStore, StaleStateError, drainStateAndHistory };
