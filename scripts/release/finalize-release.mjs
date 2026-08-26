import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { atomicWriteFileSync } from './atomic-file.mjs';
import {
  earliestJobStart,
  formatDuration,
  gh,
  ghJson,
  ghPages,
  releaseInventory,
  releaseTitle,
  renderReleaseNotes,
  targetCommit,
  validateFinalizedReleaseNotes,
  validatePublishedReleaseNotes,
  validateReleaseNotesState,
  verifyLocalReleaseFiles,
  verifyServerAssets
} from './publish-release.mjs';
import { releaseWorkflowJobNames } from './workflow-jobs.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const terminalJobNames = releaseWorkflowJobNames;

function atomicJsonWrite(target, value) {
  atomicWriteFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function canonicalIso(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new TypeError(`${label} is not a valid server timestamp.`);
  return new Date(value).toISOString();
}

export function parseIncludedGithubResponse(raw) {
  const text = String(raw || '');
  const separators = [...text.matchAll(/\r?\n\r?\n/g)]
    .filter((match) => /^[\s\r\n]*[\[{]/.test(text.slice(match.index + match[0].length)));
  if (separators.length !== 1) throw new TypeError('GitHub API readback did not contain one JSON response boundary.');
  const separator = separators[0];
  const prefix = text.slice(0, separator.index);
  const statusOffsets = [0, ...[...prefix.matchAll(/\r?\nHTTP\//g)].map((match) => match.index + match[0].indexOf('HTTP/'))];
  const headers = prefix.slice(statusOffsets.at(-1));
  const dates = [...headers.matchAll(/^date:\s*([^\r\n]+)$/gim)].map((match) => match[1].trim());
  if (dates.length !== 1 || Number.isNaN(Date.parse(dates[0]))) {
    throw new TypeError('GitHub API readback did not contain one valid server Date header.');
  }
  let value;
  try {
    value = JSON.parse(text.slice(separator.index + separator[0].length));
  } catch {
    throw new TypeError('GitHub API readback body is not valid JSON.');
  }
  return { value, serverDate: new Date(dates[0]).toISOString() };
}

export function releaseReadbackWithServerDate(repository, releaseId) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !Number.isSafeInteger(releaseId) || releaseId < 1) {
    throw new TypeError('Release currentness readback requires exact repository and release identities.');
  }
  const response = parseIncludedGithubResponse(gh([
    'api',
    '--include',
    '-H', 'Accept: application/vnd.github+json',
    '-H', 'X-GitHub-Api-Version: 2026-03-10',
    `repos/${repository}/releases/${releaseId}`
  ]));
  if (!response.value || response.value.id !== releaseId) throw new TypeError('Release currentness readback returned the wrong release identity.');
  return { release: response.value, serverDate: response.serverDate };
}

export function validateWorkflowRun(run, { runId, commit, version }, requireTerminal = true) {
  if (!run || !Number.isSafeInteger(run.id) || String(run.id) !== String(runId)) {
    throw new TypeError('Terminal workflow run does not match the exact run ID.');
  }
  if (run.head_sha !== commit) throw new TypeError('Terminal workflow run does not match the exact source commit.');
  if (!Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) throw new TypeError('Terminal workflow run attempt is invalid.');
  if (!Number.isSafeInteger(run.run_number) || version !== `1.0.${run.run_number}`) {
    throw new TypeError('Terminal workflow run number does not match the release version.');
  }
  if (requireTerminal && (run.status !== 'completed' || run.conclusion !== 'success')) {
    throw new TypeError('Terminal workflow run is not completed successfully.');
  }
  if (!requireTerminal) {
    const active = run.status === 'in_progress' && run.conclusion === null;
    const completed = run.status === 'completed' && run.conclusion === 'success';
    if (!active && !completed) throw new TypeError('Workflow run must be active or completed successfully for prior-attempt verification.');
  }
  return run;
}

function validateJobInventory(run, jobs) {
  if (!Array.isArray(jobs) || jobs.length < terminalJobNames.length) throw new TypeError('Terminal workflow timing requires an exact job inventory.');
  const allowed = new Set(terminalJobNames);
  const observedNames = new Set();
  const attemptNames = new Set();
  const jobIds = new Set();
  for (const job of jobs) {
    if (!allowed.has(job?.name)) throw new TypeError(`Terminal workflow timing contains an unexpected job: ${job?.name || 'unnamed'}.`);
    observedNames.add(job.name);
    if (!Number.isSafeInteger(job.id) || job.id < 1 || jobIds.has(job.id)) throw new TypeError('Terminal workflow timing contains a missing or duplicate job ID.');
    jobIds.add(job.id);
    if (!Number.isSafeInteger(job.run_id) || String(job.run_id) !== String(run.id)) throw new TypeError('Terminal workflow job does not match the exact run ID.');
    if (job.head_sha !== run.head_sha) throw new TypeError('Terminal workflow job does not match the exact source commit.');
    if (!Number.isSafeInteger(job.run_attempt) || job.run_attempt < 1 || job.run_attempt > run.run_attempt) {
      throw new TypeError('Terminal workflow job attempt is invalid.');
    }
    const attemptKey = `${job.run_attempt}:${job.name}`;
    if (attemptNames.has(attemptKey)) throw new TypeError(`Terminal workflow timing contains a duplicate job record for attempt ${job.run_attempt}: ${job.name}.`);
    attemptNames.add(attemptKey);
    if (job.status !== 'completed' || !job.conclusion) throw new TypeError(`Terminal workflow job is not completed: ${job.name}.`);
    canonicalIso(job.started_at, `${job.name} start`);
    canonicalIso(job.completed_at, `${job.name} completion`);
  }
  if (JSON.stringify([...observedNames].sort()) !== JSON.stringify([...allowed].sort())) {
    throw new TypeError('Terminal workflow timing does not contain the exact four-job inventory.');
  }
}

function selectedCandidate(jobs, attempt) {
  const eligible = jobs.filter((job) => job.run_attempt <= attempt);
  const selectedJobs = [];
  for (const name of terminalJobNames) {
    const candidates = eligible
      .filter((job) => job.name === name && job.conclusion === 'success')
      .sort((left, right) => right.run_attempt - left.run_attempt);
    if (candidates.length === 0) return null;
    const selected = candidates[0];
    const startedAt = canonicalIso(selected.started_at, `${name} selected start`);
    const completedAt = canonicalIso(selected.completed_at, `${name} selected completion`);
    if (Date.parse(completedAt) < Date.parse(startedAt)) return null;
    selectedJobs.push({
      name,
      id: selected.id,
      runAttempt: selected.run_attempt,
      startedAt,
      completedAt
    });
  }
  const finalizer = selectedJobs.at(-1);
  if (finalizer.runAttempt !== attempt) return null;
  for (let index = 1; index < selectedJobs.length; index += 1) {
    if (selectedJobs[index].runAttempt < selectedJobs[index - 1].runAttempt) return null;
  }
  const actualStarts = eligible
    .filter((job) => job.conclusion !== 'skipped')
    .map((job) => canonicalIso(job.started_at, `${job.name} actual start`))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  if (actualStarts.length === 0) return null;
  const startedAt = actualStarts[0];
  const completedAt = finalizer.completedAt;
  if (selectedJobs.some((job) => Date.parse(job.completedAt) > Date.parse(completedAt))) return null;
  return { startedAt, completedAt, runAttempt: attempt, selectedJobs };
}

export function terminalWorkflowCandidates(run, jobs, expected) {
  validateWorkflowRun(run, expected, true);
  validateJobInventory(run, jobs);
  const candidates = jobs
    .filter((job) => job.name === terminalJobNames.at(-1) && job.status === 'completed' && job.conclusion === 'success')
    .map((job) => selectedCandidate(jobs, job.run_attempt))
    .filter(Boolean)
    .sort((left, right) => left.runAttempt - right.runAttempt);
  if (candidates.length === 0) throw new TypeError('Terminal workflow timing has no coherent successful finalization attempt.');
  return candidates;
}

export function terminalWorkflowBounds(run, jobs, expected) {
  return terminalWorkflowCandidates(run, jobs, expected).at(-1);
}

function workflowRun(repository, runId) {
  return ghJson(['api', `repos/${repository}/actions/runs/${runId}`]);
}

function workflowJobs(repository, runId, lastAttempt) {
  const jobs = [];
  for (let attempt = 1; attempt <= lastAttempt; attempt += 1) {
    const records = ghPages(`repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`)
      .flatMap((page) => page.jobs || []);
    jobs.push(...records.map((job) => ({ ...job, run_attempt: attempt })));
  }
  return jobs;
}

export function pagesReleaseManifest({ repository, release, context, installer, terminalBounds }) {
  if (!terminalBounds?.completedAt || !Number.isSafeInteger(terminalBounds.runAttempt)) {
    throw new TypeError('The site installer manifest requires terminal workflow verification.');
  }
  const repositoryMatch = /^([^/]+)\/([^/]+)$/.exec(repository);
  if (!repositoryMatch) throw new TypeError('Published repository identity is invalid.');
  const [, owner, repositoryName] = repositoryMatch;
  const setup = installer.setup;
  const asset = (release.assets || []).find((candidate) => candidate.name === setup.file);
  if (!asset || asset.size !== setup.bytes || asset.state !== 'uploaded' || !Number.isSafeInteger(asset.id) || asset.id < 1) {
    throw new TypeError('Published setup asset cannot be transformed into a verified site installer manifest.');
  }
  if (!Number.isSafeInteger(release.id) || release.id < 1 || release.tag_name !== context.tag || release.target_commitish !== context.commit || release.draft !== false || release.prerelease !== false) {
    throw new TypeError('Published release identity cannot be transformed into a verified site installer manifest.');
  }
  const publishedAt = canonicalIso(release.published_at, 'Release publication');
  const expectedReleaseUrl = `https://github.com/${repository}/releases/tag/${context.tag}`;
  if (release.html_url !== expectedReleaseUrl) throw new TypeError('Published release URL is not the exact immutable tagged route.');
  let downloadUrl;
  try {
    downloadUrl = new URL(asset.browser_download_url);
  } catch {
    throw new TypeError('Published setup asset has no valid download URL.');
  }
  const expectedDownloadUrl = `https://github.com/${repository}/releases/download/${context.tag}/${setup.file}`;
  if (downloadUrl.href !== expectedDownloadUrl) throw new TypeError('Published setup asset URL is not the immutable tagged GitHub download route.');
  return {
    schemaVersion: 1,
    owner,
    repository: repositoryName,
    tag: context.tag,
    target: context.commit,
    version: context.version,
    platform: 'windows-x64',
    filename: setup.file,
    bytes: setup.bytes,
    sha256: setup.sha256,
    unsigned: true,
    publication: {
      state: 'published',
      draft: false,
      prerelease: false,
      publishedAt,
      releaseId: release.id,
      assetId: asset.id,
      url: downloadUrl.href
    }
  };
}

function exactTerminalNotes({ candidates, context, records, lineCount, publishedAt, body }) {
  const matches = candidates.map((candidate) => {
    const duration = formatDuration(candidate.startedAt, candidate.completedAt);
    const notes = renderReleaseNotes({
      context,
      files: records,
      lineCount,
      startedAt: candidate.startedAt,
      publishedAt,
      completedAt: candidate.completedAt,
      duration
    });
    return { candidate, notes };
  }).filter((record) => record.notes === body);
  if (matches.length !== 1) throw new Error('Final release notes do not match exactly one successful terminal workflow attempt.');
  return matches[0];
}

export function planTerminalFinalization({ candidates, context, records, lineCount, publishedAt, publishedNotes, body }) {
  if (!Array.isArray(candidates) || candidates.length === 0) throw new TypeError('Terminal finalization requires at least one successful workflow candidate.');
  if (body !== publishedNotes) {
    const matched = exactTerminalNotes({ candidates, context, records, lineCount, publishedAt, body });
    if (Date.parse(publishedAt) < Date.parse(matched.candidate.startedAt) || Date.parse(publishedAt) > Date.parse(matched.candidate.completedAt)) {
      throw new TypeError('Server publication time falls outside the selected workflow timing bounds.');
    }
    return { action: 'noop', candidate: matched.candidate, notes: matched.notes };
  }
  const candidate = candidates.at(-1);
  if (Date.parse(publishedAt) < Date.parse(candidate.startedAt) || Date.parse(publishedAt) > Date.parse(candidate.completedAt)) {
    throw new TypeError('Server publication time falls outside the selected workflow timing bounds.');
  }
  const duration = formatDuration(candidate.startedAt, candidate.completedAt);
  const notes = renderReleaseNotes({
    context,
    files: records,
    lineCount,
    startedAt: candidate.startedAt,
    publishedAt,
    completedAt: candidate.completedAt,
    duration
  });
  validateFinalizedReleaseNotes(notes, publishedNotes, candidate.startedAt, candidate.completedAt);
  return { action: 'patch', candidate, notes };
}

export function planPriorAttemptFinalization(input) {
  const plan = planTerminalFinalization(input);
  if (plan.action !== 'noop') {
    throw new Error('Prior-attempt finalization requires exact terminal notes that need no patch.');
  }
  return plan;
}

export function finalizationOutputNames(requireTerminal) {
  return requireTerminal
    ? ['release-notes-terminal.md', 'installer-manifest.json', 'release-readback.json']
    : ['pending-release-readback.json', 'release-readback.json'];
}

export function finalizeRelease({ stagingDirectory, contextPath, lineCountPath, repository, runId, requireTerminal = false, outputDirectory = path.join(repositoryRoot, 'dist', 'release') }) {
  const staging = path.resolve(stagingDirectory);
  const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  const lineCount = fs.readFileSync(lineCountPath, 'utf8');
  const local = verifyLocalReleaseFiles(staging);
  if (String(context.runId) !== String(runId)) throw new Error('Release context logical run ID does not match the finalization run.');
  const matches = releaseInventory(repository, context.tag);
  if (matches.length !== 1) throw new Error('Finalization requires exactly one release record for the intended tag.');
  let release = matches[0];
  if (release.draft || release.prerelease || !release.published_at || release.target_commitish !== context.commit || release.name !== releaseTitle(context)) {
    throw new Error('Finalization found an invalid published release identity or state.');
  }
  verifyServerAssets(repository, release, local.records);
  if (targetCommit(repository, context.tag) !== context.commit) throw new Error('Published release tag does not resolve to the source commit.');
  const startedAt = earliestJobStart(repository, runId);
  const publishedAt = new Date(release.published_at).toISOString();
  const preliminaryNotes = renderReleaseNotes({ context, files: local.records, lineCount, startedAt });
  const publishedNotes = renderReleaseNotes({ context, files: local.records, lineCount, startedAt, publishedAt });
  validatePublishedReleaseNotes(publishedNotes, preliminaryNotes, publishedAt);
  const notesState = validateReleaseNotesState(release.body || '', publishedNotes);
  const outputRoot = path.resolve(outputDirectory);
  fs.mkdirSync(outputRoot, { recursive: true });
  const installerManifestPath = path.join(outputRoot, 'installer-manifest.json');
  let terminalBounds = null;
  let siteManifest = null;
  let releaseNotesState = notesState.state;
  let releaseCurrentnessVerifiedAt = null;

  if (requireTerminal) {
    const run = workflowRun(repository, runId);
    validateWorkflowRun(run, { runId, commit: context.commit, version: context.version }, true);
    const jobs = workflowJobs(repository, runId, run.run_attempt);
    const candidates = terminalWorkflowCandidates(run, jobs, { runId, commit: context.commit, version: context.version });
    const plan = planTerminalFinalization({
      candidates,
      context,
      records: local.records,
      lineCount,
      publishedAt,
      publishedNotes,
      body: release.body || ''
    });
    terminalBounds = plan.candidate;
    const notesPath = path.join(outputRoot, 'release-notes-terminal.md');
    atomicWriteFileSync(notesPath, plan.notes, 'utf8');
    if (plan.action === 'patch') {
      gh(['api', '--method', 'PATCH', `repos/${repository}/releases/${release.id}`, '-F', `body=@${notesPath}`]);
    }
    const currentness = releaseReadbackWithServerDate(repository, release.id);
    release = currentness.release;
    releaseCurrentnessVerifiedAt = currentness.serverDate;
    if (release.body !== plan.notes) throw new Error('Terminal release notes did not read back byte-for-byte after the one permitted patch.');
    if (Date.parse(releaseCurrentnessVerifiedAt) < Date.parse(terminalBounds.completedAt)) {
      throw new Error('Release currentness readback predates the exact terminal workflow completion.');
    }
    releaseNotesState = 'finalized';
    verifyServerAssets(repository, release, local.records);
    siteManifest = pagesReleaseManifest({ repository, release, context, installer: local.installer, terminalBounds });
    atomicJsonWrite(installerManifestPath, siteManifest);
  } else {
    if (fs.existsSync(installerManifestPath)) throw new Error('Pending verification refuses a stale site-consumable installer manifest.');
    if (notesState.state === 'finalized') {
      const run = workflowRun(repository, runId);
      validateWorkflowRun(run, { runId, commit: context.commit, version: context.version }, false);
      const priorAttempt = run.status === 'completed' ? run.run_attempt : run.run_attempt - 1;
      if (priorAttempt < 1) throw new Error('Finalized notes have no prior terminal workflow attempt to verify.');
      const priorRun = { ...run, status: 'completed', conclusion: 'success', run_attempt: priorAttempt };
      const priorJobs = workflowJobs(repository, runId, priorAttempt);
      const candidates = terminalWorkflowCandidates(priorRun, priorJobs, { runId, commit: context.commit, version: context.version });
      planPriorAttemptFinalization({
        candidates,
        context,
        records: local.records,
        lineCount,
        publishedAt,
        publishedNotes,
        body: release.body || ''
      });
      releaseNotesState = 'finalized-prior-attempt';
    }
    atomicJsonWrite(path.join(outputRoot, 'pending-release-readback.json'), {
      schemaVersion: 1,
      repository,
      releaseId: release.id,
      tag: context.tag,
      commit: context.commit,
      runId: String(runId),
      publishedAt,
      releaseNotesState,
      siteInstallerManifest: 'withheld-pending-terminal-run-verification'
    });
  }

  if (requireTerminal && release.body !== renderReleaseNotes({
    context,
    files: local.records,
    lineCount,
    startedAt: terminalBounds.startedAt,
    publishedAt,
    completedAt: terminalBounds.completedAt,
    duration: formatDuration(terminalBounds.startedAt, terminalBounds.completedAt)
  })) {
    throw new Error('Release notes did not read back byte-for-byte at the terminal timing state.');
  }
  const record = {
    schemaVersion: 2,
    releaseId: release.id,
    tag: context.tag,
    commit: context.commit,
    runId: String(runId),
    startedAt,
    publishedAt,
    workflowCompletedAt: terminalBounds?.completedAt || null,
    releaseCurrentnessVerifiedAt,
    terminalWorkflowVerified: Boolean(terminalBounds),
    releaseNotesState,
    terminalRunAttempt: terminalBounds?.runAttempt || null,
    selectedJobs: terminalBounds?.selectedJobs || [],
    assetCount: local.records.length,
    siteInstallerManifest: siteManifest ? 'installer-manifest.json' : null,
    outputFiles: finalizationOutputNames(requireTerminal)
  };
  atomicJsonWrite(path.join(outputRoot, 'release-readback.json'), record);
  return { release, record, siteManifest };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const mode = process.argv[2];
  if (!['--verify-pending', '--terminal'].includes(mode)) throw new TypeError('Finalization mode must be --verify-pending or --terminal.');
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!repository || !runId) throw new Error('GITHUB_REPOSITORY and GITHUB_RUN_ID are required.');
  const result = finalizeRelease({
    stagingDirectory: process.argv[3] || path.join(repositoryRoot, 'dist', 'release-assets'),
    contextPath: process.argv[4] || path.join(repositoryRoot, 'dist', 'release', 'release-context.json'),
    lineCountPath: process.argv[5] || path.join(repositoryRoot, 'dist', 'release-assets', 'line-count.md'),
    repository,
    runId,
    requireTerminal: mode === '--terminal'
  });
  process.stdout.write(result.record.terminalWorkflowVerified
    ? `Release ${result.release.tag_name} has terminal workflow timing and exact readback.\n`
    : `Release ${result.release.tag_name} is published; workflow completion remains pending terminal run verification.\n`);
}
