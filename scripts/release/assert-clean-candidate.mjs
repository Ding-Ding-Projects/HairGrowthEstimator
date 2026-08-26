import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync } from './atomic-file.mjs';
import { releaseIdentitySha256 } from './release-identity.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const markerPath = path.join(repositoryRoot, 'dist', 'release', 'clean-candidate.json');

function git(...args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  }).trim();
}

function gitStatus() {
  return execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  }).replace(/(?:\r?\n)+$/, '');
}

export function assertCleanStatus(status) {
  if (String(status).trim()) throw new TypeError(`Release candidate must be clean before packaging. Git status reported:\n${String(status).trim()}`);
  return true;
}

function atomicJsonWrite(target, value) {
  atomicWriteFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function beginCleanCandidate() {
  const commit = git('rev-parse', 'HEAD');
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new TypeError('Clean candidate requires a full commit SHA.');
  assertCleanStatus(gitStatus());
  const marker = {
    schemaVersion: 2,
    commit,
    commitEpoch: git('show', '-s', '--format=%ct', commit),
    contextIdentitySha256: currentContextIdentity(commit),
    state: 'clean-at-packaging-start'
  };
  atomicJsonWrite(markerPath, marker);
  return marker;
}

function resolvedContextPath() {
  const configured = process.env.HGE_RELEASE_CONTEXT_PATH;
  return configured ? path.resolve(repositoryRoot, configured) : path.join(repositoryRoot, 'dist', 'release', 'release-context.json');
}

function currentContext(commit) {
  const contextPath = resolvedContextPath();
  if (!fs.existsSync(contextPath)) return null;
  const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  return context?.commit === commit ? context : null;
}

function currentContextIdentity(commit) {
  const context = currentContext(commit);
  return context ? releaseIdentitySha256(context) : null;
}

export function continueCleanCandidate() {
  if (!fs.existsSync(markerPath)) return beginCleanCandidate();
  let marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  const commit = git('rev-parse', 'HEAD');
  const status = gitStatus();
  if (marker.schemaVersion !== 2 || marker.state !== 'clean-at-packaging-start' || marker.commit !== commit) {
    if (!status) return beginCleanCandidate();
    throw new TypeError('Clean candidate marker does not match the currently checked-out commit.');
  }
  assertCleanStatus(status);
  const context = currentContext(commit);
  if (!context) return marker;
  const identitySha256 = releaseIdentitySha256(context);
  if (marker.contextIdentitySha256 && marker.contextIdentitySha256 !== identitySha256) {
    throw new TypeError('Clean candidate marker is bound to a different release context.');
  }
  if (!marker.contextIdentitySha256) {
    marker = { ...marker, contextIdentitySha256: identitySha256 };
    atomicJsonWrite(markerPath, marker);
  }
  return marker;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const marker = process.argv.includes('--begin') ? beginCleanCandidate() : continueCleanCandidate();
  process.stdout.write(`Clean packaging candidate: ${marker.commit}.\n`);
}
