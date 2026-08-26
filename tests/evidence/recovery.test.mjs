import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { EvidenceError, canonicalHash } from '../../scripts/evidence/common.mjs';
import { validateCleanupWindowOwnership, validateLaunchRecoveryMarker } from '../../scripts/evidence/evidence-run.mjs';
import { validatePlan } from '../../scripts/evidence/plan.mjs';
import { createPlanFixture } from './fixtures.mjs';

test('cleanup accepts an already-exited owned process tree only when the task desktop has no visible windows', () => {
  assert.deepEqual(validateCleanupWindowOwnership([], []), { shouldResolveWindow: false, ownedProcessIds: [] });
  assert.throws(() => validateCleanupWindowOwnership([{ process_id: 99, handle: 100, width: 320, height: 240 }], []),
    (error) => error instanceof EvidenceError && error.code === 'UNRELATED_WINDOW');
  assert.deepEqual(validateCleanupWindowOwnership([{ process_id: 99 }], [99]), { shouldResolveWindow: true, ownedProcessIds: [99] });
});

test('launch recovery accepts an exact armed pre-PID marker and refuses ambiguous fields', async (t) => {
  const fixture = await createPlanFixture();
  t.after(() => fixture.cleanup());
  const plan = validatePlan(fixture.plan);
  const marker = {
    schemaVersion: 1,
    runId: plan.runId,
    desktop: `HGE-${canonicalHash(plan.runId).slice(0, 24)}`,
    state: 'armed',
    pid: null,
    launchStartedAt: '2026-08-25T05:00:00.000Z',
    launchReturnedAt: null,
    pidAbsentBeforeLaunch: null,
    sourceSha: plan.sourceSha,
    executableSha256: plan.artifact.primary.sha256,
    applicationExecutablePath: path.join(plan.runRoot, 'frozen-package', path.basename(plan.application.executablePath)),
    frozenPackage: {
      root: path.join(plan.runRoot, 'frozen-package'),
      fileCount: 2,
      bytes: 2,
      inventorySha256: 'b'.repeat(64)
    },
    processTree: null
  };
  assert.equal(validateLaunchRecoveryMarker(plan, marker), marker);
  assert.throws(() => validateLaunchRecoveryMarker(plan, { ...marker, pid: 99 }),
    (error) => error instanceof EvidenceError && error.code === 'RECOVERY_IDENTITY_FAILED');
  assert.throws(() => validateLaunchRecoveryMarker(plan, { ...marker, state: 'unknown' }),
    (error) => error instanceof EvidenceError && error.code === 'RECOVERY_IDENTITY_FAILED');
});
