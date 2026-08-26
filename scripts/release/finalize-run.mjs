import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { countRepository, renderMarkdown } from '../core/count-lines.mjs';
import { atomicWriteFileSync } from './atomic-file.mjs';
import { downloadRunProducts } from './download-run-products.mjs';
import { validateRunContext } from './ensure-run-context.mjs';
import { finalizeRelease, releaseReadbackWithServerDate, validateWorkflowRun } from './finalize-release.mjs';
import {
  ghJson,
  releaseInventory,
  targetCommit,
  verifyLocalReleaseFiles,
  verifyServerAssets
} from './publish-release.mjs';
import { stageReleaseFiles } from './stage-release-files.mjs';
import {
  trustedProductValidationRecord,
  validateTransferredProducts,
  writeTrustedProductValidation
} from './validate-transferred-products.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const transferInputNames = Object.freeze([
  'installer-manifest.json',
  'release-context.json',
  'trusted-product-validation.json'
]);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new TypeError(`${label} has an unexpected field inventory.`);
  return value;
}

function exactRepository(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new TypeError('Post-run finalization requires an exact repository identity.');
  }
  return value;
}

function exactRunId(value) {
  const text = String(value);
  if (!/^[1-9][0-9]*$/.test(text)) throw new TypeError('Post-run finalization requires a positive decimal run ID.');
  return text;
}

function exactCommit(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    throw new TypeError('Post-run finalization requires a full lowercase candidate commit.');
  }
  return value;
}

function positiveSafeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new TypeError(`${label} must be a positive safe integer.`);
  return number;
}

function fileBytesMap(files) {
  if (!(files instanceof Map)) throw new TypeError('Terminal transfer files must be supplied as a Map.');
  const names = [...files.keys()].sort();
  if (JSON.stringify(names) !== JSON.stringify(transferInputNames)) {
    throw new TypeError('Terminal transfer requires the exact three-file inventory.');
  }
  return new Map(names.map((name) => {
    const value = files.get(name);
    if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
      throw new TypeError(`Terminal transfer input is not a byte buffer: ${name}`);
    }
    return [name, Buffer.from(value)];
  }));
}

function jsonFile(files, name) {
  try {
    return JSON.parse(files.get(name).toString('utf8'));
  } catch {
    throw new TypeError(`Terminal transfer JSON is invalid: ${name}`);
  }
}

export function validatePostRunIdentity({ repository, runId, commit, run, context }) {
  const expectedRepository = exactRepository(repository);
  const expectedRunId = exactRunId(runId);
  const expectedCommit = exactCommit(commit);
  if (run?.repository?.full_name !== expectedRepository) {
    throw new TypeError('Terminal workflow run repository identity does not match the requested repository identity.');
  }
  validateWorkflowRun(run, {
    runId: expectedRunId,
    commit: expectedCommit,
    version: `1.0.${positiveSafeInteger(run.run_number, 'workflow run number')}`
  }, true);
  const version = `1.0.${run.run_number}`;
  if (
    !context
    || String(context.runId) !== expectedRunId
    || context.commit !== expectedCommit
    || context.version !== version
    || context.tag !== `v${version}`
  ) {
    throw new TypeError('Release context does not match the terminal workflow run version and tag.');
  }
  return {
    repository: expectedRepository,
    runId: expectedRunId,
    runAttempt: positiveSafeInteger(run.run_attempt, 'workflow run attempt'),
    commit: expectedCommit,
    version,
    tag: `v${version}`
  };
}

export function validateTerminalTransferReceipt(receipt, suppliedFiles) {
  const files = fileBytesMap(suppliedFiles);
  exactKeys(receipt, [
    'schemaVersion',
    'repository',
    'runId',
    'contextRunAttempt',
    'terminalRunAttempt',
    'tag',
    'target',
    'version',
    'files'
  ], 'Terminal transfer receipt');
  if (receipt.schemaVersion !== 1) throw new TypeError('Terminal transfer receipt schema is unsupported.');
  const repository = exactRepository(receipt.repository);
  const runId = exactRunId(receipt.runId);
  const contextRunAttempt = positiveSafeInteger(receipt.contextRunAttempt, 'terminal transfer context run attempt');
  const terminalRunAttempt = positiveSafeInteger(receipt.terminalRunAttempt, 'terminal transfer terminal run attempt');
  if (terminalRunAttempt < contextRunAttempt) throw new TypeError('Terminal transfer attempt cannot predate the release context attempt.');
  const target = exactCommit(receipt.target);
  if (typeof receipt.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(receipt.version) || receipt.tag !== `v${receipt.version}`) {
    throw new TypeError('Terminal transfer version and tag disagree.');
  }
  if (!Array.isArray(receipt.files) || receipt.files.length !== transferInputNames.length) {
    throw new TypeError('Terminal transfer receipt requires the exact three-file inventory.');
  }
  const recordNames = receipt.files.map((record) => record?.file);
  if (JSON.stringify(recordNames) !== JSON.stringify(transferInputNames)) {
    throw new TypeError('Terminal transfer receipt files are not in the exact default code-unit order.');
  }
  for (const record of receipt.files) {
    exactKeys(record, ['file', 'bytes', 'sha256'], `Terminal transfer file record ${record?.file || 'unknown'}`);
    const bytes = files.get(record.file);
    if (!Number.isSafeInteger(record.bytes) || record.bytes < 1 || record.bytes !== bytes.length) {
      throw new TypeError(`Terminal transfer byte count disagrees: ${record.file}`);
    }
    if (!/^[0-9a-f]{64}$/.test(record.sha256 || '') || record.sha256 !== sha256(bytes)) {
      throw new TypeError(`Terminal transfer digest disagrees: ${record.file}`);
    }
  }

  const installer = jsonFile(files, 'installer-manifest.json');
  const context = jsonFile(files, 'release-context.json');
  const trusted = jsonFile(files, 'trusted-product-validation.json');
  const [owner, name] = repository.split('/');
  if (
    installer.schemaVersion !== 1
    || installer.owner !== owner
    || installer.repository !== name
    || installer.tag !== receipt.tag
    || installer.target !== target
    || installer.version !== receipt.version
  ) {
    throw new TypeError('Terminal transfer installer manifest identity disagrees with the receipt.');
  }
  if (
    context.schemaVersion !== 1
    || String(context.runId) !== runId
    || positiveSafeInteger(context.runAttempt, 'release context run attempt') !== contextRunAttempt
    || context.commit !== target
    || context.version !== receipt.version
    || context.tag !== receipt.tag
  ) {
    throw new TypeError('Terminal transfer release context identity or release context attempt disagrees with the receipt.');
  }
  exactKeys(trusted, [
    'schemaVersion',
    'sourceCommit',
    'version',
    'installerManifestSha256',
    'containerManifestSha256',
    'installerSourceBinding',
    'containerSourceBinding'
  ], 'Trusted product validation');
  if (
    trusted.schemaVersion !== 1
    || trusted.sourceCommit !== target
    || trusted.version !== receipt.version
    || !/^[0-9a-f]{64}$/.test(trusted.installerManifestSha256 || '')
    || !/^[0-9a-f]{64}$/.test(trusted.containerManifestSha256 || '')
  ) {
    throw new TypeError('Terminal transfer trusted product identity disagrees with the receipt.');
  }
  return Boolean(repository && runId && contextRunAttempt && terminalRunAttempt);
}

export function buildTerminalTransferReceipt({ repository, context, readback, files }) {
  const exactFiles = fileBytesMap(files);
  const expectedRepository = exactRepository(repository);
  const runId = exactRunId(context?.runId);
  const contextRunAttempt = positiveSafeInteger(context?.runAttempt, 'release context run attempt');
  const terminalRunAttempt = positiveSafeInteger(readback?.terminalRunAttempt, 'terminal readback run attempt');
  const target = exactCommit(context?.commit);
  if (
    readback?.schemaVersion !== 2
    || readback.tag !== context.tag
    || readback.commit !== target
    || String(readback.runId) !== runId
    || readback.terminalWorkflowVerified !== true
    || readback.releaseNotesState !== 'finalized'
    || readback.siteInstallerManifest !== 'installer-manifest.json'
    || typeof readback.releaseCurrentnessVerifiedAt !== 'string'
    || Number.isNaN(Date.parse(readback.releaseCurrentnessVerifiedAt))
  ) {
    throw new TypeError('Terminal release readback is incomplete or disagrees with the release context.');
  }
  const receipt = {
    schemaVersion: 1,
    repository: expectedRepository,
    runId,
    contextRunAttempt,
    terminalRunAttempt,
    tag: context.tag,
    target,
    version: context.version,
    files: transferInputNames.map((file) => {
      const bytes = exactFiles.get(file);
      return { file, bytes: bytes.length, sha256: sha256(bytes) };
    })
  };
  validateTerminalTransferReceipt(receipt, exactFiles);
  return receipt;
}

function git(arguments_, options = {}) {
  return execFileSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: options.binary ? null : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  });
}

function assertCleanCandidate(repository, commit) {
  const head = git(['rev-parse', 'HEAD']).trim();
  if (head !== commit) throw new TypeError('Post-run finalization checkout does not match the exact candidate commit.');
  const status = git(['status', '--porcelain=v1', '--untracked-files=all']);
  if (status.trim()) throw new TypeError(`Post-run finalization requires a clean candidate checkout. Git status reported:\n${status.trim()}`);
  const origin = git(['remote', 'get-url', 'origin']).trim();
  const expectedOrigin = `https://github.com/${repository}.git`;
  if (origin !== expectedOrigin) throw new TypeError('Post-run finalization origin does not match the exact repository identity.');
  return { head, status, origin };
}

function assertGeneratedPathsAbsent(paths) {
  for (const value of paths) {
    if (fs.existsSync(value)) throw new TypeError(`Post-run generated destination must not already exist: ${value}`);
  }
}

function readFileMap(directory, names) {
  return new Map(names.map((name) => {
    const target = path.join(directory, name);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new TypeError(`Required post-run file is missing: ${name}`);
    return [name, fs.readFileSync(target)];
  }));
}

function writeTerminalTransfer(destination, sourceFiles, receipt) {
  const destinationPath = path.resolve(destination);
  const expected = path.join(repositoryRoot, 'dist', 'terminal-transfer');
  if (destinationPath !== expected || fs.existsSync(destinationPath)) {
    throw new TypeError('Terminal transfer may use only the absent fixed dist/terminal-transfer destination.');
  }
  const stage = `${destinationPath}.${process.pid}.${crypto.randomUUID()}.stage`;
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.mkdirSync(stage);
  try {
    for (const name of transferInputNames) fs.writeFileSync(path.join(stage, name), sourceFiles.get(name), { flag: 'wx' });
    atomicWriteFileSync(path.join(stage, 'terminal-transfer-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    validateTerminalTransferReceipt(
      JSON.parse(fs.readFileSync(path.join(stage, 'terminal-transfer-receipt.json'), 'utf8')),
      readFileMap(stage, transferInputNames)
    );
    fs.renameSync(stage, destinationPath);
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  }
  return destinationPath;
}

function valueAfter(arguments_, name) {
  const index = arguments_.indexOf(name);
  if (index < 0) return null;
  if (!arguments_[index + 1] || arguments_[index + 1].startsWith('--')) throw new TypeError(`${name} requires a value.`);
  return arguments_[index + 1];
}

function parseArguments(arguments_) {
  const allowed = new Set(['--repository', '--run-id', '--commit']);
  for (let index = 0; index < arguments_.length; index += 2) {
    if (!allowed.has(arguments_[index]) || !arguments_[index + 1]) throw new TypeError('Usage: node finalize-run.mjs --repository <owner/repository> --run-id <id> --commit <sha>.');
  }
  return {
    repository: exactRepository(valueAfter(arguments_, '--repository')),
    runId: exactRunId(valueAfter(arguments_, '--run-id')),
    commit: exactCommit(valueAfter(arguments_, '--commit'))
  };
}

export function finalizeTerminalRun({ repository, runId, commit }) {
  const identity = {
    repository: exactRepository(repository),
    runId: exactRunId(runId),
    commit: exactCommit(commit)
  };
  assertCleanCandidate(identity.repository, identity.commit);
  const workRoot = path.join(repositoryRoot, 'dist', 'post-run-finalization');
  const stagingRoot = path.join(repositoryRoot, 'dist', 'release-assets');
  const transferRoot = path.join(repositoryRoot, 'dist', 'terminal-transfer');
  assertGeneratedPathsAbsent([workRoot, stagingRoot, transferRoot]);

  const transfersRoot = path.join(workRoot, 'transfers');
  downloadRunProducts(identity.repository, identity.runId, transfersRoot);
  const windowsRoot = path.join(transfersRoot, 'windows');
  const containerRoot = path.join(transfersRoot, 'container');
  const contextPath = path.join(windowsRoot, 'release-context.json');
  const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  validateRunContext(context, { runId: identity.runId, commit: identity.commit });
  const run = ghJson(['api', `repos/${identity.repository}/actions/runs/${identity.runId}`]);
  const postRunIdentity = validatePostRunIdentity({ ...identity, run, context });

  const releaseRoot = path.join(workRoot, 'release');
  const durableContextPath = path.join(releaseRoot, 'release-context.json');
  atomicWriteFileSync(durableContextPath, fs.readFileSync(contextPath));
  const products = validateTransferredProducts(windowsRoot, containerRoot, context);
  const trustedRecord = trustedProductValidationRecord(windowsRoot, containerRoot, context, products);
  const trustedPath = path.join(releaseRoot, 'trusted-product-validation.json');
  writeTrustedProductValidation(trustedPath, trustedRecord);

  stageReleaseFiles(windowsRoot, containerRoot, stagingRoot);
  const lineCount = countRepository({ root: repositoryRoot, commit: identity.commit });
  const lineCountMarkdown = renderMarkdown(lineCount);
  const lineCountPath = path.join(stagingRoot, 'line-count.md');
  atomicWriteFileSync(lineCountPath, lineCountMarkdown, 'utf8');
  atomicWriteFileSync(path.join(stagingRoot, 'line-count.json'), `${JSON.stringify(lineCount, null, 2)}\n`, 'utf8');

  const finalized = finalizeRelease({
    stagingDirectory: stagingRoot,
    contextPath: durableContextPath,
    lineCountPath,
    repository: identity.repository,
    runId: identity.runId,
    requireTerminal: true,
    outputDirectory: releaseRoot
  });
  const local = verifyLocalReleaseFiles(stagingRoot);
  const reread = releaseInventory(identity.repository, context.tag);
  if (reread.length !== 1 || reread[0].id !== finalized.release.id || reread[0].body !== finalized.release.body) {
    throw new Error('Independent terminal release readback disagrees with the finalized release record.');
  }
  verifyServerAssets(identity.repository, reread[0], local.records);
  if (targetCommit(identity.repository, context.tag) !== identity.commit) {
    throw new Error('Independent terminal tag readback disagrees with the candidate commit.');
  }
  const currentness = releaseReadbackWithServerDate(identity.repository, finalized.release.id);
  if (currentness.release.body !== finalized.release.body || currentness.release.tag_name !== context.tag || currentness.release.target_commitish !== identity.commit) {
    throw new Error('Final release-currentness readback disagrees with the terminal release identity or notes.');
  }
  if (Date.parse(currentness.serverDate) < Date.parse(finalized.record.workflowCompletedAt)) {
    throw new Error('Final release-currentness verification predates the exact terminal workflow completion.');
  }
  finalized.record.releaseCurrentnessVerifiedAt = currentness.serverDate;
  atomicWriteFileSync(path.join(releaseRoot, 'release-readback.json'), `${JSON.stringify(finalized.record, null, 2)}\n`, 'utf8');

  const sourceFiles = readFileMap(releaseRoot, transferInputNames);
  const receipt = buildTerminalTransferReceipt({
    repository: identity.repository,
    context,
    readback: finalized.record,
    files: sourceFiles
  });
  writeTerminalTransfer(transferRoot, sourceFiles, receipt);
  const readbackFiles = readFileMap(transferRoot, transferInputNames);
  const receiptReadback = JSON.parse(fs.readFileSync(path.join(transferRoot, 'terminal-transfer-receipt.json'), 'utf8'));
  validateTerminalTransferReceipt(receiptReadback, readbackFiles);
  assertCleanCandidate(identity.repository, identity.commit);
  return {
    ...postRunIdentity,
    releaseId: finalized.release.id,
    releaseCurrentnessVerifiedAt: finalized.record.releaseCurrentnessVerifiedAt,
    terminalTransfer: path.relative(repositoryRoot, transferRoot).replace(/\\/g, '/'),
    receipt: receiptReadback
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = finalizeTerminalRun(parseArguments(process.argv.slice(2)));
  process.stdout.write(`Finalized ${result.tag} from ${result.commit} after terminal run ${result.runId} attempt ${result.runAttempt}.\n`);
  process.stdout.write(`Terminal transfer: ${result.terminalTransfer}.\n`);
}
