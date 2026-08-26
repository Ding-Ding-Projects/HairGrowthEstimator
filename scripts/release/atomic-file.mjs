import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const transientReplaceCodes = new Set(['EPERM', 'EACCES', 'EBUSY']);
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

function wait(milliseconds) {
  Atomics.wait(waitBuffer, 0, 0, milliseconds);
}

export function atomicReplaceSync(source, destination, options = {}) {
  const rename = options.rename || fs.renameSync;
  const pause = options.wait || wait;
  const attempts = Number.isSafeInteger(options.attempts) ? options.attempts : 8;
  if (attempts < 1) throw new TypeError('Atomic replacement requires at least one attempt.');
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      rename(source, destination);
      return;
    } catch (error) {
      if (!transientReplaceCodes.has(error?.code) || attempt === attempts) throw error;
      pause(Math.min(20 * (2 ** (attempt - 1)), 320));
    }
  }
}

export function atomicWriteFileSync(target, contents, options) {
  const resolved = path.resolve(target);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, contents, options);
    atomicReplaceSync(temporary, resolved);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
