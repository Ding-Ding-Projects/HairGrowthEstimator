'use strict';

const crypto = require('node:crypto');

const POLICIES = new Set([
  'pin',
  'password',
  'pin+password',
  'password+totp',
  'pin+totp',
  'password+pin+totp'
]);

function factorOrder(policy) {
  if (!POLICIES.has(policy)) throw new TypeError('Unsupported lock policy.');
  return policy.split('+');
}

function hashSecret(secret, kind, suppliedSalt) {
  const value = String(secret || '');
  if (kind === 'pin' && !/^\d{4,12}$/.test(value)) throw new TypeError('PIN must contain 4 to 12 digits.');
  if (kind === 'password' && (value.length < 8 || value.length > 256)) throw new TypeError('Password must contain 8 to 256 characters.');
  const salt = suppliedSalt ? Buffer.from(suppliedSalt, 'base64') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(value, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
}

function verifySecret(secret, record, kind) {
  try {
    const candidate = hashSecret(secret, kind, record.salt);
    const expected = Buffer.from(record.hash, 'base64');
    const actual = Buffer.from(candidate.hash, 'base64');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

module.exports = { POLICIES, factorOrder, hashSecret, verifySecret };
