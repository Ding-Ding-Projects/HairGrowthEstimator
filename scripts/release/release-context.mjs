import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync } from './atomic-file.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const DEFAULT_CATALOG_COMMIT = '7cc5dd6dcbd6edf64d29fdd3c0eda67500e24244';
const DEFAULT_CATALOG_BLOB_SHA = '736e8c1d9e40e1d146f3c3b11bb329b97c4ef515';
const DEFAULT_CATALOG_BYTES = 8_162_059;
const PHOTO_REPOSITORY = 'Ding-Ding-Projects/dim-sum-photos';
const SOURCE_REPOSITORY = 'Ding-Ding-Projects/HairGrowthEstimator';

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new TypeError(`${label} must be a positive integer.`);
  return number;
}

function semanticVersion(value, label = 'version') {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) throw new TypeError(`${label} must be a three-part semantic version.`);
  return value;
}

function fullCommit(value, label = 'commit') {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) throw new TypeError(`${label} must be a full lowercase Git commit SHA.`);
  return value;
}

function httpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new TypeError(`${label} must be an HTTPS URL without embedded credentials.`);
  return parsed.href;
}

export function deriveReleaseVersion(runNumber) {
  return `1.0.${positiveInteger(runNumber, 'run number')}`;
}

export function validateDeltaFeedState(deltaFeed) {
  const expectedKeys = ['remoteReleases', 'requiredAfterFirstRelease', 'status'];
  if (
    !deltaFeed
    || typeof deltaFeed !== 'object'
    || Array.isArray(deltaFeed)
    || JSON.stringify(Object.keys(deltaFeed).sort()) !== JSON.stringify(expectedKeys)
    || deltaFeed.status !== 'first-release-no-previous-package'
    || deltaFeed.remoteReleases !== null
    || deltaFeed.requiredAfterFirstRelease !== true
  ) {
    throw new TypeError('First-release delta state must record no previous package and the fail-closed later-release requirement.');
  }
  return deltaFeed;
}

export function selectCatalogDish(dishes, publishedAssets, usedCatalogRecords, startIndex = 0) {
  if (!Array.isArray(dishes) || !(publishedAssets instanceof Map) || !(usedCatalogRecords instanceof Set)) {
    throw new TypeError('Catalog selection requires dishes, published assets, and used records.');
  }
  const orderedDishes = [...dishes.slice(Math.max(0, Number(startIndex) || 0)), ...dishes.slice(0, Math.max(0, Number(startIndex) || 0))];
  for (const dish of orderedDishes) {
    const filename = typeof dish?.image?.path === 'string' ? path.posix.basename(dish.image.path) : '';
    const photoUrl = publishedAssets.get(filename);
    if (!/^hk-dish-\d{4}$/.test(dish?.id || '') || usedCatalogRecords.has(dish.id) || !photoUrl) continue;
    if (typeof dish?.name?.en !== 'string' || typeof dish?.name?.zhHant !== 'string' || !dish.name.en.trim() || !dish.name.zhHant.trim()) continue;
    return {
      catalogStatus: 'resolved',
      catalogUnavailableReason: null,
      codeName: `${dish.name.en.trim()} · ${dish.name.zhHant.trim()}`,
      catalogRecord: dish.id,
      catalogSlug: dish.slug,
      publicPhotoUrl: httpsUrl(photoUrl, 'published catalog photo'),
      publicPhotoAsset: filename
    };
  }
  throw new Error('No unused published dish remains in the verified catalog inventory.');
}

function unavailableCatalogSelection() {
  return {
    catalogStatus: 'unavailable',
    catalogUnavailableReason: 'public-catalog-unavailable',
    codeName: null,
    catalogRecord: null,
    catalogSlug: null,
    publicPhotoUrl: null,
    publicPhotoAsset: null
  };
}

export function validateDependencyManifest(manifest, options = {}) {
  if (!manifest || manifest.schemaVersion !== 2 || manifest.platform !== 'win32-x64') throw new TypeError('Dependency manifest schema or platform is unsupported.');
  const gitRuntime = manifest.git;
  if (gitRuntime?.exactVersion !== '2.55.0.windows.2' || gitRuntime.archive !== 'MinGit-2.55.0.2-64-bit.zip' || gitRuntime.url !== 'https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.2/MinGit-2.55.0.2-64-bit.zip') {
    throw new TypeError('Dependency manifest must pin the exact canonical MinGit release.');
  }
  for (const value of [gitRuntime.sha256, gitRuntime.commandExecutableSha256, gitRuntime.coreExecutableSha256]) {
    if (!/^[0-9a-f]{64}$/.test(value || '') || /^0{64}$/.test(value || '')) throw new TypeError('Dependency manifest MinGit digests are invalid.');
  }
  const runtime = manifest.runtime;
  semanticVersion(runtime?.exactVersion, 'Node.js version');
  if (runtime.name !== 'Node.js' || runtime.portable?.archive !== `node-v${runtime.exactVersion}-win-x64.zip`) {
    throw new TypeError('Dependency manifest must name the exact portable Node.js archive.');
  }
  const expectedUrl = `https://nodejs.org/dist/v${runtime.exactVersion}/${runtime.portable.archive}`;
  if (runtime.portable.url !== expectedUrl) throw new TypeError('Dependency manifest portable Node.js URL is not canonical.');
  if (!/^[0-9a-f]{64}$/.test(runtime.portable.sha256) || /^0{64}$/.test(runtime.portable.sha256)) {
    throw new TypeError('Dependency manifest portable archive digest must be a nonzero SHA-256 value.');
  }
  if (!/^[0-9a-f]{64}$/.test(runtime.portable.nodeExecutableSha256 || '')) throw new TypeError('Dependency manifest must pin the extracted Node.js executable digest.');
  const expectedPackages = [
    ['@electron/asar', '4.3.0'],
    ['electron', '44.0.0'],
    ['electron-builder', '26.15.3'],
    ['electron-builder-squirrel-windows', '26.15.3'],
    ['resedit', '1.7.2'],
    ['sharp', '0.34.3']
  ];
  const actualPackages = Array.isArray(manifest.npm?.packages)
    ? manifest.npm.packages.map((item) => [item.name, item.version]).sort(([left], [right]) => left.localeCompare(right))
    : [];
  const projectPackage = options.packageJson || JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const lockfile = options.packageLock || JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
  const projectDependencyEntries = Object.entries(projectPackage.dependencies || {});
  const projectDevelopmentEntries = Object.entries(projectPackage.devDependencies || {});
  const projectPackages = Object.entries({
    ...(projectPackage.dependencies || {}),
    ...(projectPackage.devDependencies || {})
  }).sort(([left], [right]) => left.localeCompare(right));
  const lockRoot = lockfile.packages?.[''] || {};
  const lockDependencyEntries = Object.entries(lockRoot.dependencies || {});
  const lockDevelopmentEntries = Object.entries(lockRoot.devDependencies || {});
  const lockPackages = Object.entries({
    ...(lockRoot.dependencies || {}),
    ...(lockRoot.devDependencies || {})
  }).sort(([left], [right]) => left.localeCompare(right));
  if (
    JSON.stringify(actualPackages) !== JSON.stringify(expectedPackages)
    || JSON.stringify(projectPackages) !== JSON.stringify(expectedPackages)
    || JSON.stringify(lockPackages) !== JSON.stringify(expectedPackages)
    || projectDependencyEntries.length + projectDevelopmentEntries.length !== projectPackages.length
    || lockDependencyEntries.length + lockDevelopmentEntries.length !== lockPackages.length
    || manifest.npm.integritySource !== 'package-lock.json'
  ) {
    throw new TypeError('Dependency manifest direct npm inventory must equal the hand-written exact package list.');
  }
  for (const [name, version] of expectedPackages) {
    const locked = lockfile.packages?.['node_modules/' + name];
    if (locked?.version !== version || typeof locked.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/=]+$/.test(locked.integrity)) {
      throw new TypeError('Lockfile direct package record is missing exact version and integrity: ' + name);
    }
  }
  if (!/^[0-9a-f]{64}$/.test(manifest.npm.squirrelResourceEditor?.sha256 || '') || /^0{64}$/.test(manifest.npm.squirrelResourceEditor?.sha256 || '')) {
    throw new TypeError('Dependency manifest must pin the Squirrel resource editor digest.');
  }
  const squirrelTools = manifest.npm.squirrelExecutableTools;
  if (!squirrelTools || JSON.stringify(Object.keys(squirrelTools).sort()) !== JSON.stringify(['Setup.exe', 'Squirrel.exe', 'WriteZipToSetup.exe'])) {
    throw new TypeError('Dependency manifest must pin the exact Squirrel executable inventory.');
  }
  if (Object.values(squirrelTools).some((value) => !/^[0-9a-f]{64}$/.test(value) || /^0{64}$/.test(value))) {
    throw new TypeError('Dependency manifest contains an invalid Squirrel executable digest.');
  }
  const jobs = manifest.workflowJobs;
  const expectedJobs = {
    finalizeRelease: 'ubuntu-24.04',
    linuxContainer: 'ubuntu-24.04',
    publishRelease: 'ubuntu-24.04',
    windowsPackage: 'windows-2025'
  };
  if (JSON.stringify(Object.keys(jobs || {}).sort()) !== JSON.stringify(Object.keys(expectedJobs).sort())) {
    throw new TypeError('Dependency manifest must contain the exact hand-written four-job inventory.');
  }
  for (const [jobName, job] of Object.entries(jobs)) {
    if (job.runner !== expectedJobs[jobName] || !Array.isArray(job.dependencies) || job.dependencies.length === 0 || !Array.isArray(job.checks) || job.checks.length === 0 || !job.bootstrap || !job.cacheMissProof) {
      throw new TypeError(`Dependency manifest workflow job ${jobName} is incomplete.`);
    }
    if (job.runner === 'ubuntu-24.04' && (!job.dependencies.some((item) => item.includes('GNU tar >=1.35 <2.0')) || !job.checks.includes('tar --version'))) {
      throw new TypeError(`Dependency manifest workflow job ${jobName} omits the archive extractor inventory or probe.`);
    }
  }
  const tools = manifest.workflowTools;
  if (
    tools?.node?.exactVersion !== '22.18.0'
    || tools?.npm?.exactVersion !== '10.9.3'
    || tools?.git?.windowsExactVersion !== '2.55.0.windows.2'
    || tools?.git?.ubuntuConstraint !== '>=2.43.0 <3.0.0'
    || tools?.tar?.ubuntuConstraint !== '>=1.35 <2.0'
    || tools?.tar?.ubuntuFallback !== 'Ubuntu 24.04 signed apt package'
    || tools?.tar?.canonicalSource !== 'https://www.gnu.org/software/tar/'
    || tools?.githubCli?.constraint !== '=2.98.0'
    || tools?.githubCli?.fallbackVersion !== '2.98.0'
    || tools?.dockerEngine?.exactVersion !== '29.6.1'
    || tools?.dockerBuildx?.exactVersion !== '0.27.0'
  ) {
    throw new TypeError('Dependency manifest workflow tool constraints or archive extractor inventory are incomplete or unreviewed.');
  }
  for (const platform of ['windowsArchive', 'linuxArchive']) {
    const archive = tools.githubCli[platform];
    if (!/^https:\/\/github\.com\/cli\/cli\/releases\/download\/v2\.98\.0\//.test(archive?.url || '')) {
      throw new TypeError('GitHub CLI fallback URL is not the reviewed canonical release asset.');
    }
    for (const digest of [archive.sha256, archive.executableSha256]) {
      if (!/^[0-9a-f]{64}$/.test(digest || '') || /^0{64}$/.test(digest || '')) throw new TypeError('GitHub CLI fallback digest is invalid.');
    }
  }
  const electronRuntime = manifest.npm.electronRuntime;
  if (electronRuntime?.archive !== 'electron-v44.0.0-win32-x64.zip' || !/^[0-9a-f]{64}$/.test(electronRuntime.archiveSha256 || '') || !/^[0-9a-f]{64}$/.test(electronRuntime.executableSha256 || '')) {
    throw new TypeError('Dependency manifest must pin the Electron archive and extracted runtime bytes.');
  }
  return manifest;
}

export function validateReleaseMetadata(metadata, options = {}) {
  if (!metadata || metadata.schemaVersion !== 1) throw new TypeError('Release metadata schema is unsupported.');
  const version = semanticVersion(metadata.version);
  if (options.version && version !== semanticVersion(options.version, 'expected version')) throw new TypeError('Release metadata version does not match the expected version.');
  fullCommit(metadata.catalogCommit, 'catalog commit');
  fullCommit(metadata.catalogBlobSha, 'catalog blob SHA');
  if (metadata.catalogBytes !== DEFAULT_CATALOG_BYTES) throw new TypeError('Release catalog byte count is invalid.');
  if (metadata.catalogStatus === 'resolved') {
    if (metadata.catalogUnavailableReason !== null || typeof metadata.codeName !== 'string' || !metadata.codeName.includes(' · ')) throw new TypeError('Resolved release code name must contain both catalog names.');
    if (!/^hk-dish-\d{4}$/.test(metadata.catalogRecord || '')) throw new TypeError('Resolved release catalog record is invalid.');
    httpsUrl(metadata.publicPhotoUrl, 'Release catalog photo');
    if (metadata.publicPhotoAsset !== path.posix.basename(new URL(metadata.publicPhotoUrl).pathname)) throw new TypeError('Resolved release photo asset disagrees with its URL.');
  } else if (
    metadata.catalogStatus !== 'unavailable'
    || metadata.catalogUnavailableReason !== 'public-catalog-unavailable'
    || [metadata.codeName, metadata.catalogRecord, metadata.catalogSlug, metadata.publicPhotoUrl, metadata.publicPhotoAsset].some((value) => value !== null)
  ) {
    throw new TypeError('Unavailable catalog metadata must remain explicit and contain no invented dish.');
  }
  if (metadata.photoStoredLocally !== false) throw new TypeError('Release metadata must refuse a locally stored catalog photo.');
  const container = metadata.container;
  if (!container || container.platform !== 'linux/amd64' || !/^node:22-alpine@sha256:[0-9a-f]{64}$/.test(container.baseImage || '')) {
    throw new TypeError('Release metadata container base or platform is invalid.');
  }
  if (container.baseImageIndexDigest !== container.baseImage.slice(container.baseImage.indexOf('@') + 1) || !/^sha256:[0-9a-f]{64}$/.test(container.baseImageManifestDigest || '') || container.baseImageManifestDigest === container.baseImageIndexDigest) {
    throw new TypeError('Release metadata container index and selected manifest digests are invalid.');
  }
  if (container.runtime?.user !== 'node:node' || container.runtime?.host !== '0.0.0.0' || container.runtime?.readOnlyRequired !== true) {
    throw new TypeError('Release metadata container runtime constraints are incomplete.');
  }
  if (!/^\d+$/.test(String(container.sourceDateEpoch || '')) || new Date(Number(container.sourceDateEpoch) * 1000).toISOString() !== container.createdAt) {
    throw new TypeError('Release metadata container source epoch disagrees with its creation time.');
  }
  validateDeltaFeedState(container.deltaFeed);
  return metadata;
}

function ghJson(args) {
  return JSON.parse(execFileSync('gh', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  }));
}

function ghPaginated(endpoint) {
  const pages = ghJson(['api', '--paginate', '--slurp', endpoint]);
  return pages.flatMap((page) => Array.isArray(page) ? page : [page]);
}

function gitBlobSha1(buffer) {
  return crypto.createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}

export function decodeCatalogBlob(pathRecord, blobRecord, expected) {
  if (pathRecord?.type !== 'file' || pathRecord.sha !== expected.blobSha || pathRecord.size !== expected.bytes) {
    throw new Error('Pinned catalog path does not resolve to the expected Git blob and byte count.');
  }
  if (blobRecord?.encoding !== 'base64' || blobRecord.sha !== expected.blobSha || blobRecord.size !== expected.bytes || typeof blobRecord.content !== 'string') {
    throw new Error('Catalog blob response does not match the pinned identity.');
  }
  const bytes = Buffer.from(blobRecord.content.replace(/\s/g, ''), 'base64');
  if (bytes.length !== expected.bytes || gitBlobSha1(bytes) !== expected.blobSha || bytes.length > 10 * 1024 * 1024) {
    throw new Error('Catalog blob bytes do not match the pinned bounded Git object.');
  }
  return bytes;
}

function readCatalog(commit, blobSha, expectedBytes) {
  const pathRecord = ghJson(['api', `repos/${PHOTO_REPOSITORY}/contents/catalog/index.json?ref=${commit}`]);
  const blobRecord = ghJson(['api', `repos/${PHOTO_REPOSITORY}/git/blobs/${blobSha}`]);
  const bytes = decodeCatalogBlob(pathRecord, blobRecord, { blobSha, bytes: expectedBytes });
  const catalog = JSON.parse(bytes.toString('utf8'));
  if (catalog.schemaVersion !== '1.0.0' || !Array.isArray(catalog.dishes)) throw new Error('Catalog response uses an unsupported schema.');
  return catalog;
}

function publishedPhotoAssets() {
  const assets = new Map();
  for (const release of ghPaginated(`repos/${PHOTO_REPOSITORY}/releases?per_page=100`)) {
    if (release.draft || release.prerelease || !/^catalog-v1/.test(release.tag_name || '')) continue;
    for (const asset of ghPaginated(`repos/${PHOTO_REPOSITORY}/releases/${release.id}/assets?per_page=100`)) {
      if (/^hk-dish-\d{4}-[a-z0-9-]+\.png$/.test(asset.name || '') && typeof asset.browser_download_url === 'string') {
        assets.set(asset.name, asset.browser_download_url);
      }
    }
  }
  return assets;
}

function releaseCatalogState(repository, currentTag) {
  const used = new Set();
  let currentCatalogRecord = null;
  for (const release of ghPaginated(`repos/${repository}/releases?per_page=100`)) {
    const body = String(release.body || '');
    const records = [...body.matchAll(/Catalog record:\s*`?(hk-dish-\d{4})`?/g)].map((match) => match[1]);
    if (release.tag_name === currentTag && records.length === 1) currentCatalogRecord = records[0];
    else for (const record of records) used.add(record);
  }
  return { used, currentCatalogRecord };
}

function git(...args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
}

function atomicJsonWrite(targetPath, value) {
  atomicWriteFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function valueAfter(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (!args[index + 1]) throw new TypeError(`${name} requires a value.`);
  return args[index + 1];
}

function updateVersionFiles(version, selection, catalogCommit, catalogBlobSha, commit, createdAt, commitEpoch, options = {}) {
  const packagePath = path.join(repositoryRoot, 'package.json');
  const lockPath = path.join(repositoryRoot, 'package-lock.json');
  const metadataPath = path.join(repositoryRoot, 'app', 'release-metadata.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

  packageJson.version = version;
  packageLock.version = version;
  if (packageLock.packages?.['']) packageLock.packages[''].version = version;
  Object.assign(metadata, {
    version,
    releaseTag: `v${version}`,
    sourceCommit: commit,
    createdAt,
    catalogCommit,
    catalogBlobSha,
    catalogBytes: DEFAULT_CATALOG_BYTES,
    ...selection
  });
  metadata.container.localTag = `hair-growth-api:${version}`;
  metadata.container.ociArchive = `hair-growth-api-${version}-linux-amd64.oci.tar`;
  metadata.container.optionalRegistryTag = `ghcr.io/ding-ding-projects/hair-growth-estimator-api:${version}`;
  metadata.container.createdAt = createdAt;
  metadata.container.sourceCommit = commit;
  metadata.container.sourceDateEpoch = String(commitEpoch);

  validateReleaseMetadata(metadata, { version });
  if (options.stage !== false) {
    const stageRoot = path.join(repositoryRoot, 'dist', 'package-input');
    atomicJsonWrite(path.join(stageRoot, 'package.json'), packageJson);
    atomicJsonWrite(path.join(stageRoot, 'package-lock.json'), packageLock);
    atomicJsonWrite(path.join(stageRoot, 'app', 'release-metadata.json'), metadata);
  }
  return metadata;
}

export function prepareReleaseContext(environment = process.env, options = {}) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const existingMetadata = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'app', 'release-metadata.json'), 'utf8'));
  const commit = fullCommit(environment.GITHUB_SHA || git('rev-parse', 'HEAD'));
  const commitEpoch = git('show', '-s', '--format=%ct', commit);
  const createdAt = new Date(positiveInteger(commitEpoch, 'commit epoch') * 1000).toISOString();
  const version = environment.RELEASE_VERSION
    ? semanticVersion(environment.RELEASE_VERSION, 'RELEASE_VERSION')
    : environment.GITHUB_RUN_NUMBER
      ? deriveReleaseVersion(environment.GITHUB_RUN_NUMBER)
      : semanticVersion(packageJson.version);
  const catalogCommit = fullCommit(environment.DIM_SUM_CATALOG_COMMIT || existingMetadata.catalogCommit || DEFAULT_CATALOG_COMMIT, 'catalog commit');
  const catalogBlobSha = fullCommit(environment.DIM_SUM_CATALOG_BLOB_SHA || existingMetadata.catalogBlobSha || DEFAULT_CATALOG_BLOB_SHA, 'catalog blob SHA');
  const repository = environment.GITHUB_REPOSITORY || SOURCE_REPOSITORY;
  let selection;
  if (environment.GITHUB_ACTIONS === 'true') {
    try {
      const catalog = readCatalog(catalogCommit, catalogBlobSha, DEFAULT_CATALOG_BYTES);
      const assets = publishedPhotoAssets();
      const state = releaseCatalogState(repository, `v${version}`);
      if (state.currentCatalogRecord) {
        const currentIndex = catalog.dishes.findIndex((dish) => dish.id === state.currentCatalogRecord);
        if (currentIndex < 0) throw new Error('Existing release catalog record is absent from the pinned catalog.');
        selection = selectCatalogDish(catalog.dishes, assets, state.used, currentIndex);
        if (selection.catalogRecord !== state.currentCatalogRecord) throw new Error('Existing release catalog record is no longer a published unused selection.');
      } else {
        const ordinal = positiveInteger(environment.GITHUB_RUN_NUMBER, 'run number') - 1;
        selection = selectCatalogDish(catalog.dishes, assets, state.used, ordinal);
      }
    } catch {
      process.emitWarning('The pinned public catalog could not resolve a published unused photo. This release will use its version without a code name.', {
        code: 'CATALOG_UNAVAILABLE'
      });
      selection = unavailableCatalogSelection();
    }
  } else {
    selection = {
        catalogStatus: existingMetadata.catalogStatus,
        catalogUnavailableReason: existingMetadata.catalogUnavailableReason,
        codeName: existingMetadata.codeName,
        catalogRecord: existingMetadata.catalogRecord,
        catalogSlug: existingMetadata.catalogSlug || existingMetadata.catalogRecord,
        publicPhotoUrl: existingMetadata.publicPhotoUrl,
        publicPhotoAsset: existingMetadata.publicPhotoAsset
      };
  }
  const metadata = updateVersionFiles(version, selection, catalogCommit, catalogBlobSha, commit, createdAt, commitEpoch, { stage: options.apply !== false });
  const context = {
    schemaVersion: 1,
    version,
    tag: `v${version}`,
    runId: environment.GITHUB_RUN_ID || null,
    runAttempt: environment.GITHUB_RUN_ATTEMPT || null,
    commit,
    commitEpoch: String(commitEpoch),
    createdAt,
    catalogStatus: metadata.catalogStatus,
    catalogUnavailableReason: metadata.catalogUnavailableReason,
    codeName: metadata.codeName,
    catalogRecord: metadata.catalogRecord,
    catalogSlug: metadata.catalogSlug,
    catalogCommit,
    catalogBlobSha,
    catalogBytes: DEFAULT_CATALOG_BYTES,
    publicPhotoUrl: metadata.publicPhotoUrl,
    publicPhotoAsset: metadata.publicPhotoAsset,
    containerArchive: metadata.container.ociArchive,
    deltaFeed: structuredClone(metadata.container.deltaFeed)
  };
  const outputPath = path.join(repositoryRoot, 'dist', 'release', 'release-context.json');
  atomicJsonWrite(outputPath, context);
  return { context, outputPath };
}

export function applyResolvedReleaseContext(context) {
  if (!context || context.schemaVersion !== 1) throw new TypeError('Resolved release context schema is unsupported.');
  semanticVersion(context.version);
  if (context.tag !== `v${context.version}`) throw new TypeError('Resolved release context tag disagrees with its version.');
  fullCommit(context.commit);
  fullCommit(context.catalogCommit, 'catalog commit');
  fullCommit(context.catalogBlobSha, 'catalog blob SHA');
  if (context.catalogBytes !== DEFAULT_CATALOG_BYTES || !/^\d+$/.test(String(context.commitEpoch || ''))) throw new TypeError('Resolved release context catalog or epoch is invalid.');
  validateDeltaFeedState(context.deltaFeed);
  if (git('rev-parse', 'HEAD') !== context.commit || git('show', '-s', '--format=%ct', context.commit) !== String(context.commitEpoch)) {
    throw new TypeError('Resolved release context does not match the checked-out candidate commit.');
  }
  if (new Date(Number(context.commitEpoch) * 1000).toISOString() !== context.createdAt) throw new TypeError('Resolved release context creation time disagrees with the commit epoch.');
  const selection = {
    catalogStatus: context.catalogStatus,
    catalogUnavailableReason: context.catalogUnavailableReason,
    codeName: context.codeName,
    catalogRecord: context.catalogRecord,
    catalogSlug: context.catalogSlug,
    publicPhotoUrl: context.publicPhotoUrl,
    publicPhotoAsset: context.publicPhotoAsset
  };
  updateVersionFiles(context.version, selection, context.catalogCommit, context.catalogBlobSha, context.commit, context.createdAt, context.commitEpoch);
  const outputPath = path.join(repositoryRoot, 'dist', 'release', 'release-context.json');
  atomicJsonWrite(outputPath, context);
  return { context, outputPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--validate-only')) {
    validateDependencyManifest(JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'dependencies.manifest.json'), 'utf8')));
    const metadata = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'app', 'release-metadata.json'), 'utf8'));
    validateReleaseMetadata(metadata, { version: JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')).version });
    process.stdout.write('Dependency and release metadata contracts are valid.\n');
  } else {
    const suppliedPath = process.env.HGE_RELEASE_CONTEXT_PATH || valueAfter(process.argv, '--apply');
    const result = suppliedPath
      ? applyResolvedReleaseContext(JSON.parse(fs.readFileSync(path.resolve(repositoryRoot, suppliedPath), 'utf8')))
      : prepareReleaseContext(process.env, { apply: !process.argv.includes('--resolve-only') });
    const { context, outputPath } = result;
    process.stdout.write(`Prepared release ${context.tag} for ${context.commit}.\n`);
    process.stdout.write(context.catalogStatus === 'resolved'
      ? `Catalog record: ${context.catalogRecord}.\n`
      : 'Catalog record: unavailable, release uses its version only.\n');
    process.stdout.write(`Context: ${path.relative(repositoryRoot, outputPath)}.\n`);
  }
}
