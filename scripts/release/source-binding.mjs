import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractFile, listPackage, statFile } from '@electron/asar';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const legacyIconPattern = /^assets\/(?:app-icon(?:-\d+)?\.png|app-icon\.ico|icon-manifest\.json|logo-master\.svg)$/;
const canonicalIconPattern = /^assets\/icons\/(app-icon(?:-\d+)?\.png|app-icon\.ico|icon-manifest\.json|logo-master\.svg)$/;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function gitBuffer(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024
  });
}

function normalizePath(value) {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function assertExactCommit(commit) {
  if (!/^[0-9a-f]{40}$/.test(commit || '')) throw new TypeError('Source binding requires a full lowercase candidate commit SHA.');
  const resolved = gitBuffer(['rev-parse', `${commit}^{commit}`]).toString('utf8').trim();
  if (resolved !== commit) throw new TypeError('Source binding candidate does not resolve to the exact requested commit.');
  return commit;
}

function treePaths(commit, roots) {
  assertExactCommit(commit);
  const output = gitBuffer(['ls-tree', '-r', '--name-only', '-z', commit, '--', ...roots]);
  return output.toString('utf8').split('\0').filter(Boolean).map(normalizePath).sort();
}

function gitFile(commit, relativePath) {
  return gitBuffer(['show', `${commit}:${relativePath}`]);
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function expectedReleaseMetadata(baseMetadata, context) {
  const metadata = structuredClone(baseMetadata);
  Object.assign(metadata, {
    version: context.version,
    releaseTag: context.tag,
    sourceCommit: context.commit,
    createdAt: context.createdAt,
    catalogCommit: context.catalogCommit,
    catalogBlobSha: context.catalogBlobSha,
    catalogBytes: context.catalogBytes,
    catalogStatus: context.catalogStatus,
    catalogUnavailableReason: context.catalogUnavailableReason,
    codeName: context.codeName,
    catalogRecord: context.catalogRecord,
    catalogSlug: context.catalogSlug,
    publicPhotoUrl: context.publicPhotoUrl,
    publicPhotoAsset: context.publicPhotoAsset
  });
  metadata.container.localTag = `hair-growth-api:${context.version}`;
  metadata.container.ociArchive = context.containerArchive;
  metadata.container.optionalRegistryTag = `ghcr.io/ding-ding-projects/hair-growth-estimator-api:${context.version}`;
  metadata.container.createdAt = context.createdAt;
  metadata.container.sourceCommit = context.commit;
  metadata.container.sourceDateEpoch = String(context.commitEpoch);
  return metadata;
}

export function expectedProvenance(basePackage, context) {
  return {
    schemaVersion: 1,
    packageName: basePackage.name,
    version: context.version,
    commit: context.commit,
    updatedAt: context.createdAt,
    timestampSource: 'git-commit-committer-date',
    platform: 'win32',
    architecture: 'x64',
    signing: 'unsigned'
  };
}

export function expectedAsarFiles(context) {
  assertExactCommit(context.commit);
  const expected = new Map();
  for (const sourcePath of treePaths(context.commit, ['app', 'assets'])) {
    if (sourcePath === 'app/provenance.json' || sourcePath === 'app/release-metadata.json' || legacyIconPattern.test(sourcePath)) continue;
    const canonicalMatch = canonicalIconPattern.exec(sourcePath);
    const packagedPath = canonicalMatch ? `assets/${canonicalMatch[1]}` : sourcePath;
    if (sourcePath.startsWith('assets/icons/') && !canonicalMatch) throw new TypeError(`Unmapped canonical icon source file: ${sourcePath}`);
    if (expected.has(packagedPath)) throw new TypeError(`More than one source maps to packaged path ${packagedPath}.`);
    expected.set(packagedPath, { sourcePath, bytes: gitFile(context.commit, sourcePath) });
  }

  const basePackage = JSON.parse(gitFile(context.commit, 'package.json').toString('utf8'));
  basePackage.version = context.version;
  expected.set('package.json', { sourcePath: 'package.json plus release version', bytes: jsonBytes(basePackage) });
  const baseMetadata = JSON.parse(gitFile(context.commit, 'app/release-metadata.json').toString('utf8'));
  expected.set('app/release-metadata.json', {
    sourcePath: 'app/release-metadata.json plus release context',
    bytes: jsonBytes(expectedReleaseMetadata(baseMetadata, context))
  });
  expected.set('app/provenance.json', {
    sourcePath: 'app/provenance.json generated from candidate commit',
    bytes: jsonBytes(expectedProvenance(basePackage, context))
  });
  return expected;
}

export function sourceInventorySha256(files) {
  if (!Array.isArray(files)) throw new TypeError('Source-binding files must be an array.');
  return sha256(Buffer.from(files.map((item) => `${item.path}\0${item.bytes}\0${item.sha256}\n`).join(''), 'utf8'));
}

export function validateSourceBindingReceipt(binding) {
  const expectedBindingKeys = ['bytes', 'fileCount', 'files', 'inventorySha256'];
  if (!binding || JSON.stringify(Object.keys(binding).sort()) !== JSON.stringify(expectedBindingKeys)) {
    throw new TypeError('Source-binding receipt fields are incomplete or unexpected.');
  }
  if (!Array.isArray(binding.files) || binding.fileCount !== binding.files.length) {
    throw new TypeError('Source-binding file count does not equal the complete record array.');
  }
  if (!Number.isSafeInteger(binding.fileCount) || binding.fileCount < 1) {
    throw new TypeError('Source-binding receipt must contain at least one file.');
  }
  const expectedRecordKeys = ['bytes', 'path', 'sha256', 'source'];
  const paths = [];
  let bytes = 0;
  for (const record of binding.files) {
    if (!record || JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expectedRecordKeys)) {
      throw new TypeError('Source-binding file record fields are incomplete or unexpected.');
    }
    if (typeof record.path !== 'string' || record.path !== normalizePath(record.path) || record.path.split('/').includes('..')) {
      throw new TypeError('Source-binding file record contains an unsafe or noncanonical path.');
    }
    if (typeof record.source !== 'string' || record.source.length === 0 || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || !/^[0-9a-f]{64}$/.test(record.sha256)) {
      throw new TypeError('Source-binding file record contains invalid provenance, byte count, or SHA-256.');
    }
    paths.push(record.path);
    bytes += record.bytes;
  }
  const sortedPaths = [...paths].sort();
  if (new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify(sortedPaths)) {
    throw new TypeError('Source-binding file records must be unique and sorted by packaged path.');
  }
  if (!Number.isSafeInteger(binding.bytes) || binding.bytes < 1 || binding.bytes !== bytes) {
    throw new TypeError('Source-binding byte count does not equal the complete record array.');
  }
  if (!/^[0-9a-f]{64}$/.test(binding.inventorySha256) || binding.inventorySha256 !== sourceInventorySha256(binding.files)) {
    throw new TypeError('Source-binding inventory SHA-256 does not match the canonical record bytes.');
  }
  return true;
}

export function compareBoundFiles(expected, actual, label) {
  const expectedPaths = [...expected.keys()].sort();
  const actualPaths = [...actual.keys()].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    const missing = expectedPaths.filter((item) => !actual.has(item));
    const unexpected = actualPaths.filter((item) => !expected.has(item));
    throw new TypeError(`${label} file set disagrees with the candidate commit. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}.`);
  }
  const files = [];
  let bytes = 0;
  for (const packagedPath of expectedPaths) {
    const expectedRecord = expected.get(packagedPath);
    const actualBytes = actual.get(packagedPath);
    if (!actualBytes.equals(expectedRecord.bytes)) throw new TypeError(`${label} bytes disagree with the candidate Git blob: ${packagedPath}`);
    const digest = sha256(actualBytes);
    bytes += actualBytes.length;
    files.push({ path: packagedPath, source: expectedRecord.sourcePath, bytes: actualBytes.length, sha256: digest });
  }
  const result = { fileCount: files.length, bytes, inventorySha256: sourceInventorySha256(files), files };
  validateSourceBindingReceipt(result);
  return result;
}

function archiveLookupPath(value) {
  return value.replace(/^[\\/]+/, '').split(/[\\/]+/).join(path.sep);
}

export function asarFiles(asarPath) {
  const actual = new Map();
  for (const listed of listPackage(asarPath)) {
    const relativePath = normalizePath(listed);
    const lookupPath = archiveLookupPath(listed);
    const stat = statFile(asarPath, lookupPath);
    if (typeof stat.size !== 'number') continue;
    actual.set(relativePath, Buffer.from(extractFile(asarPath, lookupPath)));
  }
  return actual;
}

export function validateAsarSourceBinding(asarPath, context) {
  return compareBoundFiles(expectedAsarFiles(context), asarFiles(asarPath), 'app.asar');
}

export function expectedServerFiles(commit) {
  const expected = new Map();
  for (const sourcePath of treePaths(commit, ['server'])) {
    const packagedPath = sourcePath.slice('server/'.length);
    expected.set(packagedPath, { sourcePath, bytes: gitFile(commit, sourcePath) });
  }
  return expected;
}

function walkFiles(directory, prefix = '') {
  const actual = new Map();
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [nestedPath, bytes] of walkFiles(absolutePath, relativePath)) actual.set(nestedPath, bytes);
    } else if (entry.isFile()) {
      actual.set(relativePath, fs.readFileSync(absolutePath));
    } else {
      throw new TypeError(`Packaged server contains a non-file entry: ${relativePath}`);
    }
  }
  return actual;
}

export function validateServerDirectorySourceBinding(serverDirectory, commit) {
  return compareBoundFiles(expectedServerFiles(commit), walkFiles(serverDirectory), 'packaged server');
}

export function validateServerZipSourceBinding(entries, asarEntry, commit) {
  const prefix = asarEntry.slice(0, -'resources/app.asar'.length);
  const actual = new Map();
  const serverPrefix = `${prefix}resources/server/`;
  for (const [entryPath, bytes] of entries) {
    if (!entryPath.endsWith('/') && entryPath.startsWith(serverPrefix)) actual.set(entryPath.slice(serverPrefix.length), bytes);
  }
  return compareBoundFiles(expectedServerFiles(commit), actual, 'Squirrel server payload');
}
