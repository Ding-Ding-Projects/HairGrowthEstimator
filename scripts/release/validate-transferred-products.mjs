import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInstallerDirectory } from '../core/validate-installer.mjs';
import { candidateBuildInputInventory, validateBaseManifestProof } from './build-container.mjs';
import { validateContainerArchive } from './container-contract.mjs';
import { assertMatchingReleaseIdentity, releaseIdentitySha256 } from './release-identity.mjs';
import { safeReleaseBasename } from './stage-release-files.mjs';
import { atomicWriteFileSync } from './atomic-file.mjs';
import { expectedReleaseMetadata } from './source-binding.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function candidateMetadata(context) {
  const bytes = execFileSync('git', ['show', context.commit + ':app/release-metadata.json'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  return expectedReleaseMetadata(JSON.parse(bytes), context);
}

export function assertCanonicalContainerManifest(transferred, canonical) {
  if (
    transferred.baseImage !== canonical.baseImage
    || transferred.baseImageIndexDigest !== canonical.baseImageIndexDigest
    || transferred.baseImageManifestDigest !== canonical.baseImageManifestDigest
    || transferred.platform !== canonical.platform
    || transferred.archive?.file !== canonical.ociArchive
    || transferred.archive?.format !== canonical.archiveFormat
    || JSON.stringify(transferred.runtime) !== JSON.stringify(canonical.runtime)
    || JSON.stringify((transferred.buildInputs || []).map((item) => item.path)) !== JSON.stringify(canonical.buildInputs)
  ) {
    throw new TypeError('Transferred container manifest disagrees with the canonical candidate container metadata.');
  }
  return true;
}

export function validateTransferredProducts(windowsDirectory, containerDirectory, context) {
  const windowsRoot = path.resolve(windowsDirectory);
  const containerRoot = path.resolve(containerDirectory);
  const transferredInstaller = JSON.parse(fs.readFileSync(path.join(windowsRoot, 'release-manifest.json'), 'utf8'));
  const recomputedInstaller = validateInstallerDirectory(windowsRoot, { context });
  assert.deepEqual(transferredInstaller, recomputedInstaller, 'Transferred installer manifest disagrees with independent validation.');

  const transferredContainer = JSON.parse(fs.readFileSync(path.join(containerRoot, 'container-manifest.json'), 'utf8'));
  const canonicalMetadata = candidateMetadata(context);
  const canonicalContainer = canonicalMetadata.container;
  const archiveName = safeReleaseBasename(transferredContainer.archive?.file);
  assertCanonicalContainerManifest(transferredContainer, canonicalContainer);
  validateBaseManifestProof(transferredContainer.baseProof, {
    indexDigest: canonicalContainer.baseImageIndexDigest,
    manifestDigest: canonicalContainer.baseImageManifestDigest
  });
  const archivePath = path.join(containerRoot, archiveName);
  const recomputedContainer = validateContainerArchive(archivePath, {
    version: context.version,
    commit: context.commit,
    createdAt: context.createdAt,
    baseIndexDigest: canonicalContainer.baseImageIndexDigest,
    baseManifestDigest: canonicalContainer.baseImageManifestDigest
  });
  if (transferredContainer.version !== context.version || transferredContainer.sourceCommit !== context.commit || transferredContainer.createdAt !== context.createdAt || transferredContainer.sourceDateEpoch !== String(context.commitEpoch)) {
    throw new TypeError('Transferred container manifest disagrees with exact candidate provenance.');
  }
  if (transferredContainer.archive.bytes !== recomputedContainer.archiveBytes || transferredContainer.archive.sha256 !== recomputedContainer.archiveSha256 || transferredContainer.archive.sha256 !== sha256File(archivePath)) {
    throw new TypeError('Transferred container archive record disagrees with independently parsed bytes.');
  }
  for (const field of ['platform', 'imageDigest', 'configDigest']) {
    if (transferredContainer[field] !== recomputedContainer[field]) throw new TypeError(`Transferred container manifest disagrees on ${field}.`);
  }
  if (transferredContainer.layerCount !== recomputedContainer.layers || JSON.stringify(transferredContainer.sourceBinding) !== JSON.stringify(recomputedContainer.sourceBinding)) {
    throw new TypeError('Transferred container descriptor or source binding disagrees with independent validation.');
  }
  assert.deepEqual(transferredContainer.buildInputs, candidateBuildInputInventory(canonicalContainer.buildInputs, context.commit));
  if (transferredContainer.reproducibility?.buildCount !== 2 || transferredContainer.reproducibility.archiveSha256 !== recomputedContainer.archiveSha256) {
    throw new TypeError('Transferred container reproducibility evidence is incomplete.');
  }
  assertMatchingReleaseIdentity(context, transferredInstaller.releaseIdentity, transferredContainer.releaseIdentity);
  if (transferredInstaller.releaseIdentitySha256 !== releaseIdentitySha256(context) || transferredContainer.releaseIdentitySha256 !== releaseIdentitySha256(context)) {
    throw new TypeError('Transferred release identity digest disagrees with the publication context.');
  }
  return { installer: recomputedInstaller, container: recomputedContainer };
}

export function trustedProductValidationRecord(windowsDirectory, containerDirectory, context, result) {
  const windowsRoot = path.resolve(windowsDirectory);
  const containerRoot = path.resolve(containerDirectory);
  if (!result?.installer?.embedded?.sourceBinding || !result?.container?.sourceBinding) {
    throw new TypeError('Trusted product validation requires complete independently recomputed source bindings.');
  }
  return {
    schemaVersion: 1,
    sourceCommit: context.commit,
    version: context.version,
    installerManifestSha256: sha256File(path.join(windowsRoot, 'release-manifest.json')),
    containerManifestSha256: sha256File(path.join(containerRoot, 'container-manifest.json')),
    installerSourceBinding: result.installer.embedded.sourceBinding,
    containerSourceBinding: result.container.sourceBinding
  };
}

export function writeTrustedProductValidation(target, record) {
  atomicWriteFileSync(path.resolve(target), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const windowsDirectory = process.argv[2] || path.join(repositoryRoot, 'dist', 'transfers', 'windows');
  const containerDirectory = process.argv[3] || path.join(repositoryRoot, 'dist', 'transfers', 'container');
  const contextPath = process.argv[4] || path.join(repositoryRoot, 'dist', 'release', 'release-context.json');
  const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
  const result = validateTransferredProducts(windowsDirectory, containerDirectory, context);
  const evidencePath = path.join(repositoryRoot, 'dist', 'release', 'trusted-product-validation.json');
  writeTrustedProductValidation(evidencePath, trustedProductValidationRecord(windowsDirectory, containerDirectory, context, result));
  process.stdout.write('Independently revalidated transferred Squirrel and OCI bytes against the candidate Git blobs.\n');
}
