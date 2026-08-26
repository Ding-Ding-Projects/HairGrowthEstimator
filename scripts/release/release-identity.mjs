import crypto from 'node:crypto';

const fields = [
  'version',
  'tag',
  'commit',
  'createdAt',
  'runId',
  'runAttempt',
  'catalogStatus',
  'catalogUnavailableReason',
  'codeName',
  'catalogRecord',
  'catalogSlug',
  'catalogCommit',
  'catalogBlobSha',
  'catalogBytes',
  'publicPhotoUrl',
  'publicPhotoAsset',
  'containerArchive'
];

export function releaseIdentity(context) {
  const identity = Object.fromEntries(fields.map((field) => [field, context?.[field] ?? null]));
  if (!/^\d+\.\d+\.\d+$/.test(identity.version || '') || identity.tag !== `v${identity.version}` || !/^[0-9a-f]{40}$/.test(identity.commit || '')) {
    throw new TypeError('Release identity version, tag, or candidate commit is invalid.');
  }
  if (Number.isNaN(Date.parse(identity.createdAt)) || !/^[0-9a-f]{40}$/.test(identity.catalogCommit || '') || !/^[0-9a-f]{40}$/.test(identity.catalogBlobSha || '')) {
    throw new TypeError('Release identity catalog provenance is invalid.');
  }
  if (!Number.isSafeInteger(identity.catalogBytes) || identity.catalogBytes < 1) {
    throw new TypeError('Release identity catalog byte count is invalid.');
  }
  if (identity.catalogStatus === 'resolved') {
    if (identity.catalogUnavailableReason !== null || !/^hk-dish-\d{4}$/.test(identity.catalogRecord || '') || typeof identity.codeName !== 'string' || !identity.codeName.includes(' · ')) {
      throw new TypeError('Resolved release identity catalog presentation is invalid.');
    }
    const photo = new URL(identity.publicPhotoUrl);
    if (photo.protocol !== 'https:' || photo.username || photo.password || identity.publicPhotoAsset !== photo.pathname.split('/').at(-1)) {
      throw new TypeError('Resolved release identity catalog photo is invalid.');
    }
  } else if (
    identity.catalogStatus !== 'unavailable'
    || identity.catalogUnavailableReason !== 'public-catalog-unavailable'
    || [identity.codeName, identity.catalogRecord, identity.catalogSlug, identity.publicPhotoUrl, identity.publicPhotoAsset].some((value) => value !== null)
  ) {
    throw new TypeError('Unavailable release identity must contain no invented catalog presentation.');
  }
  if (
    (identity.runId === null) !== (identity.runAttempt === null)
    || (identity.runId !== null && (!/^[1-9]\d*$/.test(String(identity.runId)) || !/^[1-9]\d*$/.test(String(identity.runAttempt))))
  ) {
    throw new TypeError('Release identity logical run ID or originating attempt is invalid.');
  }
  return identity;
}

export function releaseIdentitySha256(identity) {
  return crypto.createHash('sha256').update(`${JSON.stringify(releaseIdentity(identity))}\n`).digest('hex');
}

export function assertMatchingReleaseIdentity(expectedContext, ...records) {
  const expected = releaseIdentity(expectedContext);
  const serialized = JSON.stringify(expected);
  for (const record of records) {
    if (JSON.stringify(releaseIdentity(record)) !== serialized) throw new TypeError('Release products disagree on catalog or candidate identity.');
  }
  return expected;
}
