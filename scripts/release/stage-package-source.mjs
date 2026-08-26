import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assertExactCommit } from './source-binding.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const trackedRoots = ['app', 'assets', 'server'];

function gitBuffer(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024
  });
}

function normalizeRelativePath(value) {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new TypeError(`Package source path is unsafe or noncanonical: ${value}`);
  }
  return normalized;
}

export function writeExactSnapshot(destination, files) {
  if (!(files instanceof Map) || files.size < 1) throw new TypeError('Package source snapshot requires at least one tracked file.');
  const resolvedDestination = path.resolve(destination);
  fs.rmSync(resolvedDestination, { recursive: true, force: true });
  fs.mkdirSync(resolvedDestination, { recursive: true });
  const written = [];
  for (const [rawPath, rawBytes] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const relativePath = normalizeRelativePath(rawPath);
    const bytes = Buffer.from(rawBytes);
    const output = path.resolve(resolvedDestination, ...relativePath.split('/'));
    if (output !== resolvedDestination && !output.startsWith(`${resolvedDestination}${path.sep}`)) {
      throw new TypeError(`Package source path escapes the staging directory: ${relativePath}`);
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, bytes);
    if (!fs.readFileSync(output).equals(bytes)) throw new TypeError(`Package source staging changed tracked bytes: ${relativePath}`);
    written.push(relativePath);
  }
  return written;
}

function committedFiles(commit) {
  assertExactCommit(commit);
  const paths = gitBuffer(['ls-tree', '-r', '--name-only', '-z', commit, '--', ...trackedRoots])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map(normalizeRelativePath);
  if (paths.length < 1) throw new TypeError('Candidate commit has no package source files.');
  const files = new Map();
  for (const relativePath of paths) {
    files.set(relativePath, gitBuffer(['show', `${commit}:${relativePath}`]));
  }
  return files;
}

export function stagePackageSource(commit, destination = path.join(repositoryRoot, 'dist', 'package-source')) {
  const written = writeExactSnapshot(destination, committedFiles(commit));
  return { commit, destination, fileCount: written.length, paths: written };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const context = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'dist', 'release', 'release-context.json'), 'utf8'));
  const result = stagePackageSource(context.commit);
  process.stdout.write(`Staged ${result.fileCount} package source files from exact Git blobs for ${result.commit}.\n`);
}
