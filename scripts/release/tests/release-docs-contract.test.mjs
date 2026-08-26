import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '..', '..', '..');
const documentationRoot = path.join(root, 'docs', 'release');
const articles = [
  'README.md',
  'automation.md',
  'container-packaging.md',
  'dependency-inventory.md',
  'pages-deployment.md',
  'provenance-and-integrity.md',
  'windows-packaging.md'
];

function article(name) {
  return fs.readFileSync(path.join(documentationRoot, name), 'utf8').replace(/\r\n/g, '\n');
}

function requireAll(text, values, label) {
  for (const value of values) {
    assert.ok(text.includes(value), `${label} must include ${value}.`);
  }
}

for (const name of articles) {
  test(`${name} ends with a complete suggested-article list`, () => {
    const text = article(name);
    const marker = '\n## Suggested articles\n';
    const markerIndex = text.lastIndexOf(marker);
    assert.notEqual(markerIndex, -1, `${name} must end with a Suggested articles section.`);
    assert.equal(text.indexOf('\n## ', markerIndex + marker.length), -1, `${name} must keep Suggested articles as its final level-two section.`);
    const links = [...text.slice(markerIndex + marker.length).matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)].map((match) => match[1]);
    assert.ok(links.length >= 2, `${name} must suggest at least two release articles.`);
    for (const link of links) {
      assert.ok(articles.includes(link), `${name} suggests an unknown release article: ${link}.`);
    }
  });
}

test('release overview documents the exact delivery topology and first-release boundary', () => {
  const text = article('README.md');
  const jobs = ['`windows-package`', '`linux-container`', '`publish-release`', '`finalize-release`'];
  let previous = -1;
  for (const job of jobs) {
    const index = text.indexOf(job);
    assert.ok(index > previous, `Release overview must list ${job} in workflow order.`);
    previous = index;
  }
  requireAll(text, ['every push', '`workflow_dispatch`', '`dist/terminal-transfer`', 'no prior full package', 'no delta package'], 'Release overview');
});

test('automation documents the post-run wrapper and fixed terminal transfer', () => {
  const text = article('automation.md');
  requireAll(text, [
    '`scripts/release/finalize-run.mjs`',
    '`dist/terminal-transfer`',
    '`release-context.json`',
    '`trusted-product-validation.json`',
    '`installer-manifest.json`',
    '`terminal-transfer-receipt.json`',
    '`node scripts/release/finalize-run.mjs --repository Ding-Ding-Projects/HairGrowthEstimator --run-id <positive-decimal-run-id> --commit <40-character-lowercase-SHA>`'
  ], 'Release automation');
  assert.match(text, /every push/);
  assert.match(text, /`workflow_dispatch`/);
  assert.match(text, /one-shot local execution/);
  assert.match(text, /maximum exact `completed_at`/);
  assert.match(text, /`releaseCurrentnessVerifiedAt`/);
  assert.match(text, /GitHub response `Date`/);
  assert.doesNotMatch(text, /helper is one-way and idempotent/);
});

test('dependency inventory covers GNU tar in every Ubuntu job', () => {
  const text = article('dependency-inventory.md');
  requireAll(text, ['GNU tar `>=1.35 <2.0`', '`tar --version`', '`linux-container`', '`publish-release`', '`finalize-release`'], 'Dependency inventory');
});

test('provenance documents output-only release bytes and packaged version binding', () => {
  const text = article('provenance-and-integrity.md');
  requireAll(text, [
    '`dist/package-input`',
    '`extraMetadata.version`',
    '`scripts/release/assert-source-preserved.mjs`',
    '`npm run verify:icons`',
    'tracked source remains byte-identical'
  ], 'Provenance article');
});

test('Windows packaging documents source preservation, icon verification, and delta acquisition', () => {
  const text = article('windows-packaging.md');
  requireAll(text, [
    '`extraMetadata.version`',
    '`npm run verify:icons`',
    '`scripts/release/assert-source-preserved.mjs`',
    'no prior full package',
    'no delta package',
    'fails closed'
  ], 'Windows packaging article');
});

test('container packaging documents the inventoried GNU tar boundary', () => {
  const text = article('container-packaging.md');
  requireAll(text, ['GNU tar `>=1.35 <2.0`', '`tar --version`', '`linux-container`'], 'Container packaging article');
});
