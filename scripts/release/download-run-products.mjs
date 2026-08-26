import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync } from './atomic-file.mjs';

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

export function selectNewestProductArtifacts(artifacts, runId) {
  const result = {};
  for (const product of ['windows', 'container']) {
    const expression = new RegExp(`^${product}-release-${runId}-([1-9][0-9]*)$`);
    const candidates = artifacts
      .map((artifact) => ({ artifact, attempt: Number(expression.exec(artifact.name || '')?.[1] || 0) }))
      .filter((item) => item.attempt > 0 && item.artifact.expired !== true)
      .sort((left, right) => right.attempt - left.attempt || right.artifact.id - left.artifact.id);
    if (candidates.length === 0) throw new TypeError(`No unexpired ${product} release product exists for logical run ${runId}.`);
    result[product] = candidates[0];
  }
  return result;
}

export function downloadRunProducts(repository, runId, destinationRoot) {
  if (!/^\d+$/.test(String(runId)) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) throw new TypeError('Product download requires an exact repository and logical run ID.');
  const pages = ghJson(['api', '--paginate', '--slurp', `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`]);
  const artifacts = pages.flatMap((page) => page.artifacts || []);
  const selected = selectNewestProductArtifacts(artifacts, runId);
  const root = path.resolve(destinationRoot);
  if (fs.existsSync(root)) throw new TypeError(`Product download destination already exists: ${root}`);
  fs.mkdirSync(root, { recursive: true });
  for (const [product, record] of Object.entries(selected)) {
    const destination = path.join(root, product);
    fs.mkdirSync(destination);
    execFileSync('gh', ['run', 'download', String(runId), '--repo', repository, '--name', record.artifact.name, '--dir', destination], {
      cwd: repositoryRoot,
      stdio: 'inherit',
      windowsHide: true
    });
  }
  const selection = Object.fromEntries(Object.entries(selected).map(([product, record]) => [product, {
    artifactId: record.artifact.id,
    name: record.artifact.name,
    attempt: record.attempt,
    sizeInBytes: record.artifact.size_in_bytes
  }]));
  atomicWriteFileSync(path.join(root, 'selection.json'), `${JSON.stringify({ schemaVersion: 1, runId: String(runId), products: selection }, null, 2)}\n`, 'utf8');
  return selection;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!repository || !runId) throw new TypeError('GITHUB_REPOSITORY and GITHUB_RUN_ID are required.');
  const selection = downloadRunProducts(repository, runId, process.argv[2] || path.join(repositoryRoot, 'dist', 'transfers'));
  process.stdout.write(`Downloaded independently selected Windows attempt ${selection.windows.attempt} and container attempt ${selection.container.attempt}.\n`);
}
