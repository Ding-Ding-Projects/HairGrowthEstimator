# Status and build provenance

## Behavior

The initial website screen must show the running version and that version's recorded updated-at local date and time, including seconds and timezone. The values must come from provenance bound to the composed website artifact. Launch time, source-file modification time, or a hand-entered timestamp is not valid provenance.

The website also requires a status surface with current release, latest verified build, known limitations, evidence links, and honest pending states.

## Configuration

Build composition writes one of two explicit provenance sources. An absent terminal transfer produces tracked package version plus commit time and no installer. A complete terminal transfer produces the exact terminal release version plus canonical publication time only after all four local records, copied hashes, context identity, GitHub release metadata, and downloaded Setup bytes validate. The front screen localizes the recorded timestamp while keeping the underlying instant stable.

## Failure modes

- Missing or invalid provenance displays an unavailable state.
- A mismatch among release manifest, context, receipt, exact commit, or external release readback blocks a verified claim. Static package metadata is not the release identity.
- Status values not backed by a real source remain unverified.
- Browser-local visitor settings do not alter artifact provenance.

## Security and privacy

Provenance may include public source commit, version, and release timing. It must exclude private paths, host names, user names, environment values, secrets, and build-machine inventory.

## Verification

The front-screen selectors, embedded JSON placeholder, semantic version, timestamp, commit and source validation, local-time formatting with seconds and timezone, installer validation, and status-panel rendering are present in source. `scripts/compose-site.mjs` now derives release-bound version and updated-at from the verified terminal installer instead of static package metadata. Its four focused terminal checks were deliberately red 4 of 4, then restored to 4 passed, 0 failed, and 0 skipped. Ordinary composition without the transfer also passed and kept `installer: null`. Real terminal-release composition, built-site interaction, capture, and public response inspection remain pending.

## Suggested articles

- [Version and build provenance](../operations/version-provenance.md)
- [Release, installation, and updates](../operations/release-install-and-updates.md)
- [Status Hub boundaries](../security/status-hub-boundaries.md)
