# Status and build provenance

## Behavior

The initial website screen must show the running version and that version's recorded updated-at local date and time, including seconds and timezone. The values must come from provenance bound to the composed website artifact. Launch time, source-file modification time, or a hand-entered timestamp is not valid provenance.

The website also requires a status surface with current release, latest verified build, known limitations, evidence links, and honest pending states.

## Configuration

Build composition must write a versioned provenance record with source commit, package version, build or release timestamp, and validation status. The front screen localizes the recorded timestamp for display while keeping the underlying instant stable.

## Failure modes

- Missing or invalid provenance displays an unavailable state.
- A version mismatch between package metadata and provenance blocks a verified claim.
- Status values not backed by a real source remain unverified.
- Browser-local visitor settings do not alter artifact provenance.

## Security and privacy

Provenance may include public source commit, version, and release timing. It must exclude private paths, host names, user names, environment values, secrets, and build-machine inventory.

## Verification

The front-screen selectors, embedded JSON placeholder, semantic version, timestamp, commit validation, local-time formatting with seconds and timezone, installer-manifest validation, and status-panel rendering are present in source. `scripts/compose-site.mjs` derives and injects package, commit, timestamp, release-code-name, and optional installer evidence. Composition execution and valid release provenance are pending. Required evidence includes removal of the visible boundary, removal of each provenance field, red then green regression behavior, built-site interaction, capture, and public response inspection.

## Suggested articles

- [Version and build provenance](../operations/version-provenance.md)
- [Release, installation, and updates](../operations/release-install-and-updates.md)
- [Status Hub boundaries](../security/status-hub-boundaries.md)
