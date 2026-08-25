'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicWriteFile } = require('./atomic');
const { factorOrder, hashSecret, verifySecret } = require('./credentials');
const { createSecret, normalizeBase32, totp, verifyTotp } = require('./totp');

class LocalVault {
  constructor({ filePath, safeStorage }) {
    this.filePath = path.resolve(filePath);
    this.safeStorage = safeStorage;
    this.queue = Promise.resolve();
    this.attempts = new Map();
  }

  ensureAvailable() {
    if (!this.safeStorage?.isEncryptionAvailable()) {
      throw new Error('Operating-system credential protection is unavailable. No credential change was made.');
    }
  }

  async read() {
    this.ensureAvailable();
    const empty = { schemaVersion: 1, apiKey: '', locks: {}, authenticators: {}, historyAccess: null };
    try {
      const encrypted = await fs.readFile(this.filePath);
      const parsed = JSON.parse(this.safeStorage.decryptString(encrypted));
      if (parsed?.schemaVersion !== 1) return empty;
      return {
        ...empty,
        ...parsed,
        locks: parsed.locks && typeof parsed.locks === 'object' ? parsed.locks : {},
        authenticators: parsed.authenticators && typeof parsed.authenticators === 'object' ? parsed.authenticators : {},
        historyAccess: parsed.historyAccess && typeof parsed.historyAccess === 'object' ? parsed.historyAccess : null
      };
    } catch (error) {
      if (error.code === 'ENOENT') return empty;
      throw new Error('The local credential store could not be read.');
    }
  }

  async write(value) {
    this.ensureAvailable();
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized) > 512 * 1024) throw new RangeError('Credential store exceeds 512 KiB.');
    const encrypted = this.safeStorage.encryptString(serialized);
    await atomicWriteFile(this.filePath, encrypted, { mode: 0o600 });
  }

  transact(mutator) {
    const operation = this.queue.then(async () => {
      const vault = await this.read();
      const result = await mutator(vault);
      await this.write(vault);
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  async setApiKey(value) {
    const apiKey = String(value || '');
    if (apiKey && (apiKey.length < 24 || apiKey.length > 512)) throw new RangeError('API key must contain 24 to 512 characters.');
    await this.transact((vault) => { vault.apiKey = apiKey; });
    return { stored: Boolean(apiKey) };
  }

  async apiKey() {
    return (await this.read()).apiKey || '';
  }

  async hasApiKey() {
    return Boolean(await this.apiKey());
  }

  async setHistoryPassword(value) {
    const record = hashSecret(value, 'password');
    await this.transact((vault) => {
      vault.historyAccess = { type: 'password', record, updatedAt: new Date().toISOString() };
    });
    return { configured: true };
  }

  async hasHistoryPassword() {
    return Boolean((await this.read()).historyAccess?.record);
  }

  async verifyHistoryPassword(value) {
    const historyAccess = (await this.read()).historyAccess;
    return Boolean(historyAccess?.type === 'password' && verifySecret(value, historyAccess.record, 'password'));
  }

  async setLock({ elementId, label, policy, pin, password, totpSecret }) {
    const id = String(elementId || '');
    if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(id)) throw new TypeError('Element identity is invalid.');
    const order = factorOrder(policy);
    const factors = {};
    if (order.includes('pin')) factors.pin = hashSecret(pin, 'pin');
    if (order.includes('password')) factors.password = hashSecret(password, 'password');
    if (order.includes('totp')) factors.totpSecret = normalizeBase32(totpSecret);
    const record = {
      elementId: id,
      label: String(label || id).slice(0, 160),
      policy,
      factors,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.transact((vault) => { vault.locks[id] = record; });
    this.attempts.delete(id);
    return { elementId: id, label: record.label, policy, createdAt: record.createdAt };
  }

  async listLocks() {
    const vault = await this.read();
    return Object.values(vault.locks || {}).map(({ elementId, label, policy, createdAt, updatedAt }) => ({ elementId, label, policy, createdAt, updatedAt }));
  }

  async removeLock(elementId) {
    const id = String(elementId || '');
    const removed = await this.transact((vault) => {
      const existed = Boolean(vault.locks[id]);
      delete vault.locks[id];
      return existed;
    });
    this.attempts.delete(id);
    return { removed };
  }

  attemptState(id) {
    const current = this.attempts.get(id) || { failures: 0, retryAt: 0 };
    if (current.retryAt && current.retryAt <= Date.now()) return { failures: 0, retryAt: 0 };
    return current;
  }

  async verifyLock({ elementId, pin, password, totpCode }) {
    const id = String(elementId || '');
    const attempt = this.attemptState(id);
    if (attempt.retryAt > Date.now()) return { ok: false, retryAfterMs: attempt.retryAt - Date.now() };
    const record = (await this.read()).locks?.[id];
    if (!record) return { ok: true, unlocked: true, policy: null };
    let ok = true;
    const order = factorOrder(record.policy);
    if (order.includes('pin')) ok = ok && verifySecret(pin, record.factors.pin, 'pin');
    if (order.includes('password')) ok = ok && verifySecret(password, record.factors.password, 'password');
    if (order.includes('totp')) ok = ok && verifyTotp(record.factors.totpSecret, totpCode, Date.now(), { window: 1 });
    if (ok) {
      this.attempts.delete(id);
      return { ok: true, unlocked: true, policy: record.policy };
    }
    const failures = attempt.failures + 1;
    const retryAt = failures >= 5 ? Date.now() + 30000 : 0;
    this.attempts.set(id, { failures: retryAt ? 0 : failures, retryAt });
    return { ok: false, retryAfterMs: retryAt ? 30000 : 0, remainingBeforeDelay: retryAt ? 0 : 5 - failures };
  }

  createTotpSecret() {
    this.ensureAvailable();
    return createSecret();
  }

  async addAuthenticator({ id, issuer, account, secret, algorithm, digits, period }) {
    const entryId = /^[a-zA-Z0-9-]{8,64}$/.test(id || '') ? id : crypto.randomUUID();
    const entry = {
      id: entryId,
      issuer: String(issuer || '').trim().slice(0, 120),
      account: String(account || '').trim().slice(0, 160),
      secret: normalizeBase32(secret),
      algorithm: ['sha1', 'sha256', 'sha512'].includes(String(algorithm || '').toLowerCase()) ? String(algorithm).toLowerCase() : 'sha1',
      digits: [6, 7, 8].includes(Number(digits)) ? Number(digits) : 6,
      period: Number.isInteger(Number(period)) && Number(period) >= 10 && Number(period) <= 300 ? Number(period) : 30,
      createdAt: new Date().toISOString()
    };
    if (!entry.issuer || !entry.account) throw new TypeError('Issuer and account are required.');
    await this.transact((vault) => { vault.authenticators[entry.id] = entry; });
    return { id: entry.id, issuer: entry.issuer, account: entry.account, algorithm: entry.algorithm, digits: entry.digits, period: entry.period };
  }

  async listAuthenticators(now = Date.now()) {
    const vault = await this.read();
    return Object.values(vault.authenticators || {}).map((entry) => {
      const options = { algorithm: entry.algorithm, digits: entry.digits, period: entry.period };
      const remainingSeconds = entry.period - (Math.floor(now / 1000) % entry.period);
      return {
        id: entry.id,
        issuer: entry.issuer,
        account: entry.account,
        algorithm: entry.algorithm,
        digits: entry.digits,
        period: entry.period,
        currentCode: totp(entry.secret, now, options),
        nextCode: totp(entry.secret, now + entry.period * 1000, options),
        remainingSeconds
      };
    });
  }

  async removeAuthenticator(id) {
    return this.transact((vault) => {
      const existed = Boolean(vault.authenticators[id]);
      delete vault.authenticators[id];
      return { removed: existed };
    });
  }
}

module.exports = { LocalVault };
