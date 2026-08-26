import crypto from 'node:crypto';
import fs from 'node:fs';

if (process.argv.length !== 4) throw new TypeError('Usage: node verify-file-sha256.mjs <file> <expected-sha256>');
const [, , file, expected] = process.argv;
if (!/^[0-9a-f]{64}$/i.test(expected)) throw new TypeError('Expected SHA-256 must contain exactly 64 hexadecimal characters.');
const observed = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (observed !== expected.toLowerCase()) throw new Error(`SHA-256 mismatch for ${file}.`);
process.stdout.write(`${observed}\n`);
