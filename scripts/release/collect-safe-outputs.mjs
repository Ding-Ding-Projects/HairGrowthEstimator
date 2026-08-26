import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { atomicWriteFileSync } from './atomic-file.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, '..', '..');
const maximumFileBytes = 1024 * 1024 * 1024;
const maximumTotalBytes = 1536 * 1024 * 1024;
const maximumFileCount = 32;

const inventories = Object.freeze({
  windows: Object.freeze([
    Object.freeze({ expression: /^dist\/win-unpacked\/Hair Growth Estimator[.]exe$/, pathClass: 'runnable-executable' }),
    Object.freeze({ expression: /^dist\/win-unpacked\/resources\/app[.]asar$/, pathClass: 'packaged-application' }),
    Object.freeze({ expression: /^dist\/squirrel-windows\/HairGrowthEstimator-Setup-[0-9]+[.][0-9]+[.][0-9]+-x64[.]exe$/, pathClass: 'squirrel-installer' }),
    Object.freeze({ expression: /^dist\/squirrel-windows\/RELEASES$/, pathClass: 'squirrel-release-index' }),
    Object.freeze({ expression: /^dist\/squirrel-windows\/hair-growth-estimator-[0-9]+[.][0-9]+[.][0-9]+-(?:full|delta)[.]nupkg$/, pathClass: 'squirrel-package' }),
    Object.freeze({ expression: /^dist\/squirrel-windows\/release-manifest[.]json$/, pathClass: 'squirrel-manifest' })
  ]),
  container: Object.freeze([
    Object.freeze({ expression: /^dist\/container\/hair-growth-api-[0-9]+[.][0-9]+[.][0-9]+-linux-amd64[.]oci[.]tar$/, pathClass: 'oci-archive' }),
    Object.freeze({ expression: /^dist\/container\/container-manifest[.]json$/, pathClass: 'oci-manifest' }),
    Object.freeze({ expression: /^dist\/container\/[.]repro-[12][.]oci[.]tar$/, pathClass: 'oci-repro-archive' }),
    Object.freeze({ expression: /^dist\/container\/[.]repro-[12][.]buildx[.]json$/, pathClass: 'oci-build-metadata' })
  ])
});

function exactText(value, expression, label) {
  const text = String(value || '');
  if (!expression.test(text)) throw new TypeError(`${label} is invalid.`);
  return text;
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fileSha256(file) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function normalizedRelativePath(value) {
  const relativePath = String(value || '').replace(/\\/g, '/');
  if (!relativePath || relativePath.startsWith('/') || relativePath === '..' || relativePath.startsWith('../') || path.posix.normalize(relativePath) !== relativePath) {
    throw new TypeError('Path is outside the safe output inventory.');
  }
  return relativePath;
}

export function safeOutputDescriptor(kind, sourcePath, bytes) {
  const inventory = inventories[kind];
  if (!inventory) throw new TypeError('Safe output inventory kind is invalid.');
  const relativePath = normalizedRelativePath(sourcePath);
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maximumFileBytes) {
    throw new TypeError(`Safe output exceeds the ${maximumFileBytes}-byte per-file size limit.`);
  }
  const match = inventory.find((entry) => entry.expression.test(relativePath));
  if (!match) throw new TypeError(`Path is outside the safe output inventory: ${relativePath}.`);
  const basename = path.posix.basename(relativePath);
  const safeBasename = basename.startsWith('.') ? `partial-${basename.slice(1)}` : basename;
  return {
    sourcePath: relativePath,
    pathClass: match.pathClass,
    artifactPath: `${match.pathClass}/${safeBasename}`
  };
}

function walkFiles(root, relativeRoot, records) {
  if (!fs.existsSync(root)) return;
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory()) throw new TypeError(`Safe output root is not a directory: ${relativeRoot}.`);
  const entries = fs.readdirSync(root, { withFileTypes: true }).sort((left, right) => codeUnitCompare(left.name, right.name));
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    const relativePath = `${relativeRoot}/${entry.name}`.replace(/\\/g, '/');
    if (entry.isSymbolicLink()) throw new TypeError(`Safe output collection refuses a symbolic link: ${relativePath}.`);
    if (entry.isDirectory()) {
      walkFiles(absolutePath, relativePath, records);
    } else if (entry.isFile()) {
      records.push({ absolutePath, relativePath });
    }
  }
}

function candidateRoots(kind) {
  return kind === 'windows'
    ? ['dist/win-unpacked', 'dist/squirrel-windows']
    : ['dist/container'];
}

export function collectSafeOutputs({
  kind,
  repositoryRoot = defaultRepositoryRoot,
  destination,
  sourceCommit,
  runId,
  runAttempt,
  outcome
}) {
  if (!inventories[kind]) throw new TypeError('Safe output collection kind is invalid.');
  const commit = exactText(sourceCommit, /^[0-9a-f]{40}$/, 'Safe output source commit');
  const logicalRunId = exactText(runId, /^[1-9][0-9]*$/, 'Safe output run ID');
  const attempt = exactText(runAttempt, /^[1-9][0-9]*$/, 'Safe output run attempt');
  const jobOutcome = exactText(outcome, /^(?:success|failure|cancelled|skipped)$/, 'Safe output job outcome');
  const root = path.resolve(repositoryRoot);
  const outputRoot = path.resolve(destination);
  const relativeDestination = path.relative(root, outputRoot).replace(/\\/g, '/');
  if (!relativeDestination.startsWith('dist/evidence/') || relativeDestination.includes('../')) {
    throw new TypeError('Safe output destination must remain below dist/evidence.');
  }
  if (fs.existsSync(outputRoot)) throw new TypeError(`Safe output destination already exists: ${outputRoot}`);

  const candidates = [];
  for (const relativeRoot of candidateRoots(kind)) {
    walkFiles(path.join(root, ...relativeRoot.split('/')), relativeRoot, candidates);
  }
  const files = [];
  let totalBytes = 0;
  for (const candidate of candidates.sort((left, right) => codeUnitCompare(left.relativePath, right.relativePath))) {
    const bytes = fs.statSync(candidate.absolutePath).size;
    let descriptor;
    try {
      descriptor = safeOutputDescriptor(kind, candidate.relativePath, bytes);
    } catch (error) {
      if (/outside the safe output inventory/.test(error.message)) continue;
      throw error;
    }
    if (files.length >= maximumFileCount) throw new TypeError(`Safe output collection exceeds the ${maximumFileCount}-file limit.`);
    totalBytes += bytes;
    if (totalBytes > maximumTotalBytes) throw new TypeError(`Safe output collection exceeds the ${maximumTotalBytes}-byte total limit.`);
    const destinationPath = path.join(outputRoot, ...descriptor.artifactPath.split('/'));
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(candidate.absolutePath, destinationPath, fs.constants.COPYFILE_EXCL);
    files.push({
      ...descriptor,
      bytes,
      sha256: fileSha256(destinationPath)
    });
  }
  const manifest = {
    schemaVersion: 1,
    kind,
    sourceCommit: commit,
    runId: logicalRunId,
    runAttempt: Number(attempt),
    outcome: jobOutcome,
    limits: {
      maximumFileCount,
      maximumFileBytes,
      maximumTotalBytes
    },
    fileCount: files.length,
    bytes: totalBytes,
    files
  };
  fs.mkdirSync(outputRoot, { recursive: true });
  atomicWriteFileSync(path.join(outputRoot, 'safe-output-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [kind, destination] = process.argv.slice(2);
  if (!kind || !destination) throw new TypeError('Usage: node collect-safe-outputs.mjs <windows|container> <destination>.');
  const manifest = collectSafeOutputs({
    kind,
    destination,
    sourceCommit: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    outcome: process.env.HGE_JOB_STATUS
  });
  process.stdout.write(`Collected ${manifest.fileCount} safe partial ${manifest.kind} outputs (${manifest.bytes} bytes).\n`);
}
