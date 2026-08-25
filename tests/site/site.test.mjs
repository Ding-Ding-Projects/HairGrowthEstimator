import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { auditSiteSources, auditSiteTree } from './site-guard.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const stageLengths = [0.3, 1.5, 3, 5, 9, 14, 20, 28];

async function publicTextFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await publicTextFiles(path));
    else if (entry.isFile() && /\.(?:md|html|css|js|mjs|json|svg|webmanifest)$/i.test(entry.name)) files.push(path);
  }
  return files;
}

test('hand-written website boundaries are complete', async () => {
  const result = await auditSiteTree(root);
  assert.ok(result.features >= 35);
  assert.ok(result.builders >= 16);
});

test('negative regression turns red and restores green on provenance removal', async () => {
  const template = await readFile(join(root, 'site', 'index.template.html'), 'utf8');
  const app = await readFile(join(root, 'site', 'app.js'), 'utf8');
  const styles = await readFile(join(root, 'site', 'styles.css'), 'utf8');
  const inventory = await readFile(join(root, 'docs', 'inventory', 'site-universal-features.md'), 'utf8');
  assert.doesNotThrow(() => auditSiteSources({ template, app, styles, inventory }));
  const broken = template.replace('id="front-provenance"', 'id="front-provenance-removed"');
  assert.throws(() => auditSiteSources({ template: broken, app, styles, inventory }), /front-screen provenance/);
  assert.doesNotThrow(() => auditSiteSources({ template, app, styles, inventory }));
});

test('negative regression turns red and restores green on builder removal', async () => {
  const template = await readFile(join(root, 'site', 'index.template.html'), 'utf8');
  const app = await readFile(join(root, 'site', 'app.js'), 'utf8');
  const styles = await readFile(join(root, 'site', 'styles.css'), 'utf8');
  const inventory = await readFile(join(root, 'docs', 'inventory', 'site-universal-features.md'), 'utf8');
  const broken = template.replace('data-open-regex-for="strip-search"', 'data-open-regex-for="strip-search-removed"');
  assert.throws(() => auditSiteSources({ template: broken, app, styles, inventory }), /Regex builder strip-search/);
  assert.doesNotThrow(() => auditSiteSources({ template, app, styles, inventory }));
});

test('composition emits commit-bound provenance and local assets', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'hair-growth-site-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const env = { ...process.env, SITE_OUTPUT_DIR: directory };
  delete env.REQUIRE_HAIR_ASSETS;
  execFileSync(process.execPath, [join(root, 'scripts', 'compose-site.mjs')], { cwd: root, env, stdio: 'pipe' });
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  const stateContract = await readFile(join(directory, 'state-contract.js'), 'utf8');
  assert.equal(/__[A-Z0-9_]+__/.test(html), false);
  assert.match(html, /"version":"1\.0\.0"/);
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.match(html, new RegExp(commit));
  assert.ok(html.indexOf('id="front-provenance"') < html.indexOf('id="app-shell"'));
  assert.ok(html.indexOf('src="state-contract.js"') < html.indexOf('src="app.js"'));
  assert.match(stateContract, /createStateCoordinator/);
  assert.match(html, /<script id="bundled-hair-assets" type="application\/json">\[\]<\/script>/);
  const rootPreview = await readFile(join(root, 'social-preview.png'));
  const servedPreview = await readFile(join(directory, 'social-preview.png'));
  assert.equal(createHash('sha256').update(rootPreview).digest('hex'), createHash('sha256').update(servedPreview).digest('hex'));
  assert.deepEqual([...rootPreview.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(rootPreview.readUInt32BE(16), 1280);
  assert.equal(rootPreview.readUInt32BE(20), 640);
});

test('strict composition consumes the canonical stages manifest and verifies every digest', async (context) => {
  const fixture = await mkdtemp(join(tmpdir(), 'hair-growth-site-strict-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  for (const directory of ['site', 'docs', 'scripts']) await cp(join(root, directory), join(fixture, directory), { recursive: true });
  for (const file of ['package.json', 'CHANGELOG.md', 'social-preview.png']) await cp(join(root, file), join(fixture, file));
  const assetDirectory = join(fixture, 'assets', 'hair-growth');
  await mkdir(assetDirectory, { recursive: true });
  const records = [];
  const fixtureBytes = [];
  for (const [index, length] of stageLengths.entries()) {
    const file = `stage-${String(index + 1).padStart(2, '0')}.png`;
    const bytes = Buffer.alloc(2048 + index, index + 1);
    fixtureBytes.push(bytes);
    await writeFile(join(assetDirectory, file), bytes);
    records.push({ length, file, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await writeFile(join(assetDirectory, 'stages.json'), JSON.stringify({ schemaVersion: 1, unit: 'cm', stages: records }));
  const output = join(fixture, 'output');
  const env = { ...process.env, SITE_OUTPUT_DIR: output, REQUIRE_HAIR_ASSETS: '1', SOURCE_DATE_EPOCH: '1787630400' };
  const compose = () => execFileSync(process.execPath, [join(fixture, 'scripts', 'compose-site.mjs')], { cwd: fixture, env, stdio: 'pipe' });

  assert.doesNotThrow(compose);
  let html = await readFile(join(output, 'index.html'), 'utf8');
  const payload = html.match(/<script id="bundled-hair-assets" type="application\/json">([^<]+)<\/script>/)?.[1];
  assert.ok(payload, 'composed hair-stage payload is present');
  const stages = JSON.parse(payload);
  assert.deepEqual(stages.map((entry) => entry.cm), stageLengths);
  assert.deepEqual(stages.map((entry) => entry.inches), stageLengths.map((length) => Number((length / 2.54).toFixed(4))));

  await writeFile(join(assetDirectory, records[0].file), Buffer.alloc(2048, 99));
  assert.throws(compose, /does not match its manifest SHA-256 digest/);
  await writeFile(join(assetDirectory, records[0].file), fixtureBytes[0]);
  assert.doesNotThrow(compose);
  html = await readFile(join(output, 'index.html'), 'utf8');
  assert.match(html, /"cm":28,"inches":11\.0236/);
});

test('documentation links resolve inside the public tree', async () => {
  const paths = (await publicTextFiles(join(root, 'docs'))).filter((path) => path.toLowerCase().endsWith('.md'));
  paths.push(...['README.md', 'ROADMAP.md', 'HANDOFF.md', 'CHANGELOG.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'LICENSE'].map((path) => join(root, path)));
  for (const path of paths) {
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].trim();
      if (!target || target.startsWith('#') || /^(?:https?:|mailto:)/i.test(target)) continue;
      const localPath = resolve(dirname(path), decodeURIComponent(target.split('#')[0]));
      await assert.doesNotReject(access(localPath), `${path} links to missing local path ${target}`);
    }
  }
});

test('every categorized feature article has the full documentation contract', async () => {
  const requiredHeadings = ['Behavior', 'Configuration', 'Failure modes', 'Security and privacy', 'Verification', 'Suggested articles'];
  for (const category of ['features', 'operations', 'security', 'site']) {
    const directory = join(root, 'docs', category);
    const index = await readFile(join(directory, 'README.md'), 'utf8');
    const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md');
    assert.ok(entries.length > 0, `${category} must contain feature articles`);
    for (const entry of entries) {
      const source = await readFile(join(directory, entry.name), 'utf8');
      for (const heading of requiredHeadings) assert.match(source, new RegExp(`^## ${heading}$`, 'm'), `${category}/${entry.name} is missing ${heading}`);
      assert.match(index, new RegExp(`\\(${entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`), `${category}/README.md does not index ${entry.name}`);
    }
  }
});

test('public source contains no em dash and no analytics or CDN runtime', async () => {
  const roots = ['site', 'docs', 'scripts', 'tests/site'];
  const paths = (await Promise.all(roots.map((path) => publicTextFiles(join(root, path))))).flat();
  paths.push(...['README.md', 'ROADMAP.md', 'HANDOFF.md', 'CHANGELOG.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md'].map((path) => join(root, path)));
  const disallowedRuntimeReferences = new RegExp([
    'google' + '-analytics',
    'google' + 'tagmanager',
    'segment' + '\\.com',
    'cdn' + '\\.jsdelivr',
    'unpkg' + '\\.com'
  ].join('|'), 'i');
  for (const path of paths) {
    const source = await readFile(path, 'utf8');
    assert.equal(source.includes('\u2014'), false, `${path} contains an em dash`);
    assert.doesNotMatch(source, disallowedRuntimeReferences);
  }
});

test('private vocabulary scan uses only an external optional source', async (context) => {
  const sourcePath = process.env.PRIVATE_VOCABULARY_SOURCE;
  if (!sourcePath) return context.skip('PRIVATE_VOCABULARY_SOURCE is not available, public checkout remains buildable.');
  const dictionary = JSON.parse(await readFile(sourcePath, 'utf8'));
  const mappingTerms = Object.values(dictionary.mappings || {});
  const catalogTerms = Array.isArray(dictionary.terms) ? dictionary.terms.flatMap((term) => [term?.alias, term?.plural]) : [];
  const terms = [...mappingTerms, ...catalogTerms].filter((value) => typeof value === 'string' && value.length > 2 && value !== 'Slop Machine');
  const publicPaths = (await Promise.all(['site', 'docs', 'scripts', 'tests/site'].map((path) => publicTextFiles(join(root, path))))).flat();
  publicPaths.push(...['README.md', 'ROADMAP.md', 'HANDOFF.md', 'CHANGELOG.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'LICENSE'].map((path) => join(root, path)));
  for (const path of publicPaths) {
    const source = await readFile(path, 'utf8');
    for (const term of terms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundary = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u');
      assert.doesNotMatch(source, boundary, `${path} contains a private term from the external source`);
    }
  }
});
