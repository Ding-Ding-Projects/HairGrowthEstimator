import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalTar,
  readTarEntries,
  validateContainerArchive,
  validateCurrentContainerSources
} from './container-contract.mjs';
import { atomicWriteFileSync } from './atomic-file.mjs';
import { releaseIdentity, releaseIdentitySha256 } from './release-identity.mjs';
import { expectedReleaseMetadata } from './source-binding.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

function git(...args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
}

function gitBytes(...args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024
  });
}

function atomicJsonWrite(target, value) {
  atomicWriteFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function gitBlobSha1(buffer) {
  return crypto.createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}

export function candidateBuildInputInventory(paths, commit, readCurrent = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath))) {
  if (!Array.isArray(paths) || paths.length === 0 || !/^[0-9a-f]{40}$/.test(commit || '')) {
    throw new TypeError('Container build inputs require a nonempty path inventory and exact candidate commit.');
  }
  if (git('rev-parse', `${commit}^{commit}`) !== commit) throw new TypeError('Container build-input commit does not resolve exactly.');
  const seen = new Set();
  return paths.map((inputPath) => {
    const relativePath = String(inputPath).replace(/\\/g, '/');
    if (!relativePath || relativePath.startsWith('/') || relativePath === '..' || relativePath.startsWith('../') || path.posix.normalize(relativePath) !== relativePath || seen.has(relativePath)) {
      throw new TypeError(`Container build input path is unsafe or duplicated: ${relativePath}`);
    }
    seen.add(relativePath);
    const absolutePath = path.join(repositoryRoot, relativePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) throw new TypeError(`Container build input is missing: ${relativePath}`);
    const committed = gitBytes('show', `${commit}:${relativePath}`);
    const current = Buffer.from(readCurrent(relativePath));
    if (!current.equals(committed)) throw new TypeError(`Container build input bytes disagree with the candidate Git blob: ${relativePath}`);
    return {
      path: relativePath,
      bytes: committed.length,
      sha256: crypto.createHash('sha256').update(committed).digest('hex'),
      gitBlobSha1: gitBlobSha1(committed)
    };
  });
}

export function assertReproducibleContainerBuilds(first, second) {
  const fields = ['archiveSha256', 'imageDigest', 'configDigest'];
  for (const field of fields) {
    if (!first?.[field] || first[field] !== second?.[field]) throw new TypeError(`Repeated OCI builds disagree on ${field}.`);
  }
  if (JSON.stringify(first.sourceBinding) !== JSON.stringify(second.sourceBinding)) throw new TypeError('Repeated OCI builds disagree on candidate source binding.');
  return true;
}

function sha256Digest(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function parseJsonBytes(bytes, label, minimumBytes = 2) {
  const raw = Buffer.from(bytes);
  if (raw.length < minimumBytes || raw.length > 16 * 1024 * 1024) throw new TypeError(`${label} byte length is outside the supported range.`);
  const text = raw.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(raw)) throw new TypeError(`${label} is not valid UTF-8.`);
  try {
    return { raw, value: JSON.parse(text) };
  } catch {
    throw new TypeError(`${label} is not valid JSON.`);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertDescriptor(descriptor, label, mediaTypes) {
  if (!descriptor || !/^sha256:[0-9a-f]{64}$/.test(descriptor.digest || '') || !Number.isSafeInteger(descriptor.size) || descriptor.size < 1 || !mediaTypes.includes(descriptor.mediaType)) {
    throw new TypeError(`${label} is invalid or unsupported.`);
  }
}

export function deriveBaseManifestProof(rawIndexBytes, rawManifestBytes, rawConfigBytes, expected) {
  const { raw: rawIndex, value: index } = parseJsonBytes(rawIndexBytes, 'Raw base index', 100);
  const indexDigest = sha256Digest(rawIndex);
  if (indexDigest !== expected.indexDigest) throw new TypeError('Raw base index bytes do not match the immutable base index digest.');
  const candidates = (index.manifests || []).filter((descriptor) => descriptor.platform?.os === 'linux' && descriptor.platform?.architecture === 'amd64' && !descriptor.platform?.variant);
  if (candidates.length !== 1) throw new TypeError('Base index must contain exactly one linux/amd64 manifest descriptor.');
  const descriptor = candidates[0];
  assertDescriptor(descriptor, 'Derived linux/amd64 base manifest descriptor', [
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json'
  ]);
  if (descriptor.digest !== expected.manifestDigest) throw new TypeError('Derived linux/amd64 base manifest descriptor disagrees with the declared base identity.');

  const { raw: rawManifest, value: manifest } = parseJsonBytes(rawManifestBytes, 'Raw selected base manifest', 100);
  const manifestDigest = sha256Digest(rawManifest);
  if (manifestDigest !== descriptor.digest || rawManifest.length !== descriptor.size) {
    throw new TypeError('Raw selected base manifest bytes disagree with the selected base manifest digest or size.');
  }
  if (manifest.schemaVersion !== 2) throw new TypeError('Selected base manifest schema is unsupported.');
  assertDescriptor(manifest.config, 'Selected base config descriptor', [
    'application/vnd.oci.image.config.v1+json',
    'application/vnd.docker.container.image.v1+json'
  ]);
  if (!Array.isArray(manifest.layers) || manifest.layers.length === 0) throw new TypeError('Selected base manifest has no layer descriptors.');
  for (const layer of manifest.layers) {
    assertDescriptor(layer, 'Selected base layer descriptor', [
      'application/vnd.oci.image.layer.v1.tar+gzip',
      'application/vnd.docker.image.rootfs.diff.tar.gzip',
      'application/vnd.oci.image.layer.v1.tar'
    ]);
  }

  const { raw: rawProjection, value: projection } = parseJsonBytes(rawConfigBytes, 'Raw selected base config', 50);
  if (sha256Digest(rawProjection) !== manifest.config.digest || rawProjection.length !== manifest.config.size) {
    throw new TypeError('Raw selected base config bytes disagree with the selected config descriptor digest or size.');
  }
  if (projection.os !== 'linux' || projection.architecture !== 'amd64' || projection.rootfs?.type !== 'layers') {
    throw new TypeError('Selected base config projection platform or rootfs type is unsupported.');
  }
  const rootfsDiffIds = projection.rootfs.diff_ids;
  if (!Array.isArray(rootfsDiffIds) || rootfsDiffIds.length !== manifest.layers.length || rootfsDiffIds.some((digest) => !/^sha256:[0-9a-f]{64}$/.test(digest || ''))) {
    throw new TypeError('Selected base config projection rootfs diff_ids disagree with the selected layer count.');
  }
  const inheritedEntrypoint = projection.config?.Entrypoint ?? null;
  if (inheritedEntrypoint !== null && (!Array.isArray(inheritedEntrypoint) || inheritedEntrypoint.length === 0 || inheritedEntrypoint.some((value) => typeof value !== 'string' || !value))) {
    throw new TypeError('Selected base config projection Entrypoint is invalid.');
  }

  return {
    source: 'docker-buildx-imagetools-inspect',
    indexDigest,
    rawIndexBytes: rawIndex.length,
    rawIndexBase64: rawIndex.toString('base64'),
    selectedDescriptor: cloneJson(descriptor),
    selectedManifest: {
      source: 'docker-buildx-imagetools-inspect-raw',
      digest: manifestDigest,
      rawBytes: rawManifest.length,
      rawSha256: manifestDigest,
      rawBase64: rawManifest.toString('base64'),
      configDescriptor: cloneJson(manifest.config),
      layerDescriptors: cloneJson(manifest.layers)
    },
    selectedConfigProjection: {
      source: 'docker-buildx-imagetools-inspect-raw-config',
      rawBytes: rawProjection.length,
      rawSha256: sha256Digest(rawProjection),
      rawBase64: rawProjection.toString('base64'),
      rootfsDiffIds: [...rootfsDiffIds],
      inheritedEntrypoint: cloneJson(inheritedEntrypoint)
    }
  };
}

function decodeRetainedBytes(base64, expectedBytes, label) {
  if (typeof base64 !== 'string' || !Number.isSafeInteger(expectedBytes)) throw new TypeError(`${label} is incomplete.`);
  const raw = Buffer.from(base64, 'base64');
  if (raw.toString('base64') !== base64 || raw.length !== expectedBytes) throw new TypeError(`${label} bytes are not canonical base64.`);
  return raw;
}

export function validateBaseManifestProof(proof, expected) {
  if (proof?.source !== 'docker-buildx-imagetools-inspect' || proof.selectedManifest?.source !== 'docker-buildx-imagetools-inspect-raw' || proof.selectedConfigProjection?.source !== 'docker-buildx-imagetools-inspect-raw-config') {
    throw new TypeError('Retained base ancestry proof is incomplete.');
  }
  const rawIndex = decodeRetainedBytes(proof.rawIndexBase64, proof.rawIndexBytes, 'Retained base index');
  const rawManifest = decodeRetainedBytes(proof.selectedManifest.rawBase64, proof.selectedManifest.rawBytes, 'Retained selected base manifest');
  const configProjection = decodeRetainedBytes(proof.selectedConfigProjection.rawBase64, proof.selectedConfigProjection.rawBytes, 'Retained selected base config projection');
  const derived = deriveBaseManifestProof(rawIndex, rawManifest, configProjection, expected);
  if (JSON.stringify(proof) !== JSON.stringify(derived)) throw new TypeError('Retained base ancestry proof disagrees with its independently derived manifest and config projection.');
  return derived;
}

function runContainerBuild({ archivePath, buildMetadataPath, version, commit, createdAt, commitEpoch, container, baseProof }) {
  fs.rmSync(archivePath, { force: true });
  fs.rmSync(buildMetadataPath, { force: true });
  const output = `type=oci,dest=${archivePath},oci-mediatypes=true,rewrite-timestamp=true`;
  const args = [
    'buildx', 'build',
    '--platform', 'linux/amd64',
    '--file', path.join(repositoryRoot, 'Dockerfile'),
    '--build-arg', `BUILD_VERSION=${version}`,
    '--build-arg', `BUILD_REVISION=${commit}`,
    '--build-arg', `BUILD_CREATED_AT=${createdAt}`,
    '--build-arg', `BASE_IMAGE_INDEX_DIGEST=${container.baseImageIndexDigest}`,
    '--build-arg', `BASE_IMAGE_MANIFEST_DIGEST=${container.baseImageManifestDigest}`,
    '--build-arg', `SOURCE_DATE_EPOCH=${commitEpoch}`,
    '--no-cache',
    '--provenance=false',
    '--sbom=false',
    '--metadata-file', buildMetadataPath,
    '--output', output,
    path.join(repositoryRoot, 'server')
  ];
  execFileSync('docker', args, {
    cwd: repositoryRoot,
    env: { ...process.env, SOURCE_DATE_EPOCH: String(commitEpoch) },
    stdio: 'inherit',
    windowsHide: true
  });
  if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size < 1024) throw new Error('Container build did not create a usable OCI archive.');
  atomicWriteFileSync(archivePath, canonicalTar(readTarEntries(fs.readFileSync(archivePath)), commitEpoch));
  return validateContainerArchive(archivePath, {
    version,
    commit,
    createdAt,
    baseIndexDigest: container.baseImageIndexDigest,
    baseManifestDigest: container.baseImageManifestDigest,
    baseProof
  });
}

export function buildContainer() {
  validateCurrentContainerSources();
  const context = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'dist', 'release', 'release-context.json'), 'utf8'));
  const baseMetadata = JSON.parse(gitBytes('show', `${context.commit}:app/release-metadata.json`).toString('utf8'));
  const metadata = expectedReleaseMetadata(baseMetadata, context);
  const container = metadata.container;
  const baseIndexBytes = execFileSync('docker', ['buildx', 'imagetools', 'inspect', '--raw', container.baseImage], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  const selectedBaseReference = `${container.baseImage.split('@')[0]}@${container.baseImageManifestDigest}`;
  const baseManifestBytes = execFileSync('docker', ['buildx', 'imagetools', 'inspect', '--raw', selectedBaseReference], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  const selectedManifestDocument = JSON.parse(baseManifestBytes.toString('utf8'));
  const selectedConfigReference = `${container.baseImage.split('@')[0]}@${selectedManifestDocument.config.digest}`;
  const configProjectionBytes = execFileSync('docker', ['buildx', 'imagetools', 'inspect', '--raw', selectedConfigReference], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  const baseProof = deriveBaseManifestProof(baseIndexBytes, baseManifestBytes, configProjectionBytes, {
    indexDigest: container.baseImageIndexDigest,
    manifestDigest: container.baseImageManifestDigest
  });
  const derivedContainer = { ...container, baseImageManifestDigest: baseProof.selectedDescriptor.digest };
  const commit = metadata.sourceCommit || git('rev-parse', 'HEAD');
  const version = metadata.version;
  const commitEpoch = Number(git('show', '-s', '--format=%ct', commit));
  const createdAt = metadata.createdAt || new Date(commitEpoch * 1000).toISOString();
  if (!/^[0-9a-f]{40}$/.test(commit) || !/^\d+\.\d+\.\d+$/.test(version) || !Number.isSafeInteger(commitEpoch)) {
    throw new TypeError('Container build requires exact version and commit provenance.');
  }

  const outputDirectory = path.join(repositoryRoot, 'dist', 'container');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const archivePath = path.join(outputDirectory, container.ociArchive);
  const proofPaths = [1, 2].map((number) => ({
    archivePath: path.join(outputDirectory, `.repro-${number}.oci.tar`),
    buildMetadataPath: path.join(outputDirectory, `.repro-${number}.buildx.json`)
  }));
  const builds = proofPaths.map((paths) => ({
    paths,
    validated: runContainerBuild({ ...paths, version, commit, createdAt, commitEpoch, container: derivedContainer, baseProof })
  }));
  assertReproducibleContainerBuilds(builds[0].validated, builds[1].validated);
  atomicWriteFileSync(archivePath, fs.readFileSync(builds[0].paths.archivePath));
  const validated = validateContainerArchive(archivePath, {
    version,
    commit,
    createdAt,
    baseIndexDigest: derivedContainer.baseImageIndexDigest,
    baseManifestDigest: derivedContainer.baseImageManifestDigest,
    baseProof
  });
  for (const { paths } of builds) {
    fs.rmSync(paths.archivePath, { force: true });
    fs.rmSync(paths.buildMetadataPath, { force: true });
  }
  const manifest = {
    schemaVersion: 2,
    version,
    sourceCommit: commit,
    createdAt,
    sourceDateEpoch: String(commitEpoch),
    baseImage: container.baseImage,
    baseImageIndexDigest: container.baseImageIndexDigest,
    baseImageManifestDigest: derivedContainer.baseImageManifestDigest,
    baseProof,
    platform: validated.platform,
    imageDigest: validated.imageDigest,
    configDigest: validated.configDigest,
    layerCount: validated.layers,
    runtime: {
      ...container.runtime,
      user: validated.user,
      host: '0.0.0.0'
    },
    archive: {
      file: path.basename(archivePath),
      format: 'oci',
      bytes: validated.archiveBytes,
      sha256: validated.archiveSha256
    },
    buildInputs: candidateBuildInputInventory(container.buildInputs, commit),
    sourceBinding: validated.sourceBinding,
    signing: 'unsigned-not-applicable-to-oci'
  };
  manifest.reproducibility = {
    proof: 'two-no-cache-builds-with-byte-identical-canonical-OCI-archives',
    buildCount: 2,
    archiveSha256: validated.archiveSha256
  };
  manifest.releaseIdentity = releaseIdentity(context);
  manifest.releaseIdentitySha256 = releaseIdentitySha256(context);
  const manifestPath = path.join(outputDirectory, 'container-manifest.json');
  atomicJsonWrite(manifestPath, manifest);
  process.stdout.write(`Built deterministic OCI archive ${path.relative(repositoryRoot, archivePath)}.\n`);
  process.stdout.write(`Image digest: ${manifest.imageDigest}.\n`);
  process.stdout.write(`Archive SHA-256: ${manifest.archive.sha256}.\n`);
  return { archivePath, manifestPath, manifest };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) buildContainer();
