'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DATABASE_VERSION = 1;
const DEFAULT_MAX_DATABASE_BYTES = 32 * 1024 * 1024;
const TRANSIENT_RENAME_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY']);

function emptyDatabase() {
  return { version: DATABASE_VERSION, profiles: Object.create(null) };
}

function resolveDatabasePath(filePath) {
  return path.resolve(filePath || process.env.HAIR_DATA_FILE || path.join(process.cwd(), 'data', 'hair-growth.json'));
}

function normaliseDatabase(value) {
  if (!value || value.version !== DATABASE_VERSION || !value.profiles || typeof value.profiles !== 'object' || Array.isArray(value.profiles)) {
    throw new Error('The hair growth data file has an unsupported or invalid schema.');
  }

  const profiles = Object.create(null);
  for (const [profileId, profile] of Object.entries(value.profiles)) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Error(`The stored profile ${profileId} is invalid.`);
    }
    profiles[profileId] = profile;
  }
  return { version: DATABASE_VERSION, profiles };
}

async function renameWithRetry(from, to, options = {}) {
  const attempts = Number.isInteger(options.attempts) ? options.attempts : 7;
  const baseDelayMs = Number.isInteger(options.baseDelayMs) ? options.baseDelayMs : 25;
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      lastError = error;
      if (!TRANSIENT_RENAME_ERRORS.has(error.code) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }

  throw lastError;
}

function createStore(options = {}) {
  const filePath = resolveDatabasePath(options.filePath);
  const maxBytes = Number.isInteger(options.maxBytes) ? options.maxBytes : DEFAULT_MAX_DATABASE_BYTES;
  if (maxBytes < 1024 || maxBytes > 128 * 1024 * 1024) throw new RangeError('Store maxBytes is outside the supported range.');
  let operationQueue = Promise.resolve();

  async function readDatabase() {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > maxBytes) throw new Error('The hair growth data file exceeds the supported size.');
      return normaliseDatabase(JSON.parse(await fs.readFile(filePath, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') return emptyDatabase();
      throw error;
    }
  }

  async function writeDatabase(database) {
    const destination = filePath;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const serialised = `${JSON.stringify(normaliseDatabase(database), null, 2)}\n`;
    if (Buffer.byteLength(serialised, 'utf8') > maxBytes) throw new Error('The hair growth data file would exceed the supported size.');
    await fs.writeFile(temporary, serialised, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    });
    try {
      await renameWithRetry(temporary, destination);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  function transact(mutator) {
    if (typeof mutator !== 'function') return Promise.reject(new TypeError('A transaction mutator is required.'));
    const operation = operationQueue.then(async () => {
      const database = await readDatabase();
      const result = await mutator(database);
      await writeDatabase(database);
      return result;
    });
    operationQueue = operation.catch(() => {});
    return operation;
  }

  async function waitForIdle() {
    await operationQueue;
  }

  return Object.freeze({
    filePath,
    readDatabase,
    transact,
    waitForIdle
  });
}

const defaultStore = createStore();

module.exports = {
  DATABASE_VERSION,
  DEFAULT_MAX_DATABASE_BYTES,
  createStore,
  normaliseDatabase,
  renameWithRetry,
  readDatabase: defaultStore.readDatabase,
  transact: defaultStore.transact,
  waitForIdle: defaultStore.waitForIdle
};
