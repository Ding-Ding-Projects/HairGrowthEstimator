import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { atomicReplaceSync } from '../atomic-file.mjs';

test('atomic replacement retries only transient Windows sharing failures', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-atomic-'));
  const source = path.join(directory, 'source');
  const destination = path.join(directory, 'destination');
  try {
    fs.writeFileSync(source, 'new');
    fs.writeFileSync(destination, 'old');
    let attempts = 0;
    atomicReplaceSync(source, destination, {
      attempts: 4,
      wait: () => {},
      rename: (from, to) => {
        attempts += 1;
        if (attempts < 3) throw Object.assign(new Error('sharing handle'), { code: 'EPERM' });
        fs.renameSync(from, to);
      }
    });
    assert.equal(attempts, 3);
    assert.equal(fs.readFileSync(destination, 'utf8'), 'new');

    attempts = 0;
    assert.throws(() => atomicReplaceSync('missing', destination, {
      attempts: 4,
      wait: () => {},
      rename: () => {
        attempts += 1;
        throw Object.assign(new Error('storage exhausted'), { code: 'ENOSPC' });
      }
    }), /storage exhausted/);
    assert.equal(attempts, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
