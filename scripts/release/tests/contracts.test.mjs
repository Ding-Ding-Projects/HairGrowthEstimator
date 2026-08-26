import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deriveReleaseVersion,
  decodeCatalogBlob,
  selectCatalogDish,
  validateDependencyManifest,
  validateReleaseMetadata
} from '../release-context.mjs';
import { createBuilderConfig, validateBuilderConfig } from '../build-config.mjs';
import { validateContainerSourceContract } from '../container-contract.mjs';
import { validateBuildScriptContract, validateIconScriptContract, validateWorkflowContract } from '../workflow-contract.mjs';
import { categoryFor, countTextLines, extensionlessTextInventory, pathDisposition } from '../../core/count-lines.mjs';
import { isCompatibleGnuTar, recoverCheckoutHistory, resolveBundledNpmCli } from '../bootstrap-job-tools.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '..', '..', '..');

test('release version is stable for a logical run and monotonic across run numbers', () => {
  assert.equal(deriveReleaseVersion(17, 1), '1.0.17');
  assert.equal(deriveReleaseVersion(17, 2), '1.0.17');
  assert.equal(deriveReleaseVersion(18, 1), '1.0.18');
  assert.throws(() => deriveReleaseVersion(0), /positive integer/);
});

test('catalog selection skips every previously used published dish', () => {
  const dishes = [
    { id: 'hk-dish-0001', slug: 'first', name: { en: 'First', zhHant: '第一' }, image: { path: 'images/hk-dish-0001-first.png' } },
    { id: 'hk-dish-0002', slug: 'second', name: { en: 'Second', zhHant: '第二' }, image: { path: 'images/hk-dish-0002-second.png' } }
  ];
  const assets = new Map([
    ['hk-dish-0001-first.png', 'https://example.invalid/first.png'],
    ['hk-dish-0002-second.png', 'https://example.invalid/second.png']
  ]);
  assert.equal(selectCatalogDish(dishes, assets, new Set(['hk-dish-0001'])).catalogRecord, 'hk-dish-0002');
  assert.throws(() => selectCatalogDish(dishes, assets, new Set(['hk-dish-0001', 'hk-dish-0002'])), /unused published dish/);
});

test('catalog bytes bind the pinned commit path to the exact bounded Git blob', () => {
  const bytes = Buffer.from('{"schemaVersion":"1.0.0","dishes":[]}');
  const blobSha = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const pathRecord = { type: 'file', sha: blobSha, size: bytes.length };
  const blobRecord = { encoding: 'base64', sha: blobSha, size: bytes.length, content: bytes.toString('base64') };
  assert.equal(decodeCatalogBlob(pathRecord, blobRecord, { blobSha, bytes: bytes.length }).toString(), bytes.toString());
  assert.throws(() => decodeCatalogBlob({ ...pathRecord, sha: '0'.repeat(40) }, blobRecord, { blobSha, bytes: bytes.length }), /expected Git blob/);
});

test('dependency manifest pins a verified portable Node archive and all four workflow job inventories', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dependencies.manifest.json'), 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.doesNotThrow(() => validateDependencyManifest(manifest));
  const broken = structuredClone(manifest);
  broken.runtime.portable.sha256 = '0'.repeat(64);
  assert.throws(() => validateDependencyManifest(broken), /portable archive digest/);
  const missingJob = structuredClone(manifest);
  delete missingJob.workflowJobs.publishRelease;
  assert.throws(() => validateDependencyManifest(missingJob), /four-job inventory/);
  const extraPackage = structuredClone(manifest);
  extraPackage.npm.packages.push({ name: 'surprise-package', version: '1.0.0' });
  assert.throws(() => validateDependencyManifest(extraPackage), /hand-written exact package list/);
  const undeclaredProjectPackage = structuredClone(packageJson);
  undeclaredProjectPackage.devDependencies['surprise-package'] = '1.0.0';
  assert.throws(
    () => validateDependencyManifest(manifest, { packageJson: undeclaredProjectPackage, packageLock }),
    /hand-written exact package list/
  );
  const brokenWorkflowTool = structuredClone(manifest);
  brokenWorkflowTool.workflowTools.githubCli.windowsArchive.executableSha256 = '0'.repeat(64);
  assert.throws(() => validateDependencyManifest(brokenWorkflowTool), /fallback digest/);
  assert.equal(manifest.workflowTools.tar.ubuntuConstraint, '>=1.35 <2.0');
  for (const jobName of ['linuxContainer', 'publishRelease', 'finalizeRelease']) {
    assert.ok(manifest.workflowJobs[jobName].dependencies.some((item) => item.includes('GNU tar')));
    assert.ok(manifest.workflowJobs[jobName].checks.includes('tar --version'));
  }
  const missingTar = structuredClone(manifest);
  delete missingTar.workflowTools.tar;
  assert.throws(() => validateDependencyManifest(missingTar), /archive extractor/);
});

test('builder configuration uses an immutable icon URL and exact source identity', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const commit = '0123456789abcdef0123456789abcdef01234567';
  packageJson.version = '1.0.37';
  const config = createBuilderConfig(packageJson, { commit, version: '1.0.37' });
  assert.doesNotThrow(() => validateBuilderConfig(config, { commit, version: '1.0.37' }));
  assert.equal(config.extraMetadata.version, '1.0.37');
  assert.match(config.squirrelWindows.iconUrl, new RegExp(`/${commit}/assets/icons/app-icon\\.ico$`));
  const staged = config.files.find((entry) => entry.from === 'dist/package-input');
  assert.ok(staged.filter.includes('app/provenance.json'));
  assert.ok(config.files.find((entry) => entry.from === 'dist/package-source').filter.includes('!app/provenance.json'));
  assert.equal(config.extraResources.find((entry) => entry.to === 'server').from, 'dist/package-source/server');
  const broken = structuredClone(config);
  broken.squirrelWindows.iconUrl = 'https://raw.githubusercontent.com/Ding-Ding-Projects/HairGrowthEstimator/main/assets/icons/app-icon.ico';
  assert.throws(() => validateBuilderConfig(broken, { commit, version: '1.0.37' }), /immutable commit/);
  const sourceMutating = structuredClone(config);
  sourceMutating.files.find((entry) => entry.from === 'dist/package-input').filter = ['package.json'];
  assert.throws(() => validateBuilderConfig(sourceMutating, { commit, version: '1.0.37' }), /output-only release transformation/);
  const wrongReleaseVersion = structuredClone(config);
  wrongReleaseVersion.extraMetadata.version = '1.0.0';
  assert.throws(() => validateBuilderConfig(wrongReleaseVersion, { commit, version: '1.0.37' }), /release version/);
});

test('automatic package paths verify committed icons without rewriting tracked source', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const generator = fs.readFileSync(path.join(root, 'scripts', 'core', 'generate-icons.mjs'), 'utf8');
  assert.doesNotThrow(() => validateIconScriptContract(packageJson, generator));
  const mutatingPackage = structuredClone(packageJson);
  mutatingPackage.scripts.prepack = mutatingPackage.scripts.prepack.replace('npm run verify:icons', 'npm run generate:icons');
  assert.throws(() => validateIconScriptContract(mutatingPackage, generator), /must not rewrite tracked icons/);
});

test('container source contract requires network binding, provenance labels, and read-only runtime settings', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'app', 'release-metadata.json'), 'utf8'));
  assert.doesNotThrow(() => validateContainerSourceContract({ dockerfile, compose, metadata }));
  assert.throws(
    () => validateContainerSourceContract({ dockerfile: dockerfile.replace('HAIR_HOST=0.0.0.0', 'HAIR_HOST=127.0.0.1'), compose, metadata }),
    /direct container run/
  );
});

test('workflow contract builds both release products without tests or lint', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  const publisher = fs.readFileSync(path.join(root, 'scripts', 'release', 'publish-release.mjs'), 'utf8');
  const finalizer = fs.readFileSync(path.join(root, 'scripts', 'release', 'finalize-release.mjs'), 'utf8');
  assert.doesNotMatch(workflow, /^\s+branches:/m, 'Every push must receive its own branch-safe release run.');
  assert.doesNotThrow(() => validateWorkflowContract(workflow, publisher));
  assert.throws(() => validateWorkflowContract(workflow.replace('npm ci', 'npm test'), publisher), /must not run tests or lint/);
  assert.throws(() => validateWorkflowContract(workflow.replace('HGE_REQUIRE_CLEAN: "1"', 'HGE_REQUIRE_CLEAN: "0"'), publisher), /clean exact candidate/);
  const mainOnly = workflow.replace('  push:\n', '  push:\n    branches: [main]\n');
  assert.throws(() => validateWorkflowContract(mainOnly, publisher), /every push/);
  const unreviewedAction = workflow.replace(
    'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n      - name: Unreviewed action probe\n        uses: example/unreviewed@1111111111111111111111111111111111111111'
  );
  assert.throws(() => validateWorkflowContract(unreviewedAction, publisher), /unreviewed action/);
  const wrongJobName = workflow.replace('name: Build unsigned Squirrel.Windows release files', 'name: Build unsigned Windows files');
  assert.throws(() => validateWorkflowContract(wrongJobName, publisher), /display name/);
  const missingTarProbe = workflow.replace('          tar --version\n', '');
  assert.throws(() => validateWorkflowContract(missingTarProbe, publisher), /GNU tar extractor/);
  const missingNoopReceipt = finalizer.replace("atomicWriteFileSync(notesPath, plan.notes, 'utf8');", '');
  assert.throws(() => validateWorkflowContract(workflow, { publisher, finalizer: missingNoopReceipt }), /terminal note receipt/);
  const missingServerCurrentness = finalizer.replace("    '--include',\n", '');
  assert.throws(() => validateWorkflowContract(workflow, { publisher, finalizer: missingServerCurrentness }), /server-observed release-currentness/);
  const missingSafePartialOutput = workflow.replace(
    'node scripts/release/collect-safe-outputs.mjs windows dist/evidence/windows/partial',
    'Write-Output "Safe partial outputs skipped"'
  );
  assert.throws(() => validateWorkflowContract(missingSafePartialOutput, publisher), /safe partial outputs/);
});

test('one-click build scripts reject stale percent-expanded error propagation inside elevation blocks', () => {
  const build = fs.readFileSync(path.join(root, 'build.bat'), 'utf8');
  const installer = fs.readFileSync(path.join(root, 'build-installer.bat'), 'utf8');
  assert.doesNotThrow(() => validateBuildScriptContract(build, installer));
  const staleElevation = build.replace('      exit /b 19', '      exit /b %ERRORLEVEL%');
  assert.notEqual(staleElevation, build);
  assert.throws(() => validateBuildScriptContract(staleElevation, installer), /stale percent-expanded ERRORLEVEL/);
  const staleBootstrap = build.replace('  exit /b 20', '  exit /b %ERRORLEVEL%');
  assert.notEqual(staleBootstrap, build);
  assert.throws(() => validateBuildScriptContract(staleBootstrap, installer), /stale percent-expanded ERRORLEVEL after dependency bootstrap/);
});

test('missing-Git checkout recovery binds REST bytes before detaching the fetched commit', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-checkout-'));
  const source = path.join(directory, 'source');
  const origin = path.join(directory, 'origin.git');
  const recovered = path.join(directory, 'recovered');
  const rejected = path.join(directory, 'rejected');
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
  try {
    fs.mkdirSync(source);
    git(source, 'init');
    git(source, 'config', 'user.name', 'Release Fixture');
    git(source, 'config', 'user.email', 'fixture@example.invalid');
    fs.writeFileSync(path.join(source, 'fixture.bin'), Buffer.from([0, 1, 2, 3]));
    git(source, 'add', 'fixture.bin');
    git(source, 'commit', '-m', 'fixture');
    const commit = git(source, 'rev-parse', 'HEAD');
    execFileSync('git', ['clone', '--bare', source, origin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    fs.mkdirSync(recovered);
    fs.copyFileSync(path.join(source, 'fixture.bin'), path.join(recovered, 'fixture.bin'));
    assert.equal(recoverCheckoutHistory('git', { repositoryDirectory: recovered, expectedCommit: commit, originUrl: origin }), true);
    assert.equal(git(recovered, 'rev-parse', 'HEAD'), commit);
    assert.equal(git(recovered, 'status', '--porcelain=v1', '--untracked-files=all'), '');

    fs.mkdirSync(rejected);
    fs.writeFileSync(path.join(rejected, 'fixture.bin'), Buffer.from([9, 9, 9]));
    assert.throws(
      () => recoverCheckoutHistory('git', { repositoryDirectory: rejected, expectedCommit: commit, originUrl: origin }),
      /REST checkout bytes do not exactly match/
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('workflow bootstrap resolves bundled npm from both Windows and Linux Node archive layouts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-npm-layout-'));
  try {
    const windowsNode = path.join(directory, 'windows', 'node.exe');
    const windowsNpm = path.join(directory, 'windows', 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const linuxNode = path.join(directory, 'linux', 'bin', 'node');
    const linuxNpm = path.join(directory, 'linux', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
    fs.mkdirSync(path.dirname(windowsNpm), { recursive: true });
    fs.mkdirSync(path.dirname(linuxNpm), { recursive: true });
    fs.writeFileSync(windowsNpm, '');
    fs.writeFileSync(linuxNpm, '');
    assert.equal(resolveBundledNpmCli(windowsNode), windowsNpm);
    assert.equal(resolveBundledNpmCli(linuxNode), linuxNpm);
    fs.rmSync(linuxNpm);
    assert.throws(() => resolveBundledNpmCli(linuxNode), /bundled npm CLI/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Ubuntu archive extraction accepts only the inventoried GNU tar range', () => {
  assert.equal(isCompatibleGnuTar('tar (GNU tar) 1.35'), true);
  assert.equal(isCompatibleGnuTar('tar (GNU tar) 1.34'), false);
  assert.equal(isCompatibleGnuTar('bsdtar 3.7.4 - libarchive 3.7.4'), false);
});

test('line counter exposes exact categories and does not add a trailing phantom line', () => {
  assert.deepEqual(countTextLines('one\n\ntwo\n'), { total: 3, nonBlank: 2 });
  assert.equal(categoryFor('app/main.js'), 'Application and service source');
  assert.equal(categoryFor('tests/core/hair.test.js'), 'Tests');
  assert.equal(categoryFor('app/renderer/styles.css'), 'Styles and markup');
  assert.equal(categoryFor('app/provenance.json'), 'Generated');
  assert.equal(categoryFor('assets/hair-growth/hair-growth-image-sequence-manifest.json'), 'Generated');
  assert.equal(categoryFor('assets/hair-growth/stages.json'), 'Scripts and configuration');
  assert.deepEqual(extensionlessTextInventory, [
    ['.gitignore', 'Scripts and configuration'],
    ['Dockerfile', 'Scripts and configuration']
  ]);
  assert.equal(pathDisposition('Dockerfile').text, true);
  assert.equal(pathDisposition('.gitignore').text, true);
  assert.equal(pathDisposition('LICENSE').text, false);
});

test('release metadata remains internally consistent with selected dish and package version', () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'app', 'release-metadata.json'), 'utf8'));
  assert.doesNotThrow(() => validateReleaseMetadata(metadata, { version: metadata.version }));
  assert.throws(() => validateReleaseMetadata({ ...metadata, publicPhotoUrl: 'http://example.invalid/photo.png' }, { version: metadata.version }), /HTTPS/);
  const unavailable = {
    ...metadata,
    catalogStatus: 'unavailable',
    catalogUnavailableReason: 'public-catalog-unavailable',
    codeName: null,
    catalogRecord: null,
    catalogSlug: null,
    publicPhotoUrl: null,
    publicPhotoAsset: null
  };
  assert.doesNotThrow(() => validateReleaseMetadata(unavailable, { version: metadata.version }));
  assert.throws(() => validateReleaseMetadata({ ...unavailable, codeName: 'Invented' }, { version: metadata.version }), /no invented dish/);
});
