import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, '..');
const output = resolve(process.env.SITE_OUTPUT_DIR || join(root, '_site'));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const expectedStages = [0.3, 1.5, 3, 5, 9, 14, 20, 28];
const MAX_INSTALLER_MANIFEST_BYTES = 64 * 1024;
const MAX_RELEASE_CONTEXT_BYTES = 64 * 1024;
const MAX_TERMINAL_RECEIPT_BYTES = 64 * 1024;
const MAX_TRUSTED_PRODUCT_VALIDATION_BYTES = 16 * 1024 * 1024;
const MAX_HAIR_MANIFEST_BYTES = 64 * 1024;
const TERMINAL_TRANSFER_FILES = ['installer-manifest.json', 'release-context.json', 'terminal-transfer-receipt.json', 'trusted-product-validation.json'];
const TERMINAL_HASHED_FILES = ['installer-manifest.json', 'release-context.json', 'trusted-product-validation.json'];

function git(...args) {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

function validIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function buildTimestamp() {
  if (process.env.SOURCE_DATE_EPOCH && /^\d+$/.test(process.env.SOURCE_DATE_EPOCH)) return new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString();
  const commitTime = git('show', '-s', '--format=%cI', 'HEAD');
  return validIso(commitTime) ? new Date(commitTime).toISOString() : null;
}

function exactFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const keys = Object.keys(value);
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  const extra = keys.filter((field) => !fields.includes(field));
  if (missing.length || extra.length) throw new Error(`${label} manifest mismatch. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${extra.join(', ') || 'none'}.`);
}

function exactObjectFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const keys = Object.keys(value);
  const missing = fields.filter((field) => !Object.hasOwn(value, field));
  const extra = keys.filter((field) => !fields.includes(field));
  if (missing.length || extra.length) throw new Error(`${label} field mismatch. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${extra.join(', ') || 'none'}.`);
}

function canonicalIso(value) {
  if (!validIso(value)) return null;
  const normalized = new Date(value).toISOString();
  return normalized === value ? value : null;
}

function semanticReleaseVersion(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function sha256File(path) {
  const digest = createHash('sha256');
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('end', resolvePromise);
    stream.on('error', rejectPromise);
  });
  return digest.digest('hex');
}

async function boundedJson(path, label, limit) {
  const bytes = await readFile(path);
  if (bytes.length > limit) throw new Error(`${label} exceeds the ${limit} byte limit.`);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error(`${label} must be valid UTF-8 text.`); }
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error(`${label} must be valid JSON.`); }
  return { bytes, value };
}

function validateInstallerManifest(value, { commit }) {
  const fields = ['schemaVersion', 'owner', 'repository', 'tag', 'target', 'version', 'platform', 'filename', 'bytes', 'sha256', 'unsigned', 'publication'];
  exactFields(value, fields, 'Installer');
  if (value.schemaVersion !== 1) throw new Error('Installer manifest schemaVersion must be 1.');
  if (value.owner !== 'Ding-Ding-Projects' || value.repository !== 'HairGrowthEstimator') throw new Error('Installer manifest owner and repository do not match this project.');
  if (value.target !== commit || !/^[a-f0-9]{40}$/.test(value.target)) throw new Error('Installer manifest target must match the exact composed commit.');
  if (!semanticReleaseVersion(value.version) || value.tag !== `v${value.version}` || value.tag.length > 128) throw new Error('Installer manifest tag and release version must form one exact immutable release identity.');
  if (value.platform !== 'windows-x64') throw new Error('Installer manifest platform must be windows-x64.');
  if (typeof value.filename !== 'string' || value.filename.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.exe$/.test(value.filename) || !value.filename.includes(value.version)) throw new Error('Installer manifest filename must be a safe versioned .exe basename.');
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > 2 * 1024 * 1024 * 1024) throw new Error('Installer manifest bytes must be a positive safe value no larger than 2 GiB.');
  if (!/^[a-f0-9]{64}$/.test(value.sha256) || /^0{64}$/.test(value.sha256)) throw new Error('Installer manifest SHA-256 must be nonzero lowercase 64-hex.');
  if (value.unsigned !== true) throw new Error('Installer manifest must state that the artifact is unsigned.');
  exactFields(value.publication, ['state', 'draft', 'prerelease', 'publishedAt', 'releaseId', 'assetId', 'url'], 'Installer publication');
  if (value.publication.state !== 'published' || value.publication.draft !== false || value.publication.prerelease !== false) throw new Error('Installer publication must describe a published, non-draft, non-prerelease release.');
  if (!canonicalIso(value.publication.publishedAt)) throw new Error('Installer publication time must be a canonical ISO date and time.');
  if (!Number.isSafeInteger(value.publication.releaseId) || value.publication.releaseId < 1 || !Number.isSafeInteger(value.publication.assetId) || value.publication.assetId < 1) throw new Error('Installer publication release and asset identifiers must be positive safe integers.');
  const expectedUrl = `https://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/download/${value.tag}/${value.filename}`;
  if (value.publication.url !== expectedUrl) throw new Error('Installer publication URL must be the exact immutable GitHub release asset URL.');
  return structuredClone(value);
}

function validateReleaseContext(value, commit) {
  const fields = ['schemaVersion', 'version', 'tag', 'runId', 'runAttempt', 'commit', 'commitEpoch', 'createdAt', 'catalogStatus', 'catalogUnavailableReason', 'codeName', 'catalogRecord', 'catalogSlug', 'catalogCommit', 'catalogBlobSha', 'catalogBytes', 'publicPhotoUrl', 'publicPhotoAsset', 'containerArchive'];
  exactObjectFields(value, fields, 'Release context');
  if (value.schemaVersion !== 1 || !semanticReleaseVersion(value.version) || value.tag !== `v${value.version}`) throw new Error('Release context version and tag are invalid.');
  if (value.commit !== commit || !/^[a-f0-9]{40}$/.test(value.commit)) throw new Error('Release context must match the exact composed commit.');
  if (!/^[1-9]\d*$/.test(value.runId) || !/^[1-9]\d*$/.test(value.runAttempt)) throw new Error('Release context logical run identity is invalid.');
  if (!/^\d+$/.test(value.commitEpoch) || !canonicalIso(value.createdAt)) throw new Error('Release context commit time is invalid.');
  const epoch = Number(value.commitEpoch);
  if (!Number.isSafeInteger(epoch) || new Date(epoch * 1000).toISOString() !== value.createdAt) throw new Error('Release context creation time does not match its commit epoch.');
  if (!/^[a-f0-9]{40}$/.test(value.catalogCommit) || !/^[a-f0-9]{40}$/.test(value.catalogBlobSha) || !Number.isSafeInteger(value.catalogBytes) || value.catalogBytes < 1) throw new Error('Release context catalog provenance is invalid.');
  if (value.catalogStatus === 'resolved') {
    if (value.catalogUnavailableReason !== null || typeof value.codeName !== 'string' || !value.codeName.includes(' · ') || !/^hk-dish-\d{4}$/.test(value.catalogRecord || '') || typeof value.catalogSlug !== 'string') throw new Error('Resolved release context catalog presentation is invalid.');
    let photo;
    try { photo = new URL(value.publicPhotoUrl); }
    catch { throw new Error('Resolved release context public photo URL is invalid.'); }
    if (photo.protocol !== 'https:' || photo.username || photo.password || value.publicPhotoAsset !== photo.pathname.split('/').at(-1)) throw new Error('Resolved release context public photo identity is invalid.');
  } else if (value.catalogStatus !== 'unavailable' || value.catalogUnavailableReason !== 'public-catalog-unavailable' || [value.codeName, value.catalogRecord, value.catalogSlug, value.publicPhotoUrl, value.publicPhotoAsset].some((entry) => entry !== null)) {
    throw new Error('Unavailable release context must contain no invented catalog presentation.');
  }
  if (typeof value.containerArchive !== 'string' || value.containerArchive.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.tar$/.test(value.containerArchive)) throw new Error('Release context container archive is invalid.');
  return structuredClone(value);
}

function validateSourceBinding(value, label) {
  exactObjectFields(value, ['fileCount', 'bytes', 'inventorySha256', 'files'], label);
  if (!Number.isSafeInteger(value.fileCount) || value.fileCount < 1 || !Array.isArray(value.files) || value.files.length !== value.fileCount) throw new Error(`${label} file count is invalid.`);
  const paths = [];
  let bytes = 0;
  for (const record of value.files) {
    exactObjectFields(record, ['path', 'source', 'bytes', 'sha256'], `${label} file record`);
    const segments = typeof record.path === 'string' ? record.path.split('/') : [];
    if (typeof record.path !== 'string' || record.path.length < 1 || record.path.length > 512 || record.path.includes('\\') || record.path.startsWith('/') || /^[A-Za-z]:/.test(record.path) || segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error(`${label} contains an unsafe or noncanonical path.`);
    if (typeof record.source !== 'string' || record.source.length < 1 || record.source.length > 1000 || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || !/^[a-f0-9]{64}$/.test(record.sha256)) throw new Error(`${label} contains an invalid source record.`);
    paths.push(record.path);
    bytes += record.bytes;
  }
  if (new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify([...paths].sort())) throw new Error(`${label} paths must be unique and default-code-unit sorted.`);
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes !== bytes) throw new Error(`${label} aggregate byte count is invalid.`);
  const canonical = Buffer.from(value.files.map((record) => `${record.path}\0${record.bytes}\0${record.sha256}\n`).join(''), 'utf8');
  if (!/^[a-f0-9]{64}$/.test(value.inventorySha256) || value.inventorySha256 !== sha256(canonical)) throw new Error(`${label} inventory SHA-256 is invalid.`);
  return true;
}

function validateTrustedProductValidation(value, { context }) {
  const fields = ['schemaVersion', 'sourceCommit', 'version', 'installerManifestSha256', 'containerManifestSha256', 'installerSourceBinding', 'containerSourceBinding'];
  exactObjectFields(value, fields, 'Trusted product validation');
  if (value.schemaVersion !== 1 || value.sourceCommit !== context.commit || value.version !== context.version) throw new Error('Trusted product validation release identity does not match the release context.');
  for (const digest of [value.installerManifestSha256, value.containerManifestSha256]) if (!/^[a-f0-9]{64}$/.test(digest) || /^0{64}$/.test(digest)) throw new Error('Trusted product validation contains an invalid manifest SHA-256.');
  exactObjectFields(value.installerSourceBinding, ['appAsar', 'server'], 'Installer source binding');
  validateSourceBinding(value.installerSourceBinding.appAsar, 'Installer app.asar source binding');
  validateSourceBinding(value.installerSourceBinding.server, 'Installer server source binding');
  validateSourceBinding(value.containerSourceBinding, 'Container source binding');
  return structuredClone(value);
}

function validateTerminalReceipt(value, { context, installer, fileBytes }) {
  const fields = ['schemaVersion', 'repository', 'runId', 'contextRunAttempt', 'terminalRunAttempt', 'tag', 'target', 'version', 'files'];
  exactObjectFields(value, fields, 'Terminal transfer receipt');
  if (value.schemaVersion !== 1 || value.repository !== 'Ding-Ding-Projects/HairGrowthEstimator') throw new Error('Terminal transfer receipt repository identity is invalid.');
  if (!/^[1-9]\d*$/.test(value.runId) || !Number.isSafeInteger(value.contextRunAttempt) || value.contextRunAttempt < 1 || !Number.isSafeInteger(value.terminalRunAttempt) || value.terminalRunAttempt < 1) throw new Error('Terminal transfer receipt run identity is invalid.');
  if (value.terminalRunAttempt < value.contextRunAttempt) throw new Error('Terminal transfer receipt terminal attempt cannot predate its context attempt.');
  if (value.runId !== context.runId || String(value.contextRunAttempt) !== context.runAttempt || value.tag !== context.tag || value.target !== context.commit || value.version !== context.version) throw new Error('Terminal transfer receipt identity does not match the release context.');
  if (value.tag !== installer.tag || value.target !== installer.target || value.version !== installer.version) throw new Error('Terminal transfer receipt identity does not match the installer manifest.');
  if (!Array.isArray(value.files) || value.files.length !== TERMINAL_HASHED_FILES.length) throw new Error('Terminal transfer receipt must contain exactly three copied file records.');
  const names = [];
  for (const record of value.files) {
    exactObjectFields(record, ['file', 'bytes', 'sha256'], 'Terminal transfer receipt file record');
    if (typeof record.file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(record.file) || !Number.isSafeInteger(record.bytes) || record.bytes < 1 || !/^[a-f0-9]{64}$/.test(record.sha256)) throw new Error('Terminal transfer receipt contains an invalid file record.');
    names.push(record.file);
    const actual = fileBytes.get(record.file);
    if (!actual || record.bytes !== actual.length || record.sha256 !== sha256(actual)) throw new Error(`Terminal transfer receipt SHA-256 or byte count does not match ${record.file}.`);
  }
  if (JSON.stringify(names) !== JSON.stringify([...names].sort()) || JSON.stringify(names) !== JSON.stringify(TERMINAL_HASHED_FILES)) throw new Error('Terminal transfer receipt files must be exact and default-code-unit sorted.');
  return structuredClone(value);
}

const githubReleaseAdapter = {
  async release(owner, repository, tag) {
    const output = execFileSync('gh', ['api', `repos/${owner}/${repository}/releases/tags/${tag}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(output);
  },
  async download(owner, repository, tag, filename, destination) {
    execFileSync('gh', ['release', 'download', tag, '--repo', `${owner}/${repository}`, '--pattern', filename, '--dir', destination], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  },
  async runAttempt(owner, repository, runId, attempt) {
    const output = execFileSync('gh', ['api', `repos/${owner}/${repository}/actions/runs/${runId}/attempts/${attempt}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(output);
  }
};

export async function verifyPublishedInstaller(manifest, adapter = githubReleaseAdapter) {
  let release;
  try { release = await adapter.release(manifest.owner, manifest.repository, manifest.tag); }
  catch (error) { throw new Error(`GitHub release readback failed: ${error.message}`); }
  if (!release || release.id !== manifest.publication.releaseId || release.tag_name !== manifest.tag || release.target_commitish !== manifest.target || release.draft !== false || release.prerelease !== false || release.published_at !== manifest.publication.publishedAt) throw new Error('GitHub release readback does not match the immutable installer publication identity.');
  if (release.html_url !== `https://github.com/${manifest.owner}/${manifest.repository}/releases/tag/${manifest.tag}`) throw new Error('GitHub release readback returned an unexpected tagged release URL.');
  const assets = Array.isArray(release.assets) ? release.assets.filter((asset) => asset.name === manifest.filename) : [];
  if (assets.length !== 1) throw new Error('GitHub release readback did not return exactly one matching Setup asset.');
  const asset = assets[0];
  if (asset.id !== manifest.publication.assetId || asset.size !== manifest.bytes || asset.state !== 'uploaded' || asset.browser_download_url !== manifest.publication.url) throw new Error('GitHub Setup asset metadata does not match the immutable installer manifest.');
  const temporary = await mkdtemp(join(tmpdir(), 'hair-growth-release-readback-'));
  try {
    try { await adapter.download(manifest.owner, manifest.repository, manifest.tag, manifest.filename, temporary); }
    catch (error) { throw new Error(`GitHub Setup asset download failed: ${error.message}`); }
    const entries = await readdir(temporary, { withFileTypes: true });
    if (entries.length !== 1 || !entries[0].isFile() || entries[0].name !== manifest.filename) throw new Error('GitHub Setup asset download produced an unexpected file set.');
    const setupPath = join(temporary, manifest.filename);
    const setupStat = await stat(setupPath);
    if (setupStat.size !== manifest.bytes || await sha256File(setupPath) !== manifest.sha256) throw new Error('GitHub Setup asset bytes do not match the immutable installer manifest.');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return true;
}

export async function verifyPublishedTerminalTransfer({ installer, receipt }, adapter = githubReleaseAdapter) {
  await verifyPublishedInstaller(installer, adapter);
  let attempt;
  try { attempt = await adapter.runAttempt(installer.owner, installer.repository, receipt.runId, receipt.terminalRunAttempt); }
  catch (error) { throw new Error(`GitHub Actions terminal attempt readback failed: ${error.message}`); }
  if (!attempt || String(attempt.id) !== receipt.runId || attempt.run_attempt !== receipt.terminalRunAttempt || attempt.head_sha !== installer.target || attempt.repository?.full_name !== `${installer.owner}/${installer.repository}` || attempt.status !== 'completed' || attempt.conclusion !== 'success') throw new Error('GitHub Actions terminal attempt readback does not match the terminal transfer receipt.');
  return true;
}

export async function validateTerminalTransfer(directory, commit, options = {}) {
  const terminalDirectory = resolve(directory);
  let entries;
  try { entries = await readdir(terminalDirectory, { withFileTypes: true }); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const actualNames = entries.map((entry) => entry.name).sort();
  const missing = TERMINAL_TRANSFER_FILES.filter((name) => !actualNames.includes(name));
  const unexpected = actualNames.filter((name) => !TERMINAL_TRANSFER_FILES.includes(name));
  if (entries.some((entry) => !entry.isFile()) || missing.length || unexpected.length || actualNames.length !== TERMINAL_TRANSFER_FILES.length) throw new Error(`Terminal transfer file mismatch. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}.`);
  const installerInput = await boundedJson(join(terminalDirectory, 'installer-manifest.json'), 'Installer manifest', MAX_INSTALLER_MANIFEST_BYTES);
  const contextInput = await boundedJson(join(terminalDirectory, 'release-context.json'), 'Release context', MAX_RELEASE_CONTEXT_BYTES);
  const validationInput = await boundedJson(join(terminalDirectory, 'trusted-product-validation.json'), 'Trusted product validation', MAX_TRUSTED_PRODUCT_VALIDATION_BYTES);
  const receiptInput = await boundedJson(join(terminalDirectory, 'terminal-transfer-receipt.json'), 'Terminal transfer receipt', MAX_TERMINAL_RECEIPT_BYTES);
  const installer = validateInstallerManifest(installerInput.value, { commit });
  const context = validateReleaseContext(contextInput.value, commit);
  if (context.version !== installer.version || context.tag !== installer.tag || context.commit !== installer.target) throw new Error('Release context identity does not match the installer manifest.');
  if (Date.parse(installer.publication.publishedAt) < Date.parse(context.createdAt)) throw new Error('Installer publication predates the candidate release context.');
  validateTrustedProductValidation(validationInput.value, { context });
  const fileBytes = new Map([
    ['installer-manifest.json', installerInput.bytes],
    ['release-context.json', contextInput.bytes],
    ['trusted-product-validation.json', validationInput.bytes]
  ]);
  const receipt = validateTerminalReceipt(receiptInput.value, { context, installer, fileBytes });
  const verifyExternal = options.verifyExternal || verifyPublishedTerminalTransfer;
  await verifyExternal({ installer, context, receipt });
  return installer;
}

async function optionalInstaller(commit) {
  return validateTerminalTransfer(join(root, 'dist', 'terminal-transfer'), commit);
}

export function createArtifactProvenance({ commit, installer, socialPreview }) {
  const releaseBound = Boolean(installer);
  return {
    schemaVersion: 1,
    name: packageJson.name,
    version: releaseBound ? installer.version : packageJson.version,
    updatedAt: releaseBound ? installer.publication.publishedAt : buildTimestamp(),
    commit: /^[a-f0-9]{40}$/.test(commit) ? commit : null,
    source: releaseBound ? 'immutable terminal release transfer plus GitHub release readback' : 'package.json plus Git commit provenance',
    releaseCodeName: { en: 'Classic Har Gow', zhHant: '蝦餃', catalogId: 'hk-dish-0001', catalogCommit: '736e8c1d9e40e1d146f3c3b11bb329b97c4ef515', publicAsset: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png' },
    installer: installer || null,
    socialPreview
  };
}

async function markdownFiles(directory) {
  const results = [];
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && path !== join(root, 'docs', 'locales')) results.push(...await markdownFiles(path));
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) results.push(path);
    }
  } catch {}
  return results.sort();
}

function markdownTitle(content, path) {
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return title || path.split(/[\\/]/).at(-1).replace(/\.md$/i, '').replace(/[-_]+/g, ' ');
}

async function readUtf8(path, label) {
  const bytes = await readFile(path);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error(`${label} must be valid UTF-8 text.`); }
}

async function localizationContract() {
  const source = await readUtf8(join(root, 'site', 'localization-contract.js'), 'Localization contract');
  const context = vm.createContext({ console, structuredClone });
  vm.runInContext(source, context, { filename: 'localization-contract.js' });
  if (!context.HairGrowthLocalizationContract) throw new Error('Localization contract did not expose its browser global.');
  return context.HairGrowthLocalizationContract;
}

async function bundledLocaleCatalog(contract) {
  const directory = join(root, 'site', 'locales', 'yue');
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (!entries.length) throw new Error('At least one versioned UI locale catalog is required.');
  const catalogs = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const text = await readUtf8(path, `Locale catalog ${entry.name}`);
    let value;
    try { value = JSON.parse(text); }
    catch (error) { throw new Error(`Locale catalog ${entry.name} is not valid JSON: ${error.message}`); }
    catalogs.push(value);
  }
  return contract.mergeLocaleCatalogs(catalogs);
}

async function bundledDocumentation() {
  const contract = await localizationContract();
  const docsRoot = join(root, 'docs');
  const files = await markdownFiles(docsRoot);
  return Promise.all(files.map(async (path) => {
    const rel = relative(docsRoot, path).split(sep).join('/');
    const localizedPath = join(docsRoot, 'locales', 'yue', ...rel.split('/'));
    let content;
    let cantoneseContent;
    try {
      [content, cantoneseContent] = await Promise.all([
        readUtf8(path, `English documentation article ${rel}`),
        readUtf8(localizedPath, `Cantonese documentation article ${rel}`)
      ]);
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`Cantonese documentation article is missing for docs/${rel}.`);
      throw error;
    }
    contract.interleaveMarkdownBlocks(content, cantoneseContent);
    const title = markdownTitle(content, path);
    const cantoneseTitle = markdownTitle(cantoneseContent, localizedPath);
    return {
      id: rel.replace(/\.md$/i, '').replace(/[^a-z0-9/.-]+/gi, '-').toLowerCase(),
      title,
      category: rel.includes('/') ? rel.split('/')[0] : 'General',
      path: `docs/${rel}`,
      content,
      locales: { en: { title, content }, yue: { title: cantoneseTitle, content: cantoneseContent } }
    };
  }));
}

function parseChangelog(content) {
  const headings = [...content.matchAll(/^##\s+(?:\[?([^\]\s]+)\]?)(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?\s*$/gm)];
  return headings.map((heading, index) => {
    const body = content.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? content.length).trim();
    const title = body.match(/^###\s+(.+)$/m)?.[1] || (heading[1].toLowerCase() === 'unreleased' ? 'Unreleased changes' : 'Recorded changes');
    const commit = body.match(/\b([a-f0-9]{40})\b/)?.[1] || null;
    return { version: heading[1], date: heading[2] || null, title, body: body.replace(/^###\s+.+$/m, '').trim().slice(0, 6000), commit };
  });
}

async function bundledChangelog() {
  let content = '';
  let cantoneseContent = '';
  try {
    [content, cantoneseContent] = await Promise.all([
      readUtf8(join(root, 'CHANGELOG.md'), 'English changelog'),
      readUtf8(join(root, 'docs', 'locales', 'yue', 'CHANGELOG.md'), 'Cantonese changelog')
    ]);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('The Cantonese changelog mirror is required for website composition.');
    throw error;
  }
  const english = parseChangelog(content);
  const cantonese = parseChangelog(cantoneseContent);
  if (english.length !== cantonese.length) throw new Error('English and Cantonese changelog entry counts do not match.');
  return english.map((entry, index) => {
    const translated = cantonese[index];
    if (entry.version !== translated.version || entry.date !== translated.date) throw new Error(`Changelog locale metadata does not match at ${entry.version}.`);
    return { ...entry, locales: { en: { title: entry.title, body: entry.body }, yue: { title: translated.title, body: translated.body } } };
  });
}

function inspectPng(bytes, file) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(bytes) || bytes.length < 57 || !bytes.subarray(0, 8).equals(signature)) throw new Error(`Hair asset ${file} has an invalid PNG signature.`);
  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let interlace = null;
  let sawHeader = false;
  let sawEnd = false;
  const imageData = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error(`Hair asset ${file} has a truncated PNG chunk.`);
    const length = bytes.readUInt32BE(offset);
    if (length > 16 * 1024 * 1024 || offset + 12 + length > bytes.length) throw new Error(`Hair asset ${file} has an invalid PNG chunk length.`);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(`Hair asset ${file} has an invalid PNG chunk type.`);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    if (actualCrc !== expectedCrc) throw new Error(`Hair asset ${file} has an invalid PNG chunk checksum.`);
    if (!sawHeader && type !== 'IHDR') throw new Error(`Hair asset ${file} does not begin with IHDR.`);
    if (type === 'IHDR') {
      if (sawHeader || length !== 13) throw new Error(`Hair asset ${file} has an invalid or duplicate IHDR chunk.`);
      sawHeader = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0) throw new Error(`Hair asset ${file} uses an unsupported PNG compression or filter method.`);
      interlace = data[12];
      if (interlace !== 0) throw new Error(`Hair asset ${file} must use the validated non-interlaced PNG layout.`);
    } else if (type === 'IDAT') imageData.push(data);
    else if (type === 'IEND') {
      if (sawEnd || length !== 0) throw new Error(`Hair asset ${file} has an invalid or duplicate IEND chunk.`);
      sawEnd = true;
      offset += 12;
      if (offset !== bytes.length) throw new Error(`Hair asset ${file} has bytes after IEND.`);
      break;
    }
    offset += 12 + length;
  }
  if (!sawHeader || !sawEnd || !imageData.length) throw new Error(`Hair asset ${file} is missing required PNG chunks.`);
  if (width !== 1254 || height !== 1254) throw new Error(`Hair asset ${file} must be exactly 1254 by 1254 pixels.`);
  const channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 })[colorType];
  if (!channels || bitDepth !== 8) throw new Error(`Hair asset ${file} must use an 8-bit grayscale, RGB, grayscale-alpha, or RGBA PNG layout.`);
  const expectedInflatedLength = (1 + width * channels) * height;
  let inflated;
  try { inflated = inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedInflatedLength }); }
  catch (error) { throw new Error(`Hair asset ${file} has invalid bounded PNG image data: ${error.message}`); }
  if (inflated.length !== expectedInflatedLength) throw new Error(`Hair asset ${file} PNG scanline dimensions do not match IHDR.`);
  for (let row = 0; row < height; row += 1) if (inflated[row * (1 + width * channels)] > 4) throw new Error(`Hair asset ${file} has an invalid PNG row filter.`);
  return { width, height, bitDepth, colorType };
}

function normalizeHairManifest(value) {
  exactFields(value, ['schemaVersion', 'unit', 'stages'], 'Hair asset');
  if (value.schemaVersion !== 1 || value.unit !== 'cm' || !Array.isArray(value.stages)) throw new Error('Hair asset manifest must use schemaVersion 1, unit cm, and a stages array.');
  if (value.stages.length !== expectedStages.length) throw new Error(`Hair asset manifest must contain exactly ${expectedStages.length} stages.`);
  return value.stages.map((entry, index) => {
    exactFields(entry, ['length', 'file', 'sha256'], `Hair asset stage ${index + 1}`);
    if (typeof entry.length !== 'number' || !Number.isFinite(entry.length)) throw new Error(`Hair asset manifest stage ${index + 1} must use a finite numeric length.`);
    if (typeof entry.file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/.test(entry.file)) throw new Error(`Hair asset stage ${index + 1} must use a safe PNG basename.`);
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Hair asset stage ${index + 1} must use a lowercase SHA-256 digest.`);
    return { file: entry.file, cm: entry.length, sha256: entry.sha256, alt: `Male hair reference at approximately ${entry.length} centimetres` };
  });
}

async function bundledHairStages() {
  const sourceDirectory = join(root, 'assets', 'hair-growth');
  let sourceEntries;
  try {
    sourceEntries = await readdir(sourceDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT' && process.env.REQUIRE_HAIR_ASSETS !== '1') return [];
    throw error;
  }
  try {
    const manifestBytes = await readFile(join(sourceDirectory, 'stages.json'));
    if (manifestBytes.length > MAX_HAIR_MANIFEST_BYTES) throw new Error(`Hair asset manifest exceeds the ${MAX_HAIR_MANIFEST_BYTES} byte limit.`);
    let manifestText;
    try { manifestText = new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes); }
    catch { throw new Error('Hair asset manifest must be valid UTF-8 text.'); }
    const manifestValue = JSON.parse(manifestText);
    const manifest = normalizeHairManifest(manifestValue);
    const stageSet = new Set();
    const fileSet = new Set();
    const digestSet = new Set();
    for (const entry of manifest) {
      if (stageSet.has(entry.cm)) throw new Error(`Hair asset manifest contains duplicate stage ${entry.cm}.`);
      if (fileSet.has(entry.file)) throw new Error(`Hair asset manifest contains duplicate file ${entry.file}.`);
      if (digestSet.has(entry.sha256)) throw new Error(`Hair asset manifest contains duplicate SHA-256 ${entry.sha256}.`);
      stageSet.add(entry.cm); fileSet.add(entry.file); digestSet.add(entry.sha256);
    }
    if (manifest.some((entry, index) => entry.cm !== expectedStages[index])) throw new Error(`Hair asset manifest stages must remain in canonical order: ${expectedStages.join(', ')} cm.`);
    for (const entry of manifest) {
      const path = join(sourceDirectory, entry.file);
      const info = await stat(path);
      if (!info.isFile() || info.size < 1024 || info.size > 12 * 1024 * 1024) throw new Error(`Hair asset ${entry.file} has an invalid size.`);
      const bytes = await readFile(path);
      inspectPng(bytes, entry.file);
      const actualDigest = createHash('sha256').update(bytes).digest('hex');
      if (actualDigest !== entry.sha256) throw new Error(`Hair asset ${entry.file} does not match its manifest SHA-256 digest.`);
    }
    const actualNames = sourceEntries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
    const expectedNames = ['stages.json', ...manifest.map((entry) => entry.file)].sort();
    if (sourceEntries.some((entry) => !entry.isFile()) || actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index])) throw new Error('Unexpected hair asset or manifest mismatch in the canonical source directory.');
    const targetDirectory = join(output, 'assets', 'hair-growth');
    await mkdir(targetDirectory, { recursive: true });
    await cp(join(sourceDirectory, 'stages.json'), join(targetDirectory, 'stages.json'));
    for (const entry of manifest) await cp(join(sourceDirectory, entry.file), join(targetDirectory, entry.file));
    return manifest.map((entry) => ({ src: `assets/hair-growth/${entry.file}`, cm: entry.cm, inches: Number((entry.cm / 2.54).toFixed(4)), alt: entry.alt }));
  } catch (error) {
    throw new Error(`Canonical hair assets were rejected: ${error.message}`);
  }
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

const glyphs = {
  A: ['01110','10001','10001','11111','10001','10001','10001'], B: ['11110','10001','10001','11110','10001','10001','11110'], C: ['01111','10000','10000','10000','10000','10000','01111'], D: ['11110','10001','10001','10001','10001','10001','11110'], E: ['11111','10000','10000','11110','10000','10000','11111'], G: ['01111','10000','10000','10111','10001','10001','01111'], H: ['10001','10001','10001','11111','10001','10001','10001'], I: ['11111','00100','00100','00100','00100','00100','11111'], J: ['00111','00010','00010','00010','10010','10010','01100'], L: ['10000','10000','10000','10000','10000','10000','11111'], M: ['10001','11011','10101','10101','10001','10001','10001'], O: ['01110','10001','10001','10001','10001','10001','01110'], P: ['11110','10001','10001','11110','10000','10000','10000'], R: ['11110','10001','10001','11110','10100','10010','10001'], S: ['01111','10000','10000','01110','00001','00001','11110'], T: ['11111','00100','00100','00100','00100','00100','00100'], U: ['10001','10001','10001','10001','10001','10001','01110'], W: ['10001','10001','10001','10101','10101','10101','01010'], '.': ['00000','00000','00000','00000','00000','00110','00110'], ' ': ['00000','00000','00000','00000','00000','00000','00000']
};

function generateSocialPreview() {
  const width = 1280, height = 640;
  const rows = [];
  const pixel = (x, y) => {
    const blend = x / width * 0.58 + y / height * 0.18;
    let r = Math.round(16 + 4 * blend), g = Math.round(20 + 72 * blend), b = Math.round(21 + 51 * blend);
    const cx = 190, cy = 220;
    const distance = Math.hypot(x - cx, y - cy);
    if (distance < 115) [r, g, b] = [20, 92, 72];
    const strand = Math.abs((x - 105) - 0.0025 * (y - 120) ** 2);
    if (x < 300 && y > 105 && y < 355 && strand < 18) [r, g, b] = [167, 243, 208];
    if (x > 205 && x < 300 && [162, 198, 234, 270].some((lineY, index) => Math.abs(y - lineY) < 5 && x < 270 + index % 2 * 20)) [r, g, b] = [224, 227, 227];
    return [r, g, b, 255];
  };
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) buffer.set(pixel(x, y), (y * width + x) * 4);
  const drawText = (text, startX, startY, scale, color) => {
    let cursor = startX;
    for (const character of text) {
      const glyph = glyphs[character] || glyphs[' '];
      glyph.forEach((row, gy) => [...row].forEach((on, gx) => {
        if (on !== '1') return;
        for (let sy = 0; sy < scale; sy += 1) for (let sx = 0; sx < scale; sx += 1) {
          const x = cursor + gx * scale + sx, y = startY + gy * scale + sy;
          if (x >= 0 && x < width && y >= 0 && y < height) buffer.set([...color, 255], (y * width + x) * 4);
        }
      }));
      cursor += 6 * scale;
    }
  };
  drawText('HAIR GROWTH ESTIMATOR', 345, 190, 7, [167, 243, 208]);
  drawText('MEASURE. PROJECT. RESET.', 360, 310, 6, [224, 227, 227]);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    buffer.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

async function ensureSocialPreview() {
  const rootPath = join(root, 'social-preview.png');
  await writeFile(rootPath, generateSocialPreview());
  const bytes = await readFile(rootPath);
  await writeFile(join(output, 'social-preview.png'), bytes);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}

export async function composeSite() {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const siteFiles = await readdir(join(root, 'site'), { withFileTypes: true });
  for (const entry of siteFiles) {
    if (entry.name === 'index.template.html') continue;
    const source = join(root, 'site', entry.name);
    const destination = join(output, entry.name);
    if (entry.isDirectory()) await cp(source, destination, { recursive: true });
    else await cp(source, destination);
  }

  const localeContract = await localizationContract();
  const localeCatalog = await bundledLocaleCatalog(localeContract);
  const docs = await bundledDocumentation();
  const changelog = await bundledChangelog();
  const hairAssets = await bundledHairStages();
  const socialPreview = await ensureSocialPreview();
  const commit = git('rev-parse', 'HEAD');
  const installer = await optionalInstaller(commit);
  const provenance = createArtifactProvenance({ commit, installer, socialPreview });

  const template = await readFile(join(root, 'site', 'index.template.html'), 'utf8');
  const html = template
    .replace('__BUILD_PROVENANCE__', JSON.stringify(provenance).replace(/</g, '\\u003c'))
    .replace('__LOCALE_CATALOG_JSON__', JSON.stringify(localeCatalog).replace(/</g, '\\u003c'))
    .replace('__DOCS_JSON__', JSON.stringify(docs).replace(/</g, '\\u003c'))
    .replace('__CHANGELOG_JSON__', JSON.stringify(changelog).replace(/</g, '\\u003c'))
    .replace('__HAIR_ASSETS_JSON__', JSON.stringify(hairAssets).replace(/</g, '\\u003c'));

  if (/__[A-Z0-9_]+__/.test(html)) throw new Error('Site composition left an unresolved template placeholder.');
  await writeFile(join(output, 'index.html'), html, 'utf8');
  if (docs.length) await cp(join(root, 'docs'), join(output, 'docs'), { recursive: true });

  const summary = { output, version: provenance.version, updatedAt: provenance.updatedAt, commit: provenance.commit, localeEntries: localeCatalog.entries.length, docs: docs.length, hairStages: hairAssets.length, socialPreview };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await composeSite();
