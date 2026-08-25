'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

async function renameWithRetry(from, to, options = {}) {
  const attempts = Math.max(1, Math.min(12, Number(options.attempts) || 7));
  const baseDelayMs = Math.max(5, Math.min(100, Number(options.baseDelayMs) || 25));
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      lastError = error;
      if (!TRANSIENT_RENAME_CODES.has(error.code) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

async function atomicWriteFile(destination, content, options = {}) {
  const resolved = path.resolve(destination);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, content, { encoding: options.encoding, mode: options.mode ?? 0o600, flag: 'wx' });
  try {
    await renameWithRetry(temporary, resolved, options);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function atomicWriteJson(destination, value, options = {}) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const maxBytes = Number(options.maxBytes) || 1024 * 1024;
  if (Buffer.byteLength(serialized) > maxBytes) throw new RangeError(`Serialized data exceeds ${maxBytes} bytes.`);
  await atomicWriteFile(destination, serialized, { ...options, encoding: 'utf8' });
}

module.exports = { TRANSIENT_RENAME_CODES, renameWithRetry, atomicWriteFile, atomicWriteJson };
