import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  earliestServerJobStart,
  formatDuration,
  releaseTitle,
  renderReleaseNotes,
  validateFinalizedReleaseNotes,
  validateProductSourceBindings,
  validatePublisherRetryNotes,
  validateReleaseNotesState
} from '../publish-release.mjs';
import {
  finalizationOutputNames,
  parseIncludedGithubResponse,
  pagesReleaseManifest,
  planPriorAttemptFinalization,
  planTerminalFinalization,
  terminalWorkflowBounds,
  validateWorkflowRun
} from '../finalize-release.mjs';
import { assertMatchingReleaseIdentity, releaseIdentitySha256 } from '../release-identity.mjs';
import { selectNewestProductArtifacts } from '../download-run-products.mjs';
import { safeReleaseBasename, validateReleaseStageDestination } from '../stage-release-files.mjs';
import { productFileNames } from '../stage-product-files.mjs';
import { contextEvidenceCandidates, validateRunContext } from '../ensure-run-context.mjs';
import { sourceInventorySha256 } from '../source-binding.mjs';

const identity = {
  version: '1.0.19',
  tag: 'v1.0.19',
  commit: '1'.repeat(40),
  createdAt: '2026-08-25T05:00:00.000Z',
  runId: '12345',
  runAttempt: '1',
  catalogStatus: 'resolved',
  catalogUnavailableReason: null,
  codeName: 'Dish Name · 點心名',
  catalogRecord: 'hk-dish-0019',
  catalogSlug: 'dish-name',
  catalogCommit: '3'.repeat(40),
  catalogBlobSha: '4'.repeat(40),
  catalogBytes: 123,
  publicPhotoUrl: 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/photo.png',
  publicPhotoAsset: 'photo.png',
  containerArchive: 'hair-growth-api-1.0.19-linux-amd64.oci.tar',
  deltaFeed: {
    status: 'first-release-no-previous-package',
    remoteReleases: null,
    requiredAfterFirstRelease: true
  }
};

test('release publication revalidates complete source-binding record arrays', () => {
  const files = [{ path: 'app/main.js', source: 'app/main.js', bytes: 5, sha256: 'a'.repeat(64) }];
  const binding = { fileCount: 1, bytes: 5, inventorySha256: sourceInventorySha256(files), files };
  const installer = { embedded: { sourceBinding: { appAsar: binding, server: structuredClone(binding) } } };
  const container = { sourceBinding: structuredClone(binding) };
  assert.equal(validateProductSourceBindings(installer, container), true);
  const incomplete = structuredClone(installer);
  incomplete.embedded.sourceBinding.appAsar.files = [];
  assert.throws(() => validateProductSourceBindings(incomplete, container), /file count/);
});

test('release products bind the complete catalog and candidate identity', () => {
  assert.doesNotThrow(() => assertMatchingReleaseIdentity(identity, structuredClone(identity)));
  assert.match(releaseIdentitySha256(identity), /^[0-9a-f]{64}$/);
  assert.throws(() => assertMatchingReleaseIdentity(identity, { ...identity, catalogRecord: 'hk-dish-0020' }), /catalog or candidate identity/);
});

test('logical-run product selection is independent per attempt and filenames are safe basenames', () => {
  const selected = selectNewestProductArtifacts([
    { id: 1, name: 'windows-release-77-1', expired: false },
    { id: 2, name: 'container-release-77-1', expired: false },
    { id: 3, name: 'container-release-77-2', expired: false }
  ], '77');
  assert.equal(selected.windows.attempt, 1);
  assert.equal(selected.container.attempt, 2);
  assert.equal(safeReleaseBasename('release-manifest.json'), 'release-manifest.json');
  assert.throws(() => safeReleaseBasename('../release-manifest.json'), /safe basename/);
  assert.deepEqual(productFileNames('container', {
    schemaVersion: 2,
    archive: { format: 'oci', file: 'image.oci.tar' }
  }), ['image.oci.tar', 'container-manifest.json']);
  assert.throws(() => productFileNames('container', {
    schemaVersion: 2,
    archive: { format: 'oci', file: '../image.oci.tar' }
  }), /safe basename/);
});

test('release staging accepts only the exact generated directory under dist', () => {
  const root = path.resolve('C:/fixture/repository');
  const expected = path.join(root, 'dist', 'release-assets');
  assert.equal(validateReleaseStageDestination(expected, root), expected);
  assert.throws(() => validateReleaseStageDestination(root, root), /exact generated release staging directory/);
  assert.throws(() => validateReleaseStageDestination(path.resolve(root, '..', 'release-assets'), root), /exact generated release staging directory/);
  assert.throws(() => validateReleaseStageDestination(path.join(root, 'dist', 'other'), root), /exact generated release staging directory/);
});

test('logical-run release context keeps the earliest valid evidence attempt and exact identity', () => {
  const candidates = contextEvidenceCandidates([
    { id: 3, name: 'windows-release-77-3', expired: false },
    { id: 1, name: 'windows-release-77-1', expired: false },
    { id: 2, name: 'windows-release-77-2', expired: true }
  ], '77');
  assert.deepEqual(candidates.map((record) => record.attempt), [1, 3]);
  const context = { ...identity, schemaVersion: 1, runId: '77', runAttempt: '1', commitEpoch: '1777264767' };
  assert.doesNotThrow(() => validateRunContext(context, { runId: '77', commit: identity.commit }));
  assert.throws(() => validateRunContext({ ...context, commit: '9'.repeat(40) }, { runId: '77', commit: identity.commit }), /logical run and exact candidate/);
});

test('workflow timing is exact and rejects reversed bounds', () => {
  assert.equal(formatDuration('2026-08-25T05:00:00.000Z', '2026-08-25T06:02:03.900Z'), '01:02:03');
  assert.throws(() => formatDuration('2026-08-25T06:00:00.000Z', '2026-08-25T05:00:00.000Z'), /timing bounds/);
  assert.equal(earliestServerJobStart([
    { started_at: '2026-08-25T04:55:00Z', conclusion: 'skipped' },
    { started_at: '2026-08-25T05:02:00Z' },
    { started_at: '2026-08-25T05:00:00Z' }
  ]), '2026-08-25T05:00:00.000Z');
});

test('post-run release currentness uses the server Date from the independent readback', () => {
  const response = parseIncludedGithubResponse('HTTP/2.0 200 OK\r\nDate: Tue, 25 Aug 2026 05:05:01 GMT\r\nContent-Type: application/json\r\n\r\n{"id":41,"body":"exact"}\n');
  assert.deepEqual(response, {
    value: { id: 41, body: 'exact' },
    serverDate: '2026-08-25T05:05:01.000Z'
  });
  assert.throws(() => parseIncludedGithubResponse('HTTP/2.0 200 OK\r\nContent-Type: application/json\r\n\r\n{}'), /server Date/);
});

test('terminal timing requires the exact four successful server job records', () => {
  const run = {
    id: 12345,
    head_sha: identity.commit,
    status: 'completed',
    conclusion: 'success',
    run_number: 19,
    run_attempt: 2
  };
  assert.doesNotThrow(() => validateWorkflowRun({ ...run, status: 'in_progress', conclusion: null }, { runId: '12345', commit: identity.commit, version: identity.version }, false));
  assert.throws(() => validateWorkflowRun({ ...run, status: 'completed', conclusion: 'failure' }, { runId: '12345', commit: identity.commit, version: identity.version }, false), /active or completed successfully/);
  assert.throws(() => validateWorkflowRun({ ...run, status: 'waiting', conclusion: null }, { runId: '12345', commit: identity.commit, version: identity.version }, false), /active or completed successfully/);
  const jobs = [
    [11, 1, 'Build unsigned Squirrel.Windows release files', '2026-08-25T05:00:00Z', '2026-08-25T05:01:00Z', 'success'],
    [12, 1, 'Build deterministic OCI container archive', '2026-08-25T05:01:00Z', '2026-08-25T05:02:00Z', 'failure'],
    [13, 1, 'Publish one verified release', '2026-08-25T05:02:00Z', '2026-08-25T05:01:59Z', 'skipped'],
    [14, 1, 'Finalize release readback', '2026-08-25T05:02:00Z', '2026-08-25T05:01:59Z', 'skipped'],
    [22, 2, 'Build deterministic OCI container archive', '2026-08-25T05:02:00Z', '2026-08-25T05:03:00Z', 'success'],
    [23, 2, 'Publish one verified release', '2026-08-25T05:03:00Z', '2026-08-25T05:03:30Z', 'success'],
    [24, 2, 'Finalize release readback', '2026-08-25T05:03:30Z', '2026-08-25T05:04:00Z', 'success']
  ].map(([id, run_attempt, name, started_at, completed_at, conclusion]) => ({
    id,
    run_id: 12345,
    head_sha: identity.commit,
    run_attempt,
    name,
    started_at,
    completed_at,
    status: 'completed',
    conclusion
  }));
  const expectedRun = { runId: '12345', commit: identity.commit, version: identity.version };
  assert.deepEqual(terminalWorkflowBounds(run, jobs, expectedRun), {
    startedAt: '2026-08-25T05:00:00.000Z',
    completedAt: '2026-08-25T05:04:00.000Z',
    runAttempt: 2,
    selectedJobs: [
      { name: 'Build unsigned Squirrel.Windows release files', id: 11, runAttempt: 1, startedAt: '2026-08-25T05:00:00.000Z', completedAt: '2026-08-25T05:01:00.000Z' },
      { name: 'Build deterministic OCI container archive', id: 22, runAttempt: 2, startedAt: '2026-08-25T05:02:00.000Z', completedAt: '2026-08-25T05:03:00.000Z' },
      { name: 'Publish one verified release', id: 23, runAttempt: 2, startedAt: '2026-08-25T05:03:00.000Z', completedAt: '2026-08-25T05:03:30.000Z' },
      { name: 'Finalize release readback', id: 24, runAttempt: 2, startedAt: '2026-08-25T05:03:30.000Z', completedAt: '2026-08-25T05:04:00.000Z' }
    ]
  });
  assert.throws(() => terminalWorkflowBounds({ ...run, head_sha: '9'.repeat(40) }, jobs, expectedRun), /exact source commit/);
  assert.throws(() => terminalWorkflowBounds(run, jobs.slice(1), expectedRun), /exact four-job inventory/);
  assert.throws(() => terminalWorkflowBounds(run, [...jobs, { ...jobs.at(-1), id: 25 }], expectedRun), /duplicate job record/);
  assert.throws(() => terminalWorkflowBounds(run, jobs.map((job, index) => index === 0 ? { ...job, run_id: 98765 } : job), expectedRun), /exact run ID/);
  assert.throws(() => terminalWorkflowBounds(run, jobs.map((job, index) => index === 0 ? { ...job, name: 'Unreviewed release job' } : job), expectedRun), /unexpected job/);
});

test('final release notes carry complete timing, source identity, hashes, and a public catalog link', () => {
  const notes = renderReleaseNotes({
    context: identity,
    files: [{ name: 'Setup.exe', bytes: 123, sha256: '2'.repeat(64) }],
    lineCount: '| **Grand total** | **All applicable rows** |',
    startedAt: '2026-08-25T05:00:00.000Z',
    publishedAt: '2026-08-25T05:01:00.000Z',
    completedAt: '2026-08-25T05:01:02.000Z',
    duration: '00:01:02'
  });
  assert.match(notes, /Workflow completed: `2026-08-25T05:01:02\.000Z`/);
  assert.match(notes, /Release published: `2026-08-25T05:01:00\.000Z`/);
  assert.match(notes, /Workflow duration: `00:01:02`/);
  assert.match(notes, /Catalog record: `hk-dish-0019`/);
  assert.match(notes, /Setup\.exe.*`2{64}`/s);
  assert.doesNotMatch(notes, /pending server publication timestamp/);
  assert.match(notes, /is not copied into this repository or release/);
});

test('active workflow release notes leave terminal completion pending without guessing', () => {
  const notes = renderReleaseNotes({
    context: identity,
    files: [],
    lineCount: '| **Grand total** | **All applicable rows** |',
    startedAt: '2026-08-25T05:00:00.000Z',
    publishedAt: '2026-08-25T05:01:00.000Z'
  });
  assert.match(notes, /Release published: `2026-08-25T05:01:00\.000Z`/);
  assert.match(notes, /Workflow completed: pending terminal run verification/);
  assert.match(notes, /Workflow duration: pending terminal run verification/);
});

test('release-note retry validation accepts only exact pending or exact finalized timing states', () => {
  const preliminary = renderReleaseNotes({
    context: identity,
    files: [],
    lineCount: '| **Grand total** | **All applicable rows** |',
    startedAt: '2026-08-25T05:00:00.000Z'
  });
  const pending = renderReleaseNotes({ context: identity, files: [], lineCount: '| **Grand total** | **All applicable rows** |', startedAt: '2026-08-25T05:00:00.000Z', publishedAt: '2026-08-25T05:01:00.000Z' });
  const finalized = renderReleaseNotes({
    context: identity,
    files: [],
    lineCount: '| **Grand total** | **All applicable rows** |',
    startedAt: '2026-08-25T05:00:00.000Z',
    publishedAt: '2026-08-25T05:01:00.000Z',
    completedAt: '2026-08-25T05:04:00.000Z',
    duration: '00:04:00'
  });
  assert.deepEqual(validateReleaseNotesState(pending, pending), { state: 'pending', completedAt: null, duration: null });
  assert.deepEqual(validateReleaseNotesState(finalized, pending), { state: 'finalized', completedAt: '2026-08-25T05:04:00.000Z', duration: '00:04:00' });
  assert.deepEqual(validateFinalizedReleaseNotes(finalized, pending, '2026-08-25T05:00:00.000Z', '2026-08-25T05:04:00.000Z'), { notes: finalized, duration: '00:04:00' });
  assert.deepEqual(validatePublisherRetryNotes(preliminary, preliminary, pending), { state: 'preliminary-published', action: 'patch-published-notes' });
  assert.deepEqual(validatePublisherRetryNotes(pending, preliminary, pending), { state: 'pending-terminal', action: 'none' });
  assert.deepEqual(validatePublisherRetryNotes(finalized, preliminary, pending), { state: 'finalized-unverified', action: 'handoff-to-finalizer' });
  assert.throws(() => validatePublisherRetryNotes(`${pending}\nForeign text.\n`, preliminary, pending), /known publication recovery state/);
  assert.throws(() => validateReleaseNotesState(`${finalized}\nUnexpected retry text.\n`, pending), /exact pending or finalized state/);
});

test('terminal finalization planner patches pending notes once and never rewrites an exact older finalization', () => {
  const records = [];
  const lineCount = '| **Grand total** | **All applicable rows** |';
  const publishedAt = '2026-08-25T05:01:00.000Z';
  const publishedNotes = renderReleaseNotes({ context: identity, files: records, lineCount, startedAt: '2026-08-25T05:00:00.000Z', publishedAt });
  const candidates = [
    { startedAt: '2026-08-25T05:00:00.000Z', completedAt: '2026-08-25T05:04:00.000Z', runAttempt: 1, selectedJobs: [] },
    { startedAt: '2026-08-25T05:00:00.000Z', completedAt: '2026-08-25T05:06:00.000Z', runAttempt: 2, selectedJobs: [] }
  ];
  const newest = planTerminalFinalization({ candidates, context: identity, records, lineCount, publishedAt, publishedNotes, body: publishedNotes });
  assert.equal(newest.action, 'patch');
  assert.equal(newest.candidate.runAttempt, 2);
  const olderNotes = renderReleaseNotes({
    context: identity,
    files: records,
    lineCount,
    startedAt: candidates[0].startedAt,
    publishedAt,
    completedAt: candidates[0].completedAt,
    duration: '00:04:00'
  });
  const retained = planTerminalFinalization({ candidates, context: identity, records, lineCount, publishedAt, publishedNotes, body: olderNotes });
  assert.equal(retained.action, 'noop');
  assert.equal(retained.candidate.runAttempt, 1);
  const foreignNotes = olderNotes.replace('2026-08-25T05:04:00.000Z', '2026-08-25T05:05:00.000Z').replace('00:04:00', '00:05:00');
  assert.throws(() => planTerminalFinalization({ candidates, context: identity, records, lineCount, publishedAt, publishedNotes, body: foreignNotes }), /exactly one successful terminal workflow attempt/);
  const outsidePublishedAt = '2026-08-25T04:59:00.000Z';
  const outsidePending = renderReleaseNotes({ context: identity, files: records, lineCount, startedAt: candidates[0].startedAt, publishedAt: outsidePublishedAt });
  const outsideFinal = renderReleaseNotes({ context: identity, files: records, lineCount, startedAt: candidates[0].startedAt, publishedAt: outsidePublishedAt, completedAt: candidates[0].completedAt, duration: '00:04:00' });
  assert.throws(() => planTerminalFinalization({ candidates, context: identity, records, lineCount, publishedAt: outsidePublishedAt, publishedNotes: outsidePending, body: outsideFinal }), /outside the selected workflow timing bounds/);
  assert.equal(planPriorAttemptFinalization({ candidates, context: identity, records, lineCount, publishedAt, publishedNotes, body: olderNotes }).action, 'noop');
  assert.throws(() => planPriorAttemptFinalization({ candidates, context: identity, records, lineCount, publishedAt: outsidePublishedAt, publishedNotes: outsidePending, body: outsideFinal }), /outside the selected workflow timing bounds/);
  assert.deepEqual(finalizationOutputNames(false), ['pending-release-readback.json', 'release-readback.json']);
  assert.deepEqual(finalizationOutputNames(true), ['release-notes-terminal.md', 'installer-manifest.json', 'release-readback.json']);
});

test('Pages release manifest exposes only an exact verified tagged setup asset', () => {
  const release = {
    id: 41,
    tag_name: 'v1.0.19',
    target_commitish: identity.commit,
    draft: false,
    prerelease: false,
    html_url: 'https://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/tag/v1.0.19',
    published_at: '2026-08-25T05:01:00.000Z',
    assets: [{
      id: 42,
      name: 'HairGrowthEstimatorSetup-1.0.19.exe',
      size: 123,
      state: 'uploaded',
      browser_download_url: 'https://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/download/v1.0.19/HairGrowthEstimatorSetup-1.0.19.exe'
    }]
  };
  const manifest = pagesReleaseManifest({
    repository: 'Ding-Ding-Projects/HairGrowthEstimator',
    release,
    context: identity,
    installer: { setup: { file: 'HairGrowthEstimatorSetup-1.0.19.exe', bytes: 123, sha256: '2'.repeat(64) } },
    terminalBounds: { completedAt: '2026-08-25T05:04:00.000Z', runAttempt: 2 }
  });
  assert.deepEqual(manifest, {
    schemaVersion: 1,
    owner: 'Ding-Ding-Projects',
    repository: 'HairGrowthEstimator',
    tag: 'v1.0.19',
    target: identity.commit,
    version: '1.0.19',
    platform: 'windows-x64',
    filename: 'HairGrowthEstimatorSetup-1.0.19.exe',
    bytes: 123,
    sha256: '2'.repeat(64),
    unsigned: true,
    publication: {
      state: 'published',
      draft: false,
      prerelease: false,
      publishedAt: '2026-08-25T05:01:00.000Z',
      releaseId: 41,
      assetId: 42,
      url: 'https://github.com/Ding-Ding-Projects/HairGrowthEstimator/releases/download/v1.0.19/HairGrowthEstimatorSetup-1.0.19.exe'
    }
  });
  assert.throws(() => pagesReleaseManifest({
    repository: 'Ding-Ding-Projects/HairGrowthEstimator',
    release,
    context: identity,
    installer: { setup: { file: 'HairGrowthEstimatorSetup-1.0.19.exe', bytes: 123, sha256: '2'.repeat(64) } },
    terminalBounds: null
  }), /terminal workflow verification/);
  assert.throws(() => pagesReleaseManifest({
    repository: 'Ding-Ding-Projects/HairGrowthEstimator',
    release: { ...release, assets: [{ ...release.assets[0], browser_download_url: 'https://example.invalid/Setup.exe' }] },
    context: identity,
    installer: { setup: { file: 'HairGrowthEstimatorSetup-1.0.19.exe', bytes: 123, sha256: '2'.repeat(64) } },
    terminalBounds: { completedAt: '2026-08-25T05:04:00.000Z', runAttempt: 2 }
  }), /immutable tagged GitHub download route/);
});

test('catalog unavailability keeps the version releaseable without an invented dish or photo', () => {
  const unavailable = {
    ...identity,
    catalogStatus: 'unavailable',
    catalogUnavailableReason: 'public-catalog-unavailable',
    codeName: null,
    catalogRecord: null,
    catalogSlug: null,
    publicPhotoUrl: null,
    publicPhotoAsset: null
  };
  assert.equal(releaseTitle(unavailable), 'Hair Growth Estimator 1.0.19');
  const notes = renderReleaseNotes({
    context: unavailable,
    files: [],
    lineCount: '| **Grand total** | **All applicable rows** |',
    startedAt: '2026-08-25T05:00:00.000Z'
  });
  assert.match(notes, /Release code name: unavailable/);
  assert.match(notes, /without inventing or copying an image/);
  assert.doesNotMatch(notes, /\]\(null\)/);
});
