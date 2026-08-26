import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  assertReproducibleContainerBuilds,
  candidateBuildInputInventory,
  deriveBaseManifestProof,
  validateBaseManifestProof
} from '../build-container.mjs';
import { canonicalTar, readTarEntries, validateContainerArchive } from '../container-contract.mjs';
import { assertCanonicalContainerManifest } from '../validate-transferred-products.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '..', '..', '..');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const createdAt = '2026-08-25T04:19:27.000Z';
const healthcheckScript = "const http=require('node:http');const request=http.get('http://127.0.0.1:4782/health',(response)=>{response.resume();process.exit(response.statusCode===200?0:1)});request.setTimeout(2000,()=>request.destroy(new Error('timeout')));request.on('error',()=>process.exit(1));";
const baseLayerTar = canonicalTar(new Map([['usr/local/bin/base-runtime', Buffer.from('base')]]), 1_777_264_767);
const baseLayerBlob = gzipSync(baseLayerTar, { mtime: 0 });
const baseConfigProjectionBytes = json({
  architecture: 'amd64',
  os: 'linux',
  config: { Entrypoint: ['docker-entrypoint.sh'] },
  rootfs: { type: 'layers', diff_ids: [`sha256:${digest(baseLayerTar)}`] }
});
const baseManifestBytes = json({
  schemaVersion: 2,
  config: {
    mediaType: 'application/vnd.oci.image.config.v1+json',
    digest: `sha256:${digest(baseConfigProjectionBytes)}`,
    size: baseConfigProjectionBytes.length
  },
  layers: [{
    mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
    digest: `sha256:${digest(baseLayerBlob)}`,
    size: baseLayerBlob.length
  }]
});
const baseManifestDigest = `sha256:${digest(baseManifestBytes)}`;
const baseIndexBytes = json({
  schemaVersion: 2,
  manifests: [{
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    digest: baseManifestDigest,
    size: baseManifestBytes.length,
    platform: { os: 'linux', architecture: 'amd64' }
  }]
});
const baseIndexDigest = `sha256:${digest(baseIndexBytes)}`;

function baseProofFixture() {
  return deriveBaseManifestProof(baseIndexBytes, baseManifestBytes, baseConfigProjectionBytes, {
    indexDigest: baseIndexDigest,
    manifestDigest: baseManifestDigest
  });
}

function expectedArchive() {
  return { version: '1.0.0', commit, createdAt, baseIndexDigest, baseManifestDigest, baseProof: baseProofFixture() };
}

test('base ancestry proof derives the linux/amd64 manifest from retained raw index bytes', () => {
  const expected = { indexDigest: baseIndexDigest, manifestDigest: baseManifestDigest };
  const proof = deriveBaseManifestProof(baseIndexBytes, baseManifestBytes, baseConfigProjectionBytes, expected);
  assert.deepEqual(validateBaseManifestProof(proof, expected), proof);
  assert.throws(
    () => deriveBaseManifestProof(Buffer.concat([baseIndexBytes, Buffer.from(' ')]), baseManifestBytes, baseConfigProjectionBytes, expected),
    /immutable base index digest/
  );
  assert.throws(
    () => deriveBaseManifestProof(baseIndexBytes, Buffer.concat([baseManifestBytes, Buffer.from(' ')]), baseConfigProjectionBytes, expected),
    /selected base manifest digest/
  );
  assert.throws(
    () => deriveBaseManifestProof(baseIndexBytes, baseManifestBytes, Buffer.concat([baseConfigProjectionBytes, Buffer.from(' ')]), expected),
    /config descriptor digest or size/
  );
  assert.throws(() => validateBaseManifestProof({ ...proof, rawIndexBytes: proof.rawIndexBytes + 1 }, expected), /canonical base64/);
});

test('tar parser rejects invalid checksums and duplicate paths', () => {
  const corrupt = canonicalTar(new Map([['one.txt', Buffer.from('one')]]), 1_777_264_767);
  corrupt[0] ^= 1;
  assert.throws(() => readTarEntries(corrupt), /checksum/);
  const duplicate = orderedTar([
    ['same.txt', Buffer.from('first')],
    ['same.txt', Buffer.from('second')]
  ]);
  assert.throws(() => readTarEntries(duplicate), /duplicate entry path/);
});

test('tar parser rejects bytes outside the supported octal field grammar', () => {
  const poisoned = canonicalTar(new Map([['zero.txt', Buffer.alloc(0)]]), 1_777_264_767);
  poisoned.fill(0, 124, 136);
  poisoned[124] = '0'.charCodeAt(0);
  poisoned[126] = '7'.charCodeAt(0);
  rewriteTarChecksum(poisoned);
  assert.throws(() => readTarEntries(poisoned), /numeric field|octal/);
});

test('tar parser preserves pathname whitespace and rejects ambiguous extended names', () => {
  const spaced = canonicalTar(new Map([['name-with-space ', Buffer.from('value')]]), 1_777_264_767);
  assert.equal(readTarEntries(spaced).has('name-with-space '), true);

  const paxSize = orderedTar([
    ['pax-size', paxRecord('size', '3')],
    ['payload.txt', Buffer.from('x')]
  ]);
  paxSize[156] = 'x'.charCodeAt(0);
  paxSize.fill(0x20, 148, 156);
  const paxChecksum = [...paxSize.subarray(0, 512)].reduce((sum, byte) => sum + byte, 0);
  paxSize.fill(0, 148, 156);
  Buffer.from(`${paxChecksum.toString(8).padStart(6, '0')}\0 `, 'ascii').copy(paxSize, 148);
  assert.equal(readTarEntries(paxSize).get('payload.txt').bytes.length, 3);

  const ambiguous = Buffer.concat([
    typedTarEntry('pax-path', paxRecord('path', 'pax.txt'), 'x').subarray(0, -1024),
    typedTarEntry('gnu-path', Buffer.from('gnu.txt\0'), 'L').subarray(0, -1024),
    canonicalTar(new Map([['header.txt', Buffer.from('value')]]), 1_777_264_767)
  ]);
  assert.throws(() => readTarEntries(ambiguous), /competing extended path/);
});

test('tar parser validates dialect, terminators, and every UTF-8 text source', () => {
  const unsupported = canonicalTar(new Map([['safe.txt', Buffer.from('value')]]), 1_777_264_767);
  unsupported.fill(0, 257, 265);
  Buffer.from('ignored-prefix', 'utf8').copy(unsupported, 345);
  rewriteTarChecksum(unsupported);
  assert.throws(() => readTarEntries(unsupported), /dialect/);

  const gnu = canonicalTar(new Map([['gnu.txt', Buffer.from('value')]]), 1_777_264_767);
  Buffer.from('ustar ', 'ascii').copy(gnu, 257);
  Buffer.from([0x20, 0x00]).copy(gnu, 263);
  Buffer.from('must-not-be-a-prefix', 'utf8').copy(gnu, 345);
  rewriteTarChecksum(gnu);
  assert.equal(readTarEntries(gnu).has('gnu.txt'), true);

  const canonical = canonicalTar(new Map([['one.txt', Buffer.from('one')]]), 1_777_264_767);
  assert.throws(() => readTarEntries(canonical.subarray(0, -512)), /two zero terminator blocks/);
  const lateEntry = canonicalTar(new Map([['late.txt', Buffer.from('late')]]), 1_777_264_767).subarray(0, -1024);
  const isolatedZero = Buffer.concat([canonical.subarray(0, -1024), Buffer.alloc(512), lateEntry, Buffer.alloc(1024)]);
  assert.throws(() => readTarEntries(isolatedZero), /terminator|zero through end/);

  const invalidHeader = canonicalTar(new Map([['valid.txt', Buffer.from('value')]]), 1_777_264_767);
  Buffer.from([0xc3, 0x28]).copy(invalidHeader, 0);
  rewriteTarChecksum(invalidHeader);
  assert.throws(() => readTarEntries(invalidHeader), /UTF-8/);

  const invalidPaxPayload = paxRecord('path', 'x');
  invalidPaxPayload[invalidPaxPayload.indexOf('x'.charCodeAt(0))] = 0xc3;
  const invalidPax = Buffer.concat([
    typedTarEntry('pax-path', invalidPaxPayload, 'x').subarray(0, -1024),
    canonicalTar(new Map([['header.txt', Buffer.from('value')]]), 1_777_264_767)
  ]);
  assert.throws(() => readTarEntries(invalidPax), /UTF-8/);

  const invalidLongName = Buffer.concat([
    typedTarEntry('gnu-path', Buffer.from([0xc3, 0x00]), 'L').subarray(0, -1024),
    canonicalTar(new Map([['header.txt', Buffer.from('value')]]), 1_777_264_767)
  ]);
  assert.throws(() => readTarEntries(invalidLongName), /UTF-8/);

  const binaryCharset = Buffer.concat([
    typedTarEntry('pax-charset', paxRecord('hdrcharset', 'BINARY'), 'x').subarray(0, -1024),
    canonicalTar(new Map([['header.txt', Buffer.from('value')]]), 1_777_264_767)
  ]);
  assert.throws(() => readTarEntries(binaryCharset), /hdrcharset/);
});

function digest(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function gitFile(relativePath) {
  return execFileSync('git', ['show', `${commit}:${relativePath}`], { cwd: root, encoding: 'buffer' });
}

function symlinkLayer(name, linkName) {
  const tar = canonicalTar(new Map([[name, Buffer.alloc(0)]]), 1_777_264_767);
  tar[156] = '2'.charCodeAt(0);
  tar.fill(0, 157, 257);
  Buffer.from(linkName, 'utf8').copy(tar, 157);
  tar.fill(0x20, 148, 156);
  const checksum = [...tar.subarray(0, 512)].reduce((sum, byte) => sum + byte, 0);
  tar.fill(0, 148, 156);
  Buffer.from(`${checksum.toString(8).padStart(6, '0')}\0 `, 'ascii').copy(tar, 148);
  return tar;
}

function typedTarEntry(name, data, rawType) {
  const tar = canonicalTar(new Map([[name, data]]), 1_777_264_767);
  tar[156] = rawType.charCodeAt(0);
  tar.fill(0x20, 148, 156);
  const checksum = [...tar.subarray(0, 512)].reduce((sum, byte) => sum + byte, 0);
  tar.fill(0, 148, 156);
  Buffer.from(`${checksum.toString(8).padStart(6, '0')}\0 `, 'ascii').copy(tar, 148);
  return tar;
}

function paxRecord(key, value) {
  const body = `${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 2;
  while (true) {
    const record = `${length} ${body}`;
    const measured = Buffer.byteLength(record);
    if (measured === length) return Buffer.from(record);
    length = measured;
  }
}

function orderedTar(records) {
  return Buffer.concat([
    ...records.map(([name, value]) => canonicalTar(new Map([[name, value]]), 1_777_264_767).subarray(0, -1024)),
    Buffer.alloc(1024)
  ]);
}

function rewriteTarChecksum(tar, offset = 0) {
  const header = tar.subarray(offset, offset + 512);
  header.fill(0x20, 148, 156);
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  header.fill(0, 148, 156);
  Buffer.from(`${checksum.toString(8).padStart(6, '0')}\0 `, 'ascii').copy(header, 148);
}

function makeArchive(target, tamper = false, wrongDescriptorSize = false, replaceWithSymlink = false, extraLayerTars = [], options = {}) {
  const server = new Map();
  for (const name of ['index.js', 'service.js', 'store.js']) {
    const bytes = gitFile(`server/${name}`);
    server.set(`opt/hair-growth/server/${name}`, tamper && name === 'store.js' ? Buffer.concat([bytes, Buffer.from('\nchanged')]) : bytes);
  }
  const selectedBaseLayer = options.wrongBasePrefix
    ? canonicalTar(new Map([['usr/local/bin/not-the-base', Buffer.from('replacement')]]), 1_777_264_767)
    : baseLayerTar;
  const layerTars = [selectedBaseLayer, canonicalTar(server, 1_777_264_767)];
  if (replaceWithSymlink) layerTars.push(symlinkLayer('opt/hair-growth/server/index.js', '../../../etc/passwd'));
  layerTars.push(...extraLayerTars);
  const layers = layerTars.map((tar) => gzipSync(tar, { mtime: 0 }));
  const layerDigests = layers.map(digest);
  const configRecord = {
    architecture: 'amd64',
    os: 'linux',
    config: {
      User: 'node:node',
      Env: ['HAIR_HOST=0.0.0.0'],
      Cmd: ['node', 'server/index.js'],
      Entrypoint: ['docker-entrypoint.sh'],
      WorkingDir: '/opt/hair-growth',
      ExposedPorts: { '4782/tcp': {} },
      Volumes: { '/data': {} },
      Healthcheck: {
        Test: ['CMD', 'node', '-e', healthcheckScript],
        Interval: 30_000_000_000,
        Timeout: 3_000_000_000,
        StartPeriod: 5_000_000_000,
        Retries: 3
      },
      StopSignal: 'SIGTERM',
      Labels: {
        'org.opencontainers.image.version': '1.0.0',
        'org.opencontainers.image.revision': commit,
        'org.opencontainers.image.source': 'https://github.com/Ding-Ding-Projects/HairGrowthEstimator',
        'org.opencontainers.image.created': createdAt,
        'org.opencontainers.image.base.index.digest': baseIndexDigest,
        'org.opencontainers.image.base.digest': baseManifestDigest
      }
    },
    rootfs: { type: 'layers', diff_ids: layerTars.map((tar) => `sha256:${digest(tar)}`) }
  };
  options.mutateConfig?.(configRecord);
  const config = json(configRecord);
  const configDigest = digest(config);
  const manifestRecord = {
    schemaVersion: 2,
    config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: `sha256:${configDigest}`, size: config.length },
    layers: layers.map((layer, index) => ({
      mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
      digest: `sha256:${layerDigests[index]}`,
      size: layer.length + (wrongDescriptorSize && index === 0 ? 1 : 0)
    }))
  };
  options.mutateManifest?.(manifestRecord);
  const manifest = json(manifestRecord);
  const manifestDigest = digest(manifest);
  const index = json({
    schemaVersion: 2,
    manifests: [{
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      digest: `sha256:${manifestDigest}`,
      size: manifest.length,
      platform: { os: 'linux', architecture: 'amd64' }
    }]
  });
  const archive = canonicalTar(new Map([
    ['oci-layout', json({ imageLayoutVersion: '1.0.0' })],
    ['index.json', index],
    [`blobs/sha256/${configDigest}`, config],
    ...layers.map((layer, index) => [`blobs/sha256/${layerDigests[index]}`, layer]),
    [`blobs/sha256/${manifestDigest}`, manifest]
  ]), 1_777_264_767);
  fs.writeFileSync(target, archive);
}

test('OCI validation binds real layer bytes to the candidate commit and rejects a validly rehashed tamper', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-oci-'));
  const good = path.join(directory, 'good.oci.tar');
  const bad = path.join(directory, 'bad.oci.tar');
  const badSize = path.join(directory, 'bad-size.oci.tar');
  const symlinkReplacement = path.join(directory, 'symlink-replacement.oci.tar');
  const expected = expectedArchive();
  try {
    makeArchive(good, false);
    const result = validateContainerArchive(good, expected);
    assert.equal(result.sourceBinding.fileCount, 3);
    makeArchive(bad, true);
    assert.throws(() => validateContainerArchive(bad, expected), /candidate Git blob: store\.js/);
    makeArchive(badSize, false, true);
    assert.throws(() => validateContainerArchive(badSize, expected), /descriptor size disagrees with blob bytes/);
    makeArchive(symlinkReplacement, false, false, true);
    assert.throws(() => validateContainerArchive(symlinkReplacement, expected), /regular file/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('OCI whiteouts apply to lower layers before same-layer additions and handle the root prefix', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-oci-whiteout-'));
  const expected = expectedArchive();
  const rootOpaque = path.join(directory, 'root-opaque.oci.tar');
  const explicitAfterReplacement = path.join(directory, 'explicit-after-replacement.oci.tar');
  const opaqueAfterReplacement = path.join(directory, 'opaque-after-replacement.oci.tar');
  try {
    makeArchive(rootOpaque, false, false, false, [orderedTar([
      ['.wh..wh..opq', Buffer.alloc(0)]
    ])]);
    assert.throws(() => validateContainerArchive(rootOpaque, expected), /file set disagrees/);

    makeArchive(explicitAfterReplacement, false, false, false, [orderedTar([
      ['opt/hair-growth/server/index.js', gitFile('server/index.js')],
      ['opt/hair-growth/server/.wh.index.js', Buffer.alloc(0)]
    ])]);
    assert.doesNotThrow(() => validateContainerArchive(explicitAfterReplacement, expected));

    makeArchive(opaqueAfterReplacement, false, false, false, [orderedTar([
      ['opt/hair-growth/server/index.js', gitFile('server/index.js')],
      ['opt/hair-growth/server/service.js', gitFile('server/service.js')],
      ['opt/hair-growth/server/store.js', gitFile('server/store.js')],
      ['opt/hair-growth/server/.wh..wh..opq', Buffer.alloc(0)]
    ])]);
    assert.doesNotThrow(() => validateContainerArchive(opaqueAfterReplacement, expected));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('OCI whiteouts are empty regular files with a nonempty target', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-oci-whiteout-shape-'));
  const expected = expectedArchive();
  const emptyTarget = path.join(directory, 'empty-target.oci.tar');
  const nonempty = path.join(directory, 'nonempty.oci.tar');
  const symlink = path.join(directory, 'symlink.oci.tar');
  try {
    makeArchive(emptyTarget, false, false, false, [orderedTar([
      ['opt/hair-growth/server/.wh.', Buffer.alloc(0)]
    ])]);
    assert.throws(() => validateContainerArchive(emptyTarget, expected), /nonempty target/);

    makeArchive(nonempty, false, false, false, [orderedTar([
      ['opt/hair-growth/server/.wh.index.js', Buffer.from('not-empty')]
    ])]);
    assert.throws(() => validateContainerArchive(nonempty, expected), /empty regular file/);

    makeArchive(symlink, false, false, false, [symlinkLayer('opt/hair-growth/server/.wh.index.js', 'index.js')]);
    assert.throws(() => validateContainerArchive(symlink, expected), /empty regular file/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('OCI base ancestry, ordered diff IDs, and exact runtime configuration are bound', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hair-growth-oci-contract-'));
  const expected = expectedArchive();
  const wrongBase = path.join(directory, 'wrong-base.oci.tar');
  const wrongDiffIds = path.join(directory, 'wrong-diff-ids.oci.tar');
  const wrongRuntime = path.join(directory, 'wrong-runtime.oci.tar');
  try {
    makeArchive(wrongBase, false, false, false, [], { wrongBasePrefix: true });
    assert.throws(() => validateContainerArchive(wrongBase, expected), /base layer prefix/);

    makeArchive(wrongDiffIds, false, false, false, [], {
      mutateConfig: (config) => { config.rootfs.diff_ids[0] = `sha256:${'f'.repeat(64)}`; }
    });
    assert.throws(() => validateContainerArchive(wrongDiffIds, expected), /rootfs diff_ids/);

    const mutations = [
      (config) => { config.config.Cmd = ['node', 'wrong.js']; },
      (config) => { config.config.Entrypoint = ['/bin/false']; },
      (config) => { config.config.WorkingDir = '/tmp'; },
      (config) => { config.config.ExposedPorts = { '9999/tcp': {} }; },
      (config) => { config.config.Volumes = { '/wrong': {} }; },
      (config) => { config.config.Healthcheck.Timeout = 1; },
      (config) => { config.config.StopSignal = 'SIGKILL'; }
    ];
    for (const mutateConfig of mutations) {
      makeArchive(wrongRuntime, false, false, false, [], { mutateConfig });
      assert.throws(() => validateContainerArchive(wrongRuntime, expected), /runtime configuration/);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('container build inputs bind current bytes to exact candidate Git blobs', () => {
  const inventory = candidateBuildInputInventory(['Dockerfile'], commit, (relativePath) => gitFile(relativePath));
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].path, 'Dockerfile');
  assert.match(inventory[0].sha256, /^[0-9a-f]{64}$/);
  assert.match(inventory[0].gitBlobSha1, /^[0-9a-f]{40}$/);
  assert.throws(
    () => candidateBuildInputInventory(['Dockerfile'], commit, (relativePath) => Buffer.concat([gitFile(relativePath), Buffer.from('\nchanged')])),
    /candidate Git blob: Dockerfile/
  );
});

test('repeated OCI build proof requires identical archive and descriptor identities', () => {
  const record = {
    archiveSha256: 'a'.repeat(64),
    imageDigest: `sha256:${'b'.repeat(64)}`,
    configDigest: `sha256:${'c'.repeat(64)}`,
    sourceBinding: { fileCount: 3, inventorySha256: 'd'.repeat(64) }
  };
  assert.doesNotThrow(() => assertReproducibleContainerBuilds(record, structuredClone(record)));
  assert.throws(() => assertReproducibleContainerBuilds(record, { ...record, archiveSha256: 'e'.repeat(64) }), /archiveSha256/);
});

test('transferred OCI metadata cannot choose its own base or build-input inventory', () => {
  const canonical = {
    baseImage: 'node:22-alpine@' + baseIndexDigest,
    baseImageIndexDigest: baseIndexDigest,
    baseImageManifestDigest: baseManifestDigest,
    platform: 'linux/amd64',
    ociArchive: 'image.oci.tar',
    archiveFormat: 'oci',
    runtime: { user: 'node:node', host: '0.0.0.0', readOnlyRequired: true },
    buildInputs: ['Dockerfile', 'server/index.js']
  };
  const transferred = {
    ...canonical,
    archive: { file: canonical.ociArchive, format: canonical.archiveFormat },
    buildInputs: canonical.buildInputs.map((item) => ({ path: item }))
  };
  assert.doesNotThrow(() => assertCanonicalContainerManifest(transferred, canonical));
  assert.throws(
    () => assertCanonicalContainerManifest({ ...transferred, baseImageManifestDigest: 'sha256:' + '9'.repeat(64) }, canonical),
    /canonical candidate container metadata/
  );
  assert.throws(
    () => assertCanonicalContainerManifest({ ...transferred, buildInputs: [{ path: 'Dockerfile' }] }, canonical),
    /canonical candidate container metadata/
  );
});
