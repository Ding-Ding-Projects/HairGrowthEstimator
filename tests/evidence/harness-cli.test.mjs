import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(relativePath, args = []) {
  return childProcess.spawnSync(process.execPath, [path.join(repositoryRoot, relativePath), ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

test('deliberate visible-capture break is red and evidence helper self-test is green', () => {
  const red = run('tests/evidence/deliberate-red-probe.mjs');
  assert.equal(red.status, 1);
  assert.deepEqual(JSON.parse(red.stdout), {
    ok: false,
    code: 'VISIBLE_CAPTURE_FORBIDDEN',
    message: 'Evidence plan must use schema 1, cheap-lowlevel-headless, and window-only capture.'
  });
  const green = run('scripts/evidence/evidence-run.mjs', ['self-test']);
  assert.equal(green.status, 0);
  assert.deepEqual(JSON.parse(green.stdout), {
    ok: true,
    contract: 'window-only-evidence-v1',
    commands: ['prepare', 'step', 'inspect', 'reset', 'status', 'recover-launch', 'recover-lock', 'cleanup']
  });
});

test('recording helper self-test exposes only window recording commands', () => {
  const result = run('scripts/evidence/record-window.mjs', ['self-test']);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    ok: true,
    contract: 'window-only-recording-v1',
    commands: ['capture', 'inspect', 'verify', 'status', 'reset']
  });
});
