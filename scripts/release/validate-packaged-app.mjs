import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync } from './atomic-file.mjs';
import { extractFile } from '@electron/asar';

import { readPeSecurityDirectory } from '../core/validate-installer.mjs';
import { validateAsarSourceBinding, validateServerDirectorySourceBinding } from './source-binding.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');
const require = createRequire(import.meta.url);
const { assertEmbeddedIcon } = require('./apply-executable-icon.cjs');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function asJson(buffer, label) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new TypeError(`Packaged ${label} is not valid JSON.`);
  }
}

export function packagedReceiptLayout(directory) {
  const packageRoot = path.resolve(directory);
  return Object.freeze({
    packageRoot,
    executablePath: path.join(packageRoot, 'Hair Growth Estimator.exe'),
    appAsarPath: path.join(packageRoot, 'resources', 'app.asar'),
    stagedProvenancePath: path.join(packageRoot, 'dist', 'package-input', 'app', 'provenance.json'),
    sourcePreservationPath: path.join(packageRoot, 'dist', 'release', 'source-preservation-build.json'),
    receiptPath: path.join(packageRoot, 'dist', 'package', 'packaged-app-manifest.json')
  });
}

export function packageRelativePath(directory, target, label = 'packaged receipt path') {
  const packageRoot = path.resolve(directory);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(packageRoot, resolvedTarget);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new TypeError(`${label} must be a strict child of the packaged application directory.`);
  }
  return relative.replace(/\\/g, '/');
}

export function validatePackagedApplication(directory, expected = {}) {
  const resolved = path.resolve(directory);
  const layout = packagedReceiptLayout(resolved);
  const executablePath = layout.executablePath;
  const asarPath = layout.appAsarPath;
  if (!fs.existsSync(executablePath) || !fs.existsSync(asarPath)) throw new TypeError('Packaged application is missing its executable or resources/app.asar.');
  const executable = fs.readFileSync(executablePath);
  const asar = fs.readFileSync(asarPath);
  if (executable.length < 1024 * 1024 || asar.length < 1024) throw new TypeError('Packaged executable or app.asar is implausibly small.');
  if (readPeSecurityDirectory(executable).size !== 0) throw new TypeError('Signing policy violated: packaged executable contains an Authenticode certificate table.');

  const packageJson = asJson(extractFile(asarPath, 'package.json'), 'package.json');
  const provenance = asJson(extractFile(asarPath, 'app/provenance.json'), 'provenance');
  const packagedProvenance = Buffer.from(extractFile(asarPath, 'app/provenance.json'));
  const sourceProvenancePath = path.join(repositoryRoot, 'dist', 'package-input', 'app', 'provenance.json');
  if (!fs.existsSync(sourceProvenancePath) || !packagedProvenance.equals(fs.readFileSync(sourceProvenancePath))) {
    throw new TypeError('Packaged provenance does not match the output-only staged provenance bytes.');
  }
  const sourcePreservationPath = path.join(repositoryRoot, 'dist', 'release', 'source-preservation-build.json');
  if (!fs.existsSync(sourcePreservationPath)) throw new TypeError('Packaged application is missing its tracked-source preservation receipt.');
  const preservationBytes = fs.readFileSync(sourcePreservationPath);
  const preservation = JSON.parse(preservationBytes.toString('utf8'));
  if (preservation.verified !== true || preservation.commit !== (expected.commit || provenance.commit) || preservation.verifiedInventorySha256 !== preservation.inventorySha256 || preservation.verifiedFileCount !== preservation.files?.length) {
    throw new TypeError('Tracked-source preservation receipt is incomplete or bound to another candidate.');
  }
  const iconManifest = asJson(extractFile(asarPath, 'assets/icon-manifest.json'), 'icon manifest');
  const packagedIcon = extractFile(asarPath, 'assets/app-icon.ico');
  const master = extractFile(asarPath, 'assets/logo-master.svg');
  const version = expected.version || packageJson.version;
  const commit = expected.commit || provenance.commit;
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[0-9a-f]{40}$/.test(commit)) throw new TypeError('Packaged application requires exact version and commit expectations.');
  if (packageJson.version !== version || provenance.version !== version || provenance.commit !== commit) {
    throw new TypeError('Packaged package.json and provenance do not match the intended version and commit.');
  }
  if (iconManifest.schemaVersion !== 2 || iconManifest.masterSha256 !== sha256(master) || iconManifest.ico?.sha256 !== sha256(packagedIcon)) {
    throw new TypeError('Packaged icon outputs are not bound to the SVG master and icon manifest.');
  }
  atomicWriteFileSync(layout.stagedProvenancePath, packagedProvenance);
  atomicWriteFileSync(layout.sourcePreservationPath, preservationBytes);
  if (!packagedProvenance.equals(fs.readFileSync(layout.stagedProvenancePath)) || !preservationBytes.equals(fs.readFileSync(layout.sourcePreservationPath))) {
    throw new TypeError('Packaged evidence proofs did not round-trip inside the packaged application directory.');
  }
  const executableIconRecords = assertEmbeddedIcon(executable, packagedIcon);
  const sourceBinding = {
    appAsar: validateAsarSourceBinding(asarPath, expected),
    server: validateServerDirectorySourceBinding(path.join(resolved, 'resources', 'server'), commit)
  };
  return {
    schemaVersion: 2,
    version,
    sourceCommit: commit,
    directory: resolved,
    executable: {
      file: path.basename(executablePath),
      path: packageRelativePath(resolved, executablePath, 'packaged executable path'),
      bytes: executable.length,
      sha256: sha256(executable),
      signing: 'NotSigned'
    },
    appAsar: {
      file: 'resources/app.asar',
      path: packageRelativePath(resolved, asarPath, 'packaged app.asar path'),
      bytes: asar.length,
      sha256: sha256(asar)
    },
    provenance: {
      logicalPath: 'app/provenance.json',
      stagedPath: packageRelativePath(resolved, layout.stagedProvenancePath, 'staged provenance path'),
      stagedSha256: sha256(packagedProvenance),
      packagedSha256: sha256(packagedProvenance)
    },
    sourcePreservation: {
      receipt: packageRelativePath(resolved, layout.sourcePreservationPath, 'source preservation receipt path'),
      candidateCommit: preservation.commit,
      trackedFileCount: preservation.verifiedFileCount,
      inventorySha256: preservation.verifiedInventorySha256,
      verified: true
    },
    icon: {
      masterSha256: iconManifest.masterSha256,
      icoSha256: iconManifest.ico.sha256,
      sizes: iconManifest.ico.sizes,
      executableResourceCount: executableIconRecords.length
    },
    sourceBinding
  };
}

function atomicJsonWrite(target, value) {
  atomicWriteFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const directory = process.argv[2] || path.join(repositoryRoot, 'dist', 'win-unpacked');
  const context = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'dist', 'release', 'release-context.json'), 'utf8'));
  const result = validatePackagedApplication(directory, context);
  const layout = packagedReceiptLayout(directory);
  atomicJsonWrite(layout.receiptPath, result);
  const canonicalBytes = fs.readFileSync(layout.receiptPath);
  const convenienceManifestPath = path.join(repositoryRoot, 'dist', 'package', 'packaged-app-manifest.json');
  atomicWriteFileSync(convenienceManifestPath, canonicalBytes);
  if (!canonicalBytes.equals(fs.readFileSync(convenienceManifestPath))) {
    throw new TypeError('Convenience packaged receipt mirror does not match the canonical in-package receipt.');
  }
  process.stdout.write(`Validated runnable packaged application at ${path.relative(repositoryRoot, result.directory)}.\n`);
  process.stdout.write(`Executable SHA-256: ${result.executable.sha256}. Signing: ${result.executable.signing}.\n`);
  process.stdout.write(`app.asar SHA-256: ${result.appAsar.sha256}.\n`);
}
