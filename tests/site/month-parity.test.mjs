import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const LEGACY_MONTH_DAYS = '30.4375';
const CANONICAL_EXPRESSION = '365.2425 / 12';
const CANONICAL_STATEMENT = '365.2425 / 12 = 30.436875 days per estimate month';
const PUBLIC_MONTH_DOCUMENTS = Object.freeze([
  'CHANGELOG.md',
  'HANDOFF.md',
  'ROADMAP.md',
  'docs/README.md',
  'docs/features/README.md',
  'docs/features/hair-growth-estimation.md',
  'docs/features/visual-growth-timeline.md',
  'docs/inventory/site-universal-features.md',
  'docs/site/README.md',
  'docs/site/home-and-download.md'
]);

async function loadContract() {
  const source = await readFile(join(root, 'site', 'state-contract.js'), 'utf8');
  const context = vm.createContext({ console, structuredClone });
  vm.runInContext(source, context, { filename: 'state-contract.js' });
  assert.ok(context.HairGrowthStateContract, 'state contract must be exposed to the browser');
  return { contract: context.HairGrowthStateContract, source };
}

function approximatelyEqual(actual, expected, label) {
  assert.ok(Number.isFinite(actual), `${label} must be finite`);
  const tolerance = Math.max(1, Math.abs(expected)) * 1e-12;
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, received ${actual}`);
}

function auditMonthParity({ app, contract, documentation, vectors }) {
  if (contract.includes(LEGACY_MONTH_DAYS)) throw new Error('Legacy month length remains in calculation source.');
  if (app.includes(LEGACY_MONTH_DAYS)) throw new Error('Legacy month length remains in website source.');
  if (documentation.includes(LEGACY_MONTH_DAYS)) throw new Error('Legacy month length remains in public estimation documentation.');
  if (!contract.includes(CANONICAL_EXPRESSION)) throw new Error('Canonical tropical-year month expression is missing from calculation source.');
  if (!app.includes('calculateGrowthProjection({')) throw new Error('Website estimator does not use the canonical growth projection contract.');
  if (!documentation.includes(CANONICAL_STATEMENT)) throw new Error('Public estimation documentation does not state the canonical month contract exactly.');
  if (!/current-length calculation/i.test(documentation)) throw new Error('Public estimation documentation does not name the current-length calculation.');
  if (!/projected-target calculation/i.test(documentation)) throw new Error('Public estimation documentation does not name the projected-target calculation.');
  if (vectors.contract.daysPerYear !== 365.2425 || vectors.contract.monthsPerYear !== 12 || vectors.contract.daysPerMonth !== 30.436875) {
    throw new Error('Shared deterministic vectors do not carry the canonical month contract.');
  }
}

test('canonical month contract drives shared current-length and projected-target vectors', async () => {
  const [{ contract }, vectorText] = await Promise.all([
    loadContract(),
    readFile(join(here, 'fixtures', 'growth-calculation-vectors.json'), 'utf8')
  ]);
  const fixture = JSON.parse(vectorText);
  assert.equal(fixture.schemaVersion, 1);
  assert.deepEqual(Object.keys(fixture).sort(), ['contract', 'schemaVersion', 'vectors']);
  assert.deepEqual(fixture.vectors.map((vector) => vector.id), [
    'one-estimate-month',
    'half-estimate-month',
    'six-estimate-months',
    'target-already-reached',
    'zero-rate-unavailable-target'
  ]);
  assert.equal(contract.DAYS_PER_ESTIMATE_MONTH, fixture.contract.daysPerMonth);
  assert.equal(typeof contract.calculateGrowthProjection, 'function');

  for (const vector of fixture.vectors) {
    const actual = contract.calculateGrowthProjection(vector.input);
    approximatelyEqual(actual.elapsedMonths, vector.expected.elapsedMonths, `${vector.id} elapsedMonths`);
    approximatelyEqual(actual.currentLengthCm, vector.expected.currentLengthCm, `${vector.id} currentLengthCm`);
    approximatelyEqual(actual.remainingLengthCm, vector.expected.remainingLengthCm, `${vector.id} remainingLengthCm`);
    assert.equal(Number.isFinite(actual.daysToTarget), vector.expected.targetAvailable, `${vector.id} target availability`);
    if (vector.expected.targetAvailable) {
      approximatelyEqual(actual.monthsToTarget, vector.expected.monthsToTarget, `${vector.id} monthsToTarget`);
      approximatelyEqual(actual.daysToTarget, vector.expected.daysToTarget, `${vector.id} daysToTarget`);
    } else {
      assert.equal(actual.monthsToTarget, Infinity);
      assert.equal(actual.daysToTarget, Infinity);
    }
  }
});

test('legacy month approximation turns source and documentation boundaries red, then restored inputs are green', async () => {
  const [app, contract, documentationParts, vectorText] = await Promise.all([
    readFile(join(root, 'site', 'app.js'), 'utf8'),
    readFile(join(root, 'site', 'state-contract.js'), 'utf8'),
    Promise.all(PUBLIC_MONTH_DOCUMENTS.map(async (relativePath) => `${relativePath}\n${await readFile(join(root, relativePath), 'utf8')}`)),
    readFile(join(here, 'fixtures', 'growth-calculation-vectors.json'), 'utf8')
  ]);
  const documentation = documentationParts.join('\n');
  const sources = { app, contract, documentation, vectors: JSON.parse(vectorText) };
  assert.doesNotThrow(() => auditMonthParity(sources));

  const sourceRegression = {
    ...sources,
    contract: contract.replace(CANONICAL_EXPRESSION, LEGACY_MONTH_DAYS)
  };
  assert.notEqual(sourceRegression.contract, contract, 'the deliberate source regression must change the exact canonical expression');
  assert.throws(() => auditMonthParity(sourceRegression), /Legacy month length remains in calculation source/);

  const documentationRegression = {
    ...sources,
    documentation: documentation.replace(CANONICAL_STATEMENT, `${LEGACY_MONTH_DAYS} days per estimate month`)
  };
  assert.notEqual(documentationRegression.documentation, documentation, 'the deliberate documentation regression must change the exact canonical statement');
  assert.throws(() => auditMonthParity(documentationRegression), /Legacy month length remains in public estimation documentation/);

  assert.doesNotThrow(() => auditMonthParity(sources));
});
