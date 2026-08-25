'use strict';

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function validateProvenance(value, packageVersion) {
  const unavailable = (reason) => ({
    available: false,
    reason,
    version: SEMVER.test(String(packageVersion || '')) ? packageVersion : null,
    updatedAt: null,
    commit: null,
    timestampSource: 'unavailable'
  });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable('Build provenance is missing.');
  if (value.schemaVersion !== 1) return unavailable('Build provenance uses an unsupported schema.');
  if (!SEMVER.test(String(value.version || ''))) return unavailable('Build provenance contains an invalid version.');
  if (value.version !== packageVersion) return unavailable('Build provenance does not match the running package version.');
  if (!/^[0-9a-f]{40}$/.test(String(value.commit || ''))) return unavailable('Build provenance contains an invalid commit.');
  if (typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))) {
    return unavailable('Build provenance contains an invalid updated-at timestamp.');
  }
  if (!['BUILD_UPDATED_AT', 'SOURCE_DATE_EPOCH', 'git-commit-committer-date'].includes(value.timestampSource)) {
    return unavailable('Build provenance contains an unknown timestamp source.');
  }
  return {
    available: true,
    reason: null,
    version: value.version,
    updatedAt: new Date(value.updatedAt).toISOString(),
    commit: value.commit,
    timestampSource: value.timestampSource,
    signing: value.signing === 'unsigned' ? 'unsigned' : 'unknown'
  };
}

module.exports = { validateProvenance };
