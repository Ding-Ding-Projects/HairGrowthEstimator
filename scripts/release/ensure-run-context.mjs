import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync } from './atomic-file.mjs';
import { prepareReleaseContext } from './release-context.mjs';
import { releaseIdentity, releaseIdentitySha256 } from './release-identity.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

function ghJson(args) {
  return JSON.parse(execFileSync('gh', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  }));
}

export function contextEvidenceCandidates(artifacts, runId) {
  const expression = new RegExp('^windows-release-' + runId + '-([1-9][0-9]*)$');
  return artifacts
    .map((artifact) => ({ artifact, attempt: Number(expression.exec(artifact.name || '')?.[1] || 0) }))
    .filter((record) => record.attempt > 0 && record.artifact.expired !== true)
    .sort((left, right) => left.attempt - right.attempt || left.artifact.id - right.artifact.id);
}

export function validateRunContext(context, expected) {
  releaseIdentity(context);
  if (String(context.runId) !== String(expected.runId) || context.commit !== expected.commit) {
    throw new TypeError('Resolved release context does not match the logical run and exact candidate commit.');
  }
  if (context.tag !== 'v' + context.version || !/^\d+$/.test(String(context.commitEpoch || ''))) {
    throw new TypeError('Resolved release context version or commit epoch is invalid.');
  }
  if (expected.attempt !== undefined && Number(context.runAttempt) !== Number(expected.attempt)) {
    throw new TypeError('Resolved release context attempt does not match its source artifact attempt.');
  }
  return {
    context,
    sha256: crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex'),
    releaseIdentitySha256: releaseIdentitySha256(context)
  };
}

function runArtifacts(repository, runId) {
  const pages = ghJson(['api', '--paginate', '--slurp', 'repos/' + repository + '/actions/runs/' + runId + '/artifacts?per_page=100']);
  return pages.flatMap((page) => page.artifacts || []);
}

function downloadArtifact(repository, runId, artifactName, destination) {
  execFileSync('gh', ['run', 'download', String(runId), '--repo', repository, '--name', artifactName, '--dir', destination], {
    cwd: repositoryRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  });
}

function firstExistingContext(repository, runId, commit) {
  const candidates = contextEvidenceCandidates(runArtifacts(repository, runId), runId);
  for (const candidate of candidates) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-context-'));
    try {
      downloadArtifact(repository, runId, candidate.artifact.name, temporary);
      const contextPath = path.join(temporary, 'release-context.json');
      if (!fs.existsSync(contextPath)) continue;
      const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
      const validated = validateRunContext(context, { runId, commit, attempt: candidate.attempt });
      return { ...validated, artifactId: candidate.artifact.id, artifactName: candidate.artifact.name, attempt: candidate.attempt };
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
  return null;
}

export function ensureRunContext(environment = process.env, options = {}) {
  const repository = environment.GITHUB_REPOSITORY;
  const runId = environment.GITHUB_RUN_ID;
  const commit = environment.GITHUB_SHA;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !/^\d+$/.test(String(runId)) || !/^[0-9a-f]{40}$/.test(commit || '')) {
    throw new TypeError('Logical-run context requires GITHUB_REPOSITORY, GITHUB_RUN_ID, and GITHUB_SHA.');
  }
  let selected = firstExistingContext(repository, runId, commit);
  if (!selected) {
    if (options.requireExisting) throw new TypeError('No previously resolved release context exists for this logical run.');
    const prepared = prepareReleaseContext(environment, { apply: false });
    const attempt = Number(environment.GITHUB_RUN_ATTEMPT || 1);
    selected = { ...validateRunContext(prepared.context, { runId, commit, attempt }), artifactId: null, artifactName: null, attempt };
  }
  const destination = path.resolve(options.destination || path.join(repositoryRoot, 'dist', 'release', 'release-context.json'));
  atomicWriteFileSync(destination, JSON.stringify(selected.context, null, 2) + '\n', 'utf8');
  if (options.evidencePath) {
    atomicWriteFileSync(path.resolve(options.evidencePath), JSON.stringify(selected.context, null, 2) + '\n', 'utf8');
  }
  const selectionPath = path.join(repositoryRoot, 'dist', 'release', 'context-selection.json');
  atomicWriteFileSync(selectionPath, JSON.stringify({
    schemaVersion: 1,
    logicalRunId: String(runId),
    sourceCommit: commit,
    contextSha256: selected.sha256,
    releaseIdentitySha256: selected.releaseIdentitySha256,
    sourceArtifactId: selected.artifactId,
    sourceArtifactName: selected.artifactName,
    sourceAttempt: selected.attempt
  }, null, 2) + '\n', 'utf8');
  return selected;
}

function valueAfter(arguments_, name) {
  const index = arguments_.indexOf(name);
  if (index < 0) return null;
  if (!arguments_[index + 1]) throw new TypeError(name + ' requires a value.');
  return arguments_[index + 1];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arguments_ = process.argv.slice(2);
  const destination = valueAfter(arguments_, '--destination') || path.join(repositoryRoot, 'dist', 'release', 'release-context.json');
  const evidencePath = valueAfter(arguments_, '--evidence');
  const selected = ensureRunContext(process.env, {
    destination,
    evidencePath,
    requireExisting: arguments_.includes('--require-existing')
  });
  process.stdout.write(
    selected.artifactName
      ? 'Reused release context from ' + selected.artifactName + '.\n'
      : 'Resolved the first release context for this logical run.\n'
  );
}
