'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const validatorUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'scripts', 'core', 'validate-installer.mjs')).href;

function peFixture(certificateSize = 0) {
  const buffer = Buffer.alloc(512);
  buffer.write('MZ', 0, 'ascii');
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.write('PE\0\0', 0x80, 'ascii');
  const optionalHeader = 0x80 + 24;
  buffer.writeUInt16LE(0x20b, optionalHeader);
  buffer.writeUInt32LE(16, optionalHeader + 108);
  if (certificateSize > 0) {
    buffer.writeUInt32LE(480, optionalHeader + 112 + (4 * 8));
    buffer.writeUInt32LE(certificateSize, optionalHeader + 112 + (4 * 8) + 4);
  }
  return buffer;
}

test('PE signing validator accepts an absent certificate table', async () => {
  const { readPeSecurityDirectory } = await import(validatorUrl);
  assert.deepEqual(readPeSecurityDirectory(peFixture()), { fileOffset: 0, size: 0 });
});

test('PE signing validator exposes a present certificate table', async () => {
  const { readPeSecurityDirectory } = await import(validatorUrl);
  assert.deepEqual(readPeSecurityDirectory(peFixture(16)), { fileOffset: 480, size: 16 });
});

test('PE signing validator rejects malformed executable bytes', async () => {
  const { readPeSecurityDirectory } = await import(validatorUrl);
  assert.throws(() => readPeSecurityDirectory(Buffer.alloc(512)), /valid PE file/);
});
