import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '..', '..', '..');
const helper = path.join(root, 'scripts', 'release', 'batch-timing.ps1');
const contracts = new Map([
  ['build.bat', ['dependencies', 'source-capture', 'package', 'source-verification', 'packaged-validation']],
  ['build-installer.bat', ['dependencies', 'source-capture', 'squirrel-package', 'icon-application', 'installer-validation', 'source-verification']],
  ['download-dependencies.bat', ['manifest', 'git', 'node', 'npm-dependencies', 'squirrel-tools', 'release-contract']]
]);
const originalFailureCodes = new Map([
  ['build.bat', [19, 30, 36, 31, 32, 37, 35, 33, 34]],
  ['build-installer.bat', [39, 40, 47, 41, 42, 43, 44, 48, 46, 45]],
  ['download-dependencies.bat', [20, 21, 24, 22, 23, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41]]
]);

test('every batch entry point declares and records its exact phase inventory', () => {
  assert.equal(fs.existsSync(helper), true, 'The shared batch timing helper must exist.');
  for (const [name, phases] of contracts) {
    const source = fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
    assert.match(source, new RegExp(`^set "HGE_PHASE_INVENTORY=${phases.join(';')}"$`, 'm'));
    assert.match(source, /^\s*call :HGE_TIMING start\s*$/m);
    for (const phase of phases) {
      assert.match(source, new RegExp(`^\\s*call :HGE_TIMING phase-start ${phase}\\s*$`, 'm'));
      assert.match(source, new RegExp(`^\\s*call :HGE_TIMING phase-finish ${phase} success\\s*$`, 'm'));
    }
    assert.match(source, /^\s*(?:if exist "[^"]+"\s+)?call :HGE_TIMING fail\s*$/m);
    assert.match(source, /^\s*call :HGE_TIMING finish success\s*$/m);

    const helperBoundary = source.indexOf('\n:HGE_TIMING\n');
    assert.notEqual(helperBoundary, -1, `${name} must keep its timing subroutine after the main body.`);
    const mainBody = source.slice(0, helperBoundary);
    for (const code of originalFailureCodes.get(name)) {
      assert.match(mainBody, new RegExp(`exit /b ${code}(?:\\s|$)`, 'i'), `${name} must preserve exit code ${code}.`);
    }

    const lines = mainBody.split('\n');
    const nonzeroExits = lines
      .map((line, index) => ({ index, match: line.match(/^\s*exit \/b\s+(?!0(?:\s|$))(.+)$/i) }))
      .filter(({ match }) => match !== null);
    assert.ok(nonzeroExits.length > 0, `${name} must expose at least one nonzero exit path.`);
    for (const { index, match } of nonzeroExits) {
      const precedingExitBlock = lines.slice(Math.max(0, index - 5), index).join('\n');
      assert.match(
        precedingExitBlock,
        /^\s*(?:if exist "[^"]+"\s+)?call :HGE_TIMING fail\s*$/im,
        `${name} exit path ${match[1].trim()} must report timing failure before exit.`
      );
    }
  }
});

test('batch timing reports server-independent UTC bounds and stable HH:mm:ss durations', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-batch-timing-'));
  const state = path.join(directory, 'timing.json');
  const invoke = (event, extra = []) => execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', helper,
    '-Event', event,
    '-ScriptName', 'fixture',
    '-StatePath', state,
    '-PhaseInventory', 'one;two',
    ...extra
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  try {
    const startOutput = invoke('start');
    const storedStart = JSON.parse(fs.readFileSync(state, 'utf8'));
    assert.equal(Number.isSafeInteger(storedStart.startedEpochMilliseconds), true);
    assert.ok(storedStart.startedEpochMilliseconds > 0);
    assert.match(startOutput, /Overall started \d{4}-\d{2}-\d{2}T.*Z, status running[.] Phase inventory: one;two[.]/);
    const phaseStartOutput = invoke('phase-start', ['-Phase', 'one']);
    assert.match(phaseStartOutput, /Phase one started \d{4}-\d{2}-\d{2}T.*Z, status running[.]/);
    const phaseOutput = invoke('phase-finish', ['-Phase', 'one', '-Status', 'success']);
    invoke('phase-start', ['-Phase', 'two']);
    invoke('phase-finish', ['-Phase', 'two', '-Status', 'success']);
    const finalOutput = invoke('finish', ['-Status', 'success']);
    assert.match(phaseOutput, /Phase one started \d{4}-\d{2}-\d{2}T.*Z, completed \d{4}-\d{2}-\d{2}T.*Z, duration \d{2}:\d{2}:\d{2}, status success[.]/);
    assert.match(finalOutput, /Overall started \d{4}-\d{2}-\d{2}T.*Z, completed \d{4}-\d{2}-\d{2}T.*Z, duration \d{2}:\d{2}:\d{2}, status success[.]/);
    assert.equal(fs.existsSync(state), false, 'A completed timing record must not leave temporary state behind.');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('batch timing reports active phase and overall failure before cleaning temporary state', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-batch-timing-failure-'));
  const state = path.join(directory, 'timing.json');
  const invoke = (event, extra = []) => execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', helper,
    '-Event', event,
    '-ScriptName', 'failure-fixture',
    '-StatePath', state,
    '-PhaseInventory', 'one;two',
    ...extra
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  try {
    invoke('start');
    invoke('phase-start', ['-Phase', 'one']);
    const output = invoke('fail', ['-Status', 'failure']);
    assert.match(output, /Phase one started \d{4}-\d{2}-\d{2}T.*Z, completed \d{4}-\d{2}-\d{2}T.*Z, duration \d{2}:\d{2}:\d{2}, status failure[.]/);
    assert.match(output, /Overall started \d{4}-\d{2}-\d{2}T.*Z, completed \d{4}-\d{2}-\d{2}T.*Z, duration \d{2}:\d{2}:\d{2}, status failure[.]/);
    assert.equal(fs.existsSync(state), false, 'A failed timing record must not leave temporary state behind.');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('batch timing refuses overall success after a failed completed phase', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-batch-timing-phase-failure-'));
  const state = path.join(directory, 'timing.json');
  const invoke = (event, extra = []) => execFileSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper,
    '-Event', event, '-ScriptName', 'phase-failure-fixture', '-StatePath', state,
    '-PhaseInventory', 'one', ...extra
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  try {
    invoke('start');
    invoke('phase-start', ['-Phase', 'one']);
    invoke('phase-finish', ['-Phase', 'one', '-Status', 'failure']);
    assert.throws(() => invoke('finish', ['-Status', 'success']), /completed phase to be successful/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
