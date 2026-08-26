import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const composer = await import('../../scripts/compose-site.mjs');
const candidateCommit = '6'.repeat(40);
const releaseVersion = '1.0.321';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sourceBinding(path) {
  const files = [{ path, source: path, bytes: 4, sha256: sha256(Buffer.from('test')) }];
  return {
    fileCount: files.length,
    bytes: files.reduce((total, record) => total + record.bytes, 0),
    inventorySha256: sha256(Buffer.from(files.map((record) => `${record.path}\0${record.bytes}\0${record.sha256}\n`).join(''), 'utf8')),
    files
  };
}

function fixtureValues() {
  const publishedAt = '2026-08-25T12:00:00.000Z';
  const context = {
    schemaVersion: 1,
    version: releaseVersion,
    tag: `v${releaseVersion}`,
    runId: '987654321',
    runAttempt: '1',
    commit: candidateCommit,
    commitEpoch: '1787659200',
    createdAt: '2026-08-25T12:00:00.000Z',
    catalogStatus: 'resolved',
    catalogUnavailableReason: null,
    codeName: 'Classic Har Gow · 蝦餃',
    catalogRecord: 'hk-dish-0001',
    catalogSlug: 'classic-har-gow',
    catalogCommit: '7'.repeat(40),
    catalogBlobSha: '8'.repeat(40),
    catalogBytes: 483083,
    publicPhotoUrl: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png',
    publicPhotoAsset: 'hk-dish-0001-classic-har-gow.png',
    containerArchive: `hair-growth-estimator-${releaseVersion}-oci.tar`
  };
  const setupBytes = Buffer.from('verified setup fixture');
  const installer = {
    schemaVersion: 1,
    owner: 'Ding-Ding-Projects',
    repository: 'HairGrowthEstimator',
    tag: context.tag,
    target: candidateCommit,
    version: releaseVersion,
    platform: 'windows-x64',
    filename: `HairGrowthEstimator-Setup-${releaseVersion}-x64.exe`,
    bytes: setupBytes.length,
    sha256: sha256(setupBytes),
    unsigned: true,
    publication: {
      state: 'published',
      draft: false,
      prerelease: false,
      publishedAt,
      releaseId: 101,
      assetId: 202,
      url: `https://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/download/${context.tag}/HairGrowthEstimator-Setup-${releaseVersion}-x64.exe`
    }
  };
  const validation = {
    schemaVersion: 1,
    sourceCommit: candidateCommit,
    version: releaseVersion,
    installerManifestSha256: 'a'.repeat(64),
    containerManifestSha256: 'b'.repeat(64),
    installerSourceBinding: {
      appAsar: sourceBinding('app/main.js'),
      server: sourceBinding('server/index.js')
    },
    containerSourceBinding: sourceBinding('server/index.js')
  };
  return { installer, context, validation, setupBytes };
}

async function writeBundle(directory, values = fixtureValues()) {
  await mkdir(directory, { recursive: true });
  const records = [];
  for (const [file, value] of [
    ['installer-manifest.json', values.installer],
    ['release-context.json', values.context],
    ['trusted-product-validation.json', values.validation]
  ]) {
    const bytes = jsonBytes(value);
    await writeFile(join(directory, file), bytes);
    records.push({ file, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const receipt = {
    schemaVersion: 1,
    repository: 'Ding-Ding-Projects/HairGrowthEstimator',
    runId: values.context.runId,
    contextRunAttempt: Number(values.context.runAttempt),
    terminalRunAttempt: 2,
    tag: values.context.tag,
    target: values.context.commit,
    version: values.context.version,
    files: records.sort((left, right) => left.file < right.file ? -1 : left.file > right.file ? 1 : 0)
  };
  await writeFile(join(directory, 'terminal-transfer-receipt.json'), jsonBytes(receipt));
  return { ...values, receipt };
}

async function refreshReceipt(directory, values) {
  return writeBundle(directory, values);
}

function acceptedExternalReadback(expectedSetup, mutateAttempt = (attempt) => attempt) {
  return async ({ installer, receipt }) => composer.verifyPublishedTerminalTransfer({ installer, receipt }, {
    async release(owner, repository, tag) {
      assert.equal(`${owner}/${repository}`, 'Ding-Ding-Projects/HairGrowthEstimator');
      assert.equal(tag, installer.tag);
      return {
        id: installer.publication.releaseId,
        tag_name: installer.tag,
        target_commitish: installer.target,
        draft: false,
        prerelease: false,
        published_at: installer.publication.publishedAt,
        html_url: `https://github.com/${owner}/${repository}/releases/tag/${tag}`,
        assets: [{
          id: installer.publication.assetId,
          name: installer.filename,
          size: installer.bytes,
          state: 'uploaded',
          browser_download_url: installer.publication.url
        }]
      };
    },
    async download(owner, repository, tag, filename, destination) {
      assert.equal(`${owner}/${repository}`, 'Ding-Ding-Projects/HairGrowthEstimator');
      assert.equal(tag, installer.tag);
      await writeFile(join(destination, filename), expectedSetup);
    },
    async runAttempt(owner, repository, runId, attempt) {
      assert.equal(`${owner}/${repository}`, 'Ding-Ding-Projects/HairGrowthEstimator');
      assert.equal(runId, receipt.runId);
      assert.equal(attempt, receipt.terminalRunAttempt);
      return mutateAttempt({
        id: Number(runId),
        run_attempt: attempt,
        head_sha: installer.target,
        repository: { full_name: `${owner}/${repository}` },
        status: 'completed',
        conclusion: 'success'
      });
    }
  });
}

test('terminal release identity overrides the static package version only after complete readback', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'hair-growth-terminal-release-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = await writeBundle(directory);
  assert.equal(fixture.receipt.contextRunAttempt, 1);
  assert.equal(fixture.receipt.terminalRunAttempt, 2);
  const installer = await composer.validateTerminalTransfer(directory, candidateCommit, {
    verifyExternal: acceptedExternalReadback(fixture.setupBytes)
  });
  const provenance = composer.createArtifactProvenance({
    commit: candidateCommit,
    installer,
    socialPreview: { bytes: 1, sha256: 'c'.repeat(64) }
  });
  assert.equal(provenance.version, releaseVersion);
  assert.notEqual(provenance.version, '1.0.0');
  assert.equal(provenance.updatedAt, fixture.installer.publication.publishedAt);
  assert.equal(provenance.source, 'immutable terminal release transfer plus GitHub release readback');
});

test('terminal transfer refuses a target that differs from the exact composed commit', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'hair-growth-terminal-target-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const values = fixtureValues();
  values.installer.target = '9'.repeat(40);
  await refreshReceipt(directory, values);
  await assert.rejects(
    composer.validateTerminalTransfer(directory, candidateCommit, { verifyExternal: acceptedExternalReadback(values.setupBytes) }),
    /target must match the exact composed commit/i
  );
});

test('terminal transfer refuses stale hashes, incomplete receipts, and malformed nested bindings', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'hair-growth-terminal-receipt-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const values = await writeBundle(directory);
  const contextValue = JSON.parse(await readFile(join(directory, 'release-context.json'), 'utf8'));
  contextValue.catalogSlug = 'changed-after-receipt';
  await writeFile(join(directory, 'release-context.json'), jsonBytes(contextValue));
  await assert.rejects(
    composer.validateTerminalTransfer(directory, candidateCommit, { verifyExternal: acceptedExternalReadback(values.setupBytes) }),
    /receipt.*SHA-256|SHA-256.*receipt/i
  );

  await writeBundle(directory);
  const receipt = JSON.parse(await readFile(join(directory, 'terminal-transfer-receipt.json'), 'utf8'));
  delete receipt.contextRunAttempt;
  await writeFile(join(directory, 'terminal-transfer-receipt.json'), jsonBytes(receipt));
  await assert.rejects(
    composer.validateTerminalTransfer(directory, candidateCommit, { verifyExternal: acceptedExternalReadback(values.setupBytes) }),
    /receipt.*mismatch|receipt.*incomplete/i
  );

  await writeBundle(directory);
  const missingTerminalAttempt = JSON.parse(await readFile(join(directory, 'terminal-transfer-receipt.json'), 'utf8'));
  delete missingTerminalAttempt.terminalRunAttempt;
  await writeFile(join(directory, 'terminal-transfer-receipt.json'), jsonBytes(missingTerminalAttempt));
  await assert.rejects(
    composer.validateTerminalTransfer(directory, candidateCommit, { verifyExternal: acceptedExternalReadback(values.setupBytes) }),
    /receipt.*mismatch|receipt.*incomplete/i
  );

  await writeBundle(directory);
  const ambiguousAttempt = JSON.parse(await readFile(join(directory, 'terminal-transfer-receipt.json'), 'utf8'));
  ambiguousAttempt.runAttempt = ambiguousAttempt.terminalRunAttempt;
  await writeFile(join(directory, 'terminal-transfer-receipt.json'), jsonBytes(ambiguousAttempt));
  await assert.rejects(
    composer.validateTerminalTransfer(directory, candidateCommit, { verifyExternal: acceptedExternalReadback(values.setupBytes) }),
    /receipt field mismatch.*runAttempt/i
  );

  for (const [field, invalid] of [
    ['contextRunAttempt', 0],
    ['contextRunAttempt', -1],
    ['contextRunAttempt', 1.5],
    ['contextRunAttempt', '1'],
    ['terminalRunAttempt', 0],
    ['terminalRunAttempt', -1],
    ['terminalRunAttempt', 1.5],
    ['terminalRunAttempt', '2']
  ]) {
    await writeBundle(directory);
    const invalidAttempt = JSON.parse(await readFile(join(directory, 'terminal-transfer-receipt.json'), 'utf8'));
    invalidAttempt[field] = invalid;
    await writeFile(join(directory, 'terminal-transfer-receipt.json'), jsonBytes(invalidAttempt));
    await assert.rejects(
      composer.validateTerminalTransfer(directory, candidateCommit, { verifyExternal: acceptedExternalReadback(values.setupBytes) }),
      /receipt run identity is invalid/i
    );
  }

  const reversedAttempts = fixtureValues();
  reversedAttempts.context.runAttempt = '2';
  await writeBundle(directory, reversedAttempts);
  const reversedReceipt = JSON.parse(await readFile(join(directory, 'terminal-transfer-receipt.json'), 'utf8'));
  reversedReceipt.terminalRunAttempt = 1;
  await writeFile(join(directory, 'terminal-transfer-receipt.json'), jsonBytes(reversedReceipt));
  await assert.rejects(
    composer.validateTerminalTransfer(directory, candidateCommit, { verifyExternal: acceptedExternalReadback(reversedAttempts.setupBytes) }),
    /terminal attempt cannot predate its context attempt/i
  );

  const splitAttempt = await writeBundle(directory);
  await assert.rejects(
    composer.validateTerminalTransfer(directory, candidateCommit, {
      verifyExternal: acceptedExternalReadback(splitAttempt.setupBytes, (attempt) => ({ ...attempt, run_attempt: 1 }))
    }),
    /terminal attempt readback does not match/i
  );

  const missingBinding = fixtureValues();
  delete missingBinding.validation.installerSourceBinding.server;
  await writeBundle(directory, missingBinding);
  await assert.rejects(
    composer.validateTerminalTransfer(directory, candidateCommit, { verifyExternal: acceptedExternalReadback(missingBinding.setupBytes) }),
    /Installer source binding field mismatch.*server/i
  );

  const extraBinding = fixtureValues();
  extraBinding.validation.installerSourceBinding.unexpected = sourceBinding('unexpected/file.js');
  await writeBundle(directory, extraBinding);
  await assert.rejects(
    composer.validateTerminalTransfer(directory, candidateCommit, { verifyExternal: acceptedExternalReadback(extraBinding.setupBytes) }),
    /Installer source binding field mismatch.*unexpected/i
  );
});

test('missing terminal manifest is refused while an absent transfer stays honest', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'hair-growth-terminal-missing-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const values = await writeBundle(directory);
  await unlink(join(directory, 'installer-manifest.json'));
  await assert.rejects(
    composer.validateTerminalTransfer(directory, candidateCommit, { verifyExternal: acceptedExternalReadback(values.setupBytes) }),
    /terminal transfer.*missing.*installer-manifest\.json/i
  );
  assert.equal(
    await composer.validateTerminalTransfer(join(directory, 'not-present'), candidateCommit, { verifyExternal: acceptedExternalReadback(values.setupBytes) }),
    null
  );
});
