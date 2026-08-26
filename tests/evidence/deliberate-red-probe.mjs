import { toPublicFailure } from '../../scripts/evidence/common.mjs';
import { validatePlan } from '../../scripts/evidence/plan.mjs';

try {
  validatePlan({ schemaVersion: 1, route: 'cheap-lowlevel-headless', captureKind: 'monitor' });
  process.stdout.write(`${JSON.stringify({ ok: true, unexpected: 'visible capture was accepted' })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify(toPublicFailure(error))}\n`);
  process.exitCode = 1;
}
