import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { atomicWriteFileSync } from './atomic-file.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function trackedSnapshot(paths, readBytes) {
  const seen = new Set();
  const files = [...paths].map((rawPath) => String(rawPath).replace(/\\/g, '/')).sort().map((relativePath) => {
    if (!relativePath || relativePath.startsWith('/') || relativePath.includes('\0') || path.posix.normalize(relativePath) !== relativePath || seen.has(relativePath)) {
      throw new TypeError(`Tracked source path is unsafe or duplicated: ${relativePath}`);
    }
    seen.add(relativePath);
    const bytes = Buffer.from(readBytes(relativePath));
    return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const inventorySha256 = sha256(Buffer.from(`${JSON.stringify(files)}\n`, 'utf8'));
  return { files, inventorySha256 };
}

export function assertTrackedSnapshot(before, after) {
  if (!before || !after || before.inventorySha256 !== after.inventorySha256 || JSON.stringify(before.files) !== JSON.stringify(after.files)) {
    throw new TypeError('Packaging changed, removed, or added tracked source bytes.');
  }
  return true;
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  }).trim();
}

function currentSnapshot() {
  const paths = execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  }).toString('utf8').split('\0').filter(Boolean);
  return {
    schemaVersion: 1,
    commit: git('rev-parse', 'HEAD'),
    ...trackedSnapshot(paths, (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath)))
  };
}

export function captureTrackedSource(receiptPath) {
  const snapshot = currentSnapshot();
  atomicWriteFileSync(receiptPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return snapshot;
}

export function verifyTrackedSource(receiptPath) {
  const before = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const after = currentSnapshot();
  if (before.schemaVersion !== 1 || before.commit !== after.commit) throw new TypeError('Source-preservation receipt does not match the checked-out commit.');
  assertTrackedSnapshot(before, after);
  atomicWriteFileSync(receiptPath, `${JSON.stringify({
    ...before,
    verified: true,
    verifiedInventorySha256: after.inventorySha256,
    verifiedFileCount: after.files.length
  }, null, 2)}\n`, 'utf8');
  return after;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const mode = process.argv[2];
  const receiptPath = path.resolve(repositoryRoot, process.argv[3] || 'dist/release/source-preservation.json');
  if (mode === '--capture') captureTrackedSource(receiptPath);
  else if (mode === '--verify') verifyTrackedSource(receiptPath);
  else throw new TypeError('Source-preservation mode must be --capture or --verify.');
  process.stdout.write(`${mode === '--capture' ? 'Captured' : 'Verified'} tracked source preservation at ${path.relative(repositoryRoot, receiptPath)}.\n`);
}
