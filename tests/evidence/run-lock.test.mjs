import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { EvidenceError } from '../../scripts/evidence/common.mjs';
import { completeRunInitialization, initializeRunRoot, validatePlan } from '../../scripts/evidence/plan.mjs';
import { windowsProcessInventory } from '../../scripts/evidence/process-identity.mjs';
import { acquireRunLock, recoverRunLock } from '../../scripts/evidence/run-lock.mjs';
import { createPlanFixture } from './fixtures.mjs';

const execFile = promisify(childProcess.execFile);

test('run initialization barrier admits only its exact prepare process before the command lock takes over', async (t) => {
  const fixture = await createPlanFixture();
  t.after(() => fixture.cleanup());
  const plan = validatePlan(fixture.plan);
  const initializationOwner = (await windowsProcessInventory()).find((item) => item.pid === process.pid);
  assert.ok(initializationOwner?.creationDate && initializationOwner?.executablePath);
  await initializeRunRoot(plan, { retainInitializationBarrier: true, initializationOwner });

  await assert.rejects(acquireRunLock(plan, 'step:open-settings'), (error) => error instanceof EvidenceError && error.code === 'RUN_INITIALIZING');
  const prepareLock = await acquireRunLock(plan, 'prepare');
  assert.equal((await completeRunInitialization(plan)).passed, true);
  await prepareLock.release();

  const next = await acquireRunLock(plan, 'step:open-settings');
  await next.release();
});

test('exclusive run lock refuses overlap and recovers only after the exact owner process exits', async (t) => {
  const fixture = await createPlanFixture();
  t.after(() => fixture.cleanup());
  const plan = validatePlan(fixture.plan);
  await initializeRunRoot(plan);

  const first = await acquireRunLock(plan, 'test-overlap');
  await assert.rejects(acquireRunLock(plan, 'test-overlap-second'), (error) => error instanceof EvidenceError && error.code === 'RUN_LOCKED');
  await first.release();

  const helperDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'hair-growth-evidence-lock-helper-'));
  t.after(() => fsp.rm(helperDirectory, { recursive: true, force: true }));
  const planPath = path.join(helperDirectory, 'plan.json');
  const helperPath = path.join(helperDirectory, 'hold-lock.mjs');
  const planModule = pathToFileURL(path.resolve('scripts/evidence/plan.mjs')).href;
  const lockModule = pathToFileURL(path.resolve('scripts/evidence/run-lock.mjs')).href;
  await fsp.writeFile(planPath, `${JSON.stringify(fixture.plan, null, 2)}\n`, 'utf8');
  await fsp.writeFile(helperPath, [
    `import { loadPlan } from ${JSON.stringify(planModule)};`,
    `import { acquireRunLock } from ${JSON.stringify(lockModule)};`,
    'const plan = await loadPlan(process.argv[2]);',
    "await acquireRunLock(plan, 'test-stale-owner');"
  ].join('\n'), 'utf8');
  await execFile(process.execPath, [helperPath, planPath], { windowsHide: true, timeout: 30_000 });
  const recovered = await recoverRunLock(plan);
  assert.deepEqual(recovered, { ok: true, runId: plan.runId, recoveredLock: true, staleCommand: 'test-stale-owner' });

  const final = await acquireRunLock(plan, 'test-after-recovery');
  await final.release();
});
