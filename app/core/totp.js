'use strict';

const crypto = require('node:crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function normalizeBase32(value) {
  const normalized = String(value || '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/g, '');
  if (!normalized || !/^[A-Z2-7]{16,256}$/.test(normalized)) throw new TypeError('TOTP secret must be valid base32.');
  return normalized;
}

function decodeBase32(value) {
  const normalized = normalizeBase32(value);
  let bits = '';
  for (const character of normalized) bits += BASE32_ALPHABET.indexOf(character).toString(2).padStart(5, '0');
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

function encodeBase32(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let offset = 0; offset < bits.length; offset += 5) {
    output += BASE32_ALPHABET[Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, '0'), 2)];
  }
  return output;
}

function createSecret(bytes = 20) {
  const count = Math.max(16, Math.min(64, Number(bytes) || 20));
  return encodeBase32(crypto.randomBytes(count));
}

function hotp(secret, counter, options = {}) {
  const algorithm = String(options.algorithm || 'sha1').toLowerCase();
  if (!['sha1', 'sha256', 'sha512'].includes(algorithm)) throw new TypeError('Unsupported TOTP algorithm.');
  const digits = Number(options.digits || 6);
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) throw new RangeError('TOTP digits must be between 6 and 8.');
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac(algorithm, decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

function totp(secret, timestampMs = Date.now(), options = {}) {
  const period = Number(options.period || 30);
  if (!Number.isInteger(period) || period < 10 || period > 300) throw new RangeError('TOTP period must be between 10 and 300 seconds.');
  const counter = Math.floor(Number(timestampMs) / 1000 / period);
  return hotp(secret, counter, options);
}

function verifyTotp(secret, code, timestampMs = Date.now(), options = {}) {
  const period = Number(options.period || 30);
  const window = Math.max(0, Math.min(2, Number(options.window) || 1));
  const supplied = Buffer.from(String(code || ''), 'utf8');
  for (let step = -window; step <= window; step += 1) {
    const candidate = Buffer.from(totp(secret, Number(timestampMs) + step * period * 1000, options), 'utf8');
    if (candidate.length === supplied.length && crypto.timingSafeEqual(candidate, supplied)) return true;
  }
  return false;
}

module.exports = { normalizeBase32, decodeBase32, encodeBase32, createSecret, hotp, totp, verifyTotp };
