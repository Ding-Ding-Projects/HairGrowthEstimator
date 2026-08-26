import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync } from './atomic-file.mjs';
import { assertMatchingReleaseIdentity, releaseIdentitySha256 } from './release-identity.mjs';
import { validateDeltaFeedState } from './release-context.mjs';
import { safeReleaseBasename } from './stage-release-files.mjs';
import { validateSourceBindingReceipt } from './source-binding.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function gh(args, options = {}) {
  return execFileSync('gh', args, {
    cwd: repositoryRoot,
    encoding: options.binary ? null : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 768 * 1024 * 1024
  });
}

export function ghJson(args) {
  return JSON.parse(gh(args));
}

export function ghPages(endpoint) {
  return ghJson(['api', '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2026-03-10', '--paginate', '--slurp', endpoint])
    .flatMap((page) => Array.isArray(page) ? page : [page]);
}

function exactFile(directory, name) {
  const target = path.join(directory, safeReleaseBasename(name));
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new TypeError(`Required release file is missing: ${name}`);
  return target;
}

function record(file) {
  const bytes = fs.readFileSync(file);
  return { name: path.basename(file), path: file, bytes: bytes.length, sha256: sha256(bytes) };
}

export function validateProductSourceBindings(installer, container) {
  for (const [label, binding] of [
    ['installer app.asar', installer?.embedded?.sourceBinding?.appAsar],
    ['installer server', installer?.embedded?.sourceBinding?.server],
    ['container server', container?.sourceBinding]
  ]) {
    try {
      validateSourceBindingReceipt(binding);
    } catch (error) {
      throw new TypeError(`${label} source-binding evidence is incomplete: ${error.message}`);
    }
  }
  return true;
}

export function verifyLocalReleaseFiles(directory) {
  const installerManifestPath = exactFile(directory, 'release-manifest.json');
  const containerManifestPath = exactFile(directory, 'container-manifest.json');
  const installer = JSON.parse(fs.readFileSync(installerManifestPath, 'utf8'));
  const container = JSON.parse(fs.readFileSync(containerManifestPath, 'utf8'));
  if (installer.schemaVersion !== 2 || installer.installerFamily !== 'Squirrel.Windows' || installer.signing !== 'NotSigned') {
    throw new TypeError('Installer manifest schema, family, or signing state is invalid.');
  }
  if (container.schemaVersion !== 2 || container.archive?.format !== 'oci') throw new TypeError('Container manifest schema or archive format is invalid.');
  validateProductSourceBindings(installer, container);
  const records = [];
  const add = (file) => {
    const value = record(file);
    if (records.some((item) => item.name === value.name)) throw new TypeError(`Duplicate release basename: ${value.name}`);
    records.push(value);
    return value;
  };
  const setup = add(exactFile(directory, installer.setup.file));
  const releases = add(exactFile(directory, installer.releaseIndex.file));
  if (setup.bytes !== installer.setup.bytes || setup.sha256 !== installer.setup.sha256 || installer.setup.signing !== 'NotSigned') throw new TypeError('Setup file does not match its unsigned installer manifest.');
  if (releases.bytes !== installer.releaseIndex.bytes || releases.sha256 !== installer.releaseIndex.sha256) throw new TypeError('RELEASES does not match its installer manifest.');
  for (const packageRecord of installer.packages) {
    const value = add(exactFile(directory, packageRecord.file));
    if (value.bytes !== packageRecord.bytes || value.sha256 !== packageRecord.sha256) throw new TypeError(`Squirrel package does not match its manifest: ${value.name}`);
  }
  const archive = add(exactFile(directory, container.archive.file));
  if (archive.bytes !== container.archive.bytes || archive.sha256 !== container.archive.sha256) throw new TypeError('OCI archive does not match its container manifest.');
  add(installerManifestPath);
  add(containerManifestPath);
  const lineCountMarkdownPath = exactFile(directory, 'line-count.md');
  const lineCountJsonPath = exactFile(directory, 'line-count.json');
  const lineCount = JSON.parse(fs.readFileSync(lineCountJsonPath, 'utf8'));
  const lineCountMarkdown = fs.readFileSync(lineCountMarkdownPath, 'utf8');
  if (lineCount.schemaVersion !== 2 || lineCount.commit !== installer.sourceCommit || !lineCountMarkdown.includes(`Line count at commit \`${installer.sourceCommit}\`.`)) {
    throw new TypeError('Line-count evidence is not bound to the installer source commit.');
  }
  for (const total of Object.values(lineCount.totals || {})) {
    if (total.agent + total.human !== total.total) throw new TypeError('Line-count surviving authorship arithmetic is inconsistent.');
  }
  add(lineCountMarkdownPath);
  add(lineCountJsonPath);

  const actualNames = fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const expectedNames = records.map((item) => item.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new TypeError(`Release staging directory has an unexpected file set. Expected ${expectedNames.join(', ')}; received ${actualNames.join(', ')}.`);
  }
  if (installer.version !== container.version || installer.sourceCommit !== container.sourceCommit) throw new TypeError('Windows and container release files disagree on version or source commit.');
  assertMatchingReleaseIdentity(installer.releaseIdentity, container.releaseIdentity);
  if (installer.releaseIdentitySha256 !== releaseIdentitySha256(installer.releaseIdentity) || container.releaseIdentitySha256 !== releaseIdentitySha256(container.releaseIdentity)) {
    throw new TypeError('Release-product identity digest is invalid.');
  }
  return { installer, container, lineCount, records: records.sort((left, right) => left.name.localeCompare(right.name)) };
}

export function formatDuration(startedAt, completedAt) {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new TypeError('Workflow timing bounds are invalid.');
  const totalSeconds = Math.floor((end - start) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const PENDING_PUBLICATION = '- Release published: pending server publication timestamp';
const PENDING_TERMINAL = '- Workflow completed: pending terminal run verification\n- Workflow duration: pending terminal run verification';

export function validatePublishedReleaseNotes(notes, preliminaryNotes, publishedAt) {
  const expected = String(preliminaryNotes).replace(PENDING_PUBLICATION, `- Release published: \`${publishedAt}\``);
  if (!String(preliminaryNotes).includes(PENDING_PUBLICATION) || !String(preliminaryNotes).includes(PENDING_TERMINAL)) {
    throw new TypeError('Preliminary release notes do not contain the exact pending publication and terminal timing boundaries.');
  }
  if (String(notes) !== expected) throw new TypeError('Published release notes differ outside the exact server publication timing boundary.');
  return expected;
}

export function validateFinalizedReleaseNotes(notes, publishedNotes, startedAt, completedAt) {
  const duration = formatDuration(startedAt, completedAt);
  const expectedTiming = `- Workflow completed: \`${completedAt}\`\n- Workflow duration: \`${duration}\``;
  if (!String(publishedNotes).includes(PENDING_TERMINAL)) throw new TypeError('Published release notes do not contain the exact pending terminal timing boundary.');
  const expected = String(publishedNotes).replace(PENDING_TERMINAL, expectedTiming);
  if (String(notes) !== expected) throw new TypeError('Final release notes differ outside the exact workflow timing boundary.');
  return { notes: expected, duration };
}

function canonicalIso(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError(`${label} must be one canonical UTC ISO-8601 timestamp.`);
  }
  return value;
}

export function validateReleaseNotesState(notes, publishedNotes) {
  const candidate = String(notes);
  const pending = String(publishedNotes);
  if (candidate === pending) return { state: 'pending', completedAt: null, duration: null };
  const markerIndex = pending.indexOf(PENDING_TERMINAL);
  if (markerIndex < 0 || pending.indexOf(PENDING_TERMINAL, markerIndex + 1) >= 0) {
    throw new TypeError('Published release notes do not contain one exact pending terminal timing boundary.');
  }
  const prefix = pending.slice(0, markerIndex);
  const suffix = pending.slice(markerIndex + PENDING_TERMINAL.length);
  if (!candidate.startsWith(prefix) || !candidate.endsWith(suffix)) {
    throw new TypeError('Release notes are not in the exact pending or finalized state.');
  }
  const replacement = candidate.slice(prefix.length, candidate.length - suffix.length);
  const match = /^- Workflow completed: `(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)`\n- Workflow duration: `(\d{2,}:\d{2}:\d{2})`$/.exec(replacement);
  const startMatches = [...pending.matchAll(/^- Workflow started: `(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)`$/gm)];
  if (!match || startMatches.length !== 1) throw new TypeError('Release notes are not in the exact pending or finalized state.');
  const startedAt = canonicalIso(startMatches[0][1], 'Workflow start');
  const completedAt = canonicalIso(match[1], 'Workflow completion');
  const validated = validateFinalizedReleaseNotes(candidate, pending, startedAt, completedAt);
  if (match[2] !== validated.duration) throw new TypeError('Release notes are not in the exact pending or finalized state.');
  return { state: 'finalized', completedAt, duration: validated.duration };
}

export function validatePublisherRetryNotes(notes, preliminaryNotes, publishedNotes) {
  if (String(notes) === String(preliminaryNotes)) return { state: 'preliminary-published', action: 'patch-published-notes' };
  let state;
  try {
    state = validateReleaseNotesState(notes, publishedNotes);
  } catch {
    throw new TypeError('Published release notes are not in a known publication recovery state.');
  }
  return state.state === 'pending'
    ? { state: 'pending-terminal', action: 'none' }
    : { state: 'finalized-unverified', action: 'handoff-to-finalizer' };
}

export function earliestServerJobStart(jobs) {
  const instants = (jobs || [])
    .filter((job) => job?.conclusion !== 'skipped')
    .map((job) => job?.started_at)
    .filter((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
    .map((value) => new Date(value).toISOString())
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  if (instants.length === 0) throw new Error('Workflow jobs API did not provide a valid earliest started_at timestamp.');
  return instants[0];
}

export function earliestJobStart(repository, runId) {
  const pages = ghPages(`repos/${repository}/actions/runs/${runId}/jobs?filter=all&per_page=100`);
  return earliestServerJobStart(pages.flatMap((page) => page.jobs || []));
}

export function releaseInventory(repository, tag) {
  return ghPages(`repos/${repository}/releases?per_page=100`).filter((release) => release.tag_name === tag);
}

export function releaseTitle(context) {
  return context.catalogStatus === 'resolved'
    ? `Hair Growth Estimator ${context.version} · ${context.codeName}`
    : `Hair Growth Estimator ${context.version}`;
}

export function renderReleaseNotes({ context, files, lineCount, startedAt, publishedAt, completedAt, duration }) {
  validateDeltaFeedState(context.deltaFeed);
  const publication = publishedAt
    ? `- Release published: \`${publishedAt}\``
    : PENDING_PUBLICATION;
  const completion = completedAt
    ? `- Workflow completed: \`${completedAt}\`\n- Workflow duration: \`${duration}\``
    : PENDING_TERMINAL;
  const timing = `- Workflow started: \`${startedAt}\`\n${publication}\n${completion}`;
  const fileRows = files.map((file) => `| \`${file.name}\` | ${file.bytes} | \`${file.sha256}\` |`).join('\n');
  const catalog = context.catalogStatus === 'resolved'
    ? `- Release code name: ${context.codeName}\n- Catalog record: \`${context.catalogRecord}\`\n- Public catalog photo: [${context.codeName}](${context.publicPhotoUrl})\n\nThe catalog photo is linked from its published catalog release and is not copied into this repository or release.`
    : '- Release code name: unavailable\n- Catalog record: unavailable\n- Public catalog photo: unavailable\n\nThe pinned public catalog could not resolve a published unused photo, so this release uses its version without inventing or copying an image.';
  return `# Hair Growth Estimator ${context.version}\n\n## Build identity\n\n- Source commit: \`${context.commit}\`\n- Logical workflow run: \`${context.runId}\`\n- Version: \`${context.version}\`\n${catalog}\n\n## Workflow timing\n\n${timing}\n\n## Downloadable files\n\n| File | Bytes | SHA-256 |\n| --- | ---: | --- |\n${fileRows}\n\nThe Windows setup executable and application executable are intentionally unsigned. Windows can show an unknown-publisher or SmartScreen warning. The OCI archive is a portable container image layout for local or private-LAN hosting.\n\n## Squirrel package history\n\nThis is the first release, so no previous full package exists and a delta package is unavailable. The release includes every available full Squirrel product and does not invent a synthetic delta. Every later release must acquire and verify the previous full package, generate and validate the delta, and fail closed when that chain is unavailable.\n\n## Verification boundary\n\nGitHub Actions ran packaging and release-integrity validation only. It ran no test suite and no lint. Local checks belong to the source task and are not represented as workflow coverage.\n\n## Line count\n\nCommand: \`npm run count-lines -- --commit ${context.commit}\`\n\n${lineCount.trim()}\n`;
}

function writeFileAtomic(target, contents) {
  atomicWriteFileSync(target, contents, 'utf8');
}

export function targetCommit(repository, tag) {
  const output = gh(['api', `repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`, '--jq', '.object.sha']).trim();
  if (!/^[0-9a-f]{40}$/.test(output)) throw new Error('Release tag does not resolve to a full commit SHA.');
  return output;
}

export function downloadAsset(repository, assetId) {
  return gh(['api', '-H', 'Accept: application/octet-stream', `repos/${repository}/releases/assets/${assetId}`], { binary: true });
}

export function verifyServerAssets(repository, release, localRecords) {
  const serverAssets = [...(release.assets || [])].sort((left, right) => left.name.localeCompare(right.name));
  const local = [...localRecords].sort((left, right) => left.name.localeCompare(right.name));
  if (JSON.stringify(serverAssets.map((asset) => asset.name)) !== JSON.stringify(local.map((file) => file.name))) throw new Error('Published release asset names do not match the verified local set.');
  for (let index = 0; index < local.length; index += 1) {
    const server = serverAssets[index];
    const expected = local[index];
    if (server.size !== expected.bytes || server.state !== 'uploaded') throw new Error(`Published release asset size or state is wrong: ${server.name}`);
    const downloaded = downloadAsset(repository, server.id);
    if (downloaded.length !== expected.bytes || sha256(downloaded) !== expected.sha256) throw new Error(`Published release asset bytes do not match: ${server.name}`);
  }
}

function uploadMissingAssets(repository, release, localRecords) {
  const byName = new Map((release.assets || []).map((asset) => [asset.name, asset]));
  for (const existing of release.assets || []) {
    if (!localRecords.some((file) => file.name === existing.name)) throw new Error(`Draft release contains an unexpected asset: ${existing.name}`);
  }
  for (const file of localRecords) {
    const existing = byName.get(file.name);
    if (existing) {
      const downloaded = downloadAsset(repository, existing.id);
      if (downloaded.length !== file.bytes || sha256(downloaded) !== file.sha256) throw new Error(`Draft release asset conflicts with verified bytes: ${file.name}`);
      continue;
    }
    const encodedName = encodeURIComponent(file.name);
    gh(['api', '--method', 'POST', '-H', 'Content-Type: application/octet-stream', `https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${encodedName}`, '--input', file.path]);
  }
}

export function publishRelease({ stagingDirectory, contextPath, lineCountPath, repository, runId }) {
  const staging = path.resolve(stagingDirectory);
  const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  const lineCount = fs.readFileSync(lineCountPath, 'utf8');
  const local = verifyLocalReleaseFiles(staging);
  assertMatchingReleaseIdentity(context, local.installer.releaseIdentity, local.container.releaseIdentity);
  if (String(context.runId) !== String(runId)) throw new Error('Release context logical run ID does not match the current workflow run.');
  const startedAt = earliestJobStart(repository, runId);
  const notesDirectory = path.join(repositoryRoot, 'dist', 'release');
  const preliminaryPath = path.join(notesDirectory, 'release-notes-preliminary.md');
  const finalPath = path.join(notesDirectory, 'release-notes-published.md');
  const preliminaryNotes = renderReleaseNotes({ context, files: local.records, lineCount, startedAt });
  writeFileAtomic(preliminaryPath, preliminaryNotes);

  let matches = releaseInventory(repository, context.tag);
  if (matches.length > 1) throw new Error(`More than one release record uses tag ${context.tag}.`);
  if (matches.length === 0) {
    gh(['release', 'create', context.tag, ...local.records.map((file) => file.path), '--repo', repository, '--target', context.commit, '--title', releaseTitle(context), '--notes-file', preliminaryPath, '--draft']);
    matches = releaseInventory(repository, context.tag);
  }
  if (matches.length !== 1) throw new Error('Draft release creation did not yield exactly one release record.');
  let release = matches[0];
  if (release.target_commitish !== context.commit) throw new Error('Release target does not match the source commit.');
  const expectedTitle = releaseTitle(context);
  if (release.name !== expectedTitle || release.prerelease) throw new Error('Release title or prerelease state does not match the intended publication.');
  if (!release.draft) {
    if (!release.published_at) throw new Error('Published release has no server publication timestamp.');
    const publishedAt = new Date(release.published_at).toISOString();
    const publishedNotes = renderReleaseNotes({ context, files: local.records, lineCount, startedAt, publishedAt });
    validatePublishedReleaseNotes(publishedNotes, preliminaryNotes, publishedAt);
    writeFileAtomic(finalPath, publishedNotes);
    let notesState = validatePublisherRetryNotes(release.body || '', preliminaryNotes, publishedNotes);
    if (notesState.action === 'patch-published-notes') {
      gh(['api', '--method', 'PATCH', `repos/${repository}/releases/${release.id}`, '-F', `body=@${finalPath}`]);
      release = ghJson(['api', `repos/${repository}/releases/${release.id}`]);
      if (release.body !== publishedNotes) throw new Error('Interrupted publication recovery did not read back the exact published pending notes.');
      notesState = { state: 'pending-terminal', action: 'recovered-published-notes' };
    }
    if (release.draft || release.prerelease) throw new Error('Published release retry read back an invalid release state.');
    verifyServerAssets(repository, release, local.records);
    if (targetCommit(repository, context.tag) !== context.commit) throw new Error('Published release tag does not resolve to the source commit.');
    const publicationRecord = {
      schemaVersion: 1,
      releaseId: release.id,
      tag: context.tag,
      commit: context.commit,
      logicalRunId: String(runId),
      startedAt,
      publishedAt,
      releaseNotesState: notesState.state,
      files: local.records.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
      reused: true
    };
    writeFileAtomic(path.join(notesDirectory, 'published-release.json'), `${JSON.stringify(publicationRecord, null, 2)}\n`);
    return {
      release,
      reused: true,
      startedAt,
      publishedAt,
      completion: notesState.state === 'finalized-unverified'
        ? 'existing-finalized-notes-awaiting-finalizer-verification'
        : 'pending-terminal-run-verification'
    };
  }

  uploadMissingAssets(repository, release, local.records);
  release = ghJson(['api', `repos/${repository}/releases/${release.id}`]);
  verifyServerAssets(repository, release, local.records);
  gh(['api', '--method', 'PATCH', `repos/${repository}/releases/${release.id}`, '-F', 'draft=false', '-F', `body=@${preliminaryPath}`]);
  release = ghJson(['api', `repos/${repository}/releases/${release.id}`]);
  if (release.draft || !release.published_at) throw new Error('Release did not become a published non-draft record.');
  const publishedAt = new Date(release.published_at).toISOString();
  const publishedNotes = renderReleaseNotes({ context, files: local.records, lineCount, startedAt, publishedAt });
  validatePublishedReleaseNotes(publishedNotes, preliminaryNotes, publishedAt);
  writeFileAtomic(finalPath, publishedNotes);
  gh(['api', '--method', 'PATCH', `repos/${repository}/releases/${release.id}`, '-F', `body=@${finalPath}`]);
  release = ghJson(['api', `repos/${repository}/releases/${release.id}`]);
  if (release.draft || release.prerelease || release.body !== publishedNotes) throw new Error('Published release notes did not read back byte-for-byte with an honest pending terminal boundary.');
  verifyServerAssets(repository, release, local.records);
  if (targetCommit(repository, context.tag) !== context.commit) throw new Error('Published release tag does not resolve to the source commit.');
  const publicationRecord = {
    schemaVersion: 1,
    releaseId: release.id,
    tag: context.tag,
    commit: context.commit,
    logicalRunId: String(runId),
    startedAt,
    publishedAt,
    releaseNotesState: 'pending',
    files: local.records.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
    reused: false
  };
  writeFileAtomic(path.join(notesDirectory, 'published-release.json'), `${JSON.stringify(publicationRecord, null, 2)}\n`);
  return { release, reused: false, startedAt, publishedAt, completion: 'pending-terminal-run-verification' };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!repository || !runId) throw new Error('GITHUB_REPOSITORY and GITHUB_RUN_ID are required.');
  const result = publishRelease({
    stagingDirectory: process.argv[2] || path.join(repositoryRoot, 'dist', 'release-assets'),
    contextPath: process.argv[3] || path.join(repositoryRoot, 'dist', 'release', 'release-context.json'),
    lineCountPath: process.argv[4] || path.join(repositoryRoot, 'dist', 'release-assets', 'line-count.md'),
    repository,
    runId
  });
  process.stdout.write(`Release ${result.release.tag_name} is published at ${result.release.html_url}.\n`);
  process.stdout.write(result.completion === 'existing-finalized-notes-awaiting-finalizer-verification'
    ? 'Existing finalized release notes still require downstream server-job verification.\n'
    : 'Workflow completion remains pending until the terminal run timestamp is independently verified.\n');
}
