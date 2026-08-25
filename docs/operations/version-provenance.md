# Version and build provenance

## Behavior

Every front screen must show the running version and that exact version's recorded updated-at local date and time, including seconds and timezone. The desktop version comes from package or packaged application metadata. The website version comes from its composed artifact manifest. The timestamp comes from recorded build or release provenance bound to that artifact.

## Configuration

A valid provenance record includes schema version, product version, source commit, build or release instant in UTC, artifact identity, and the source of that claim. Without a terminal transfer, the website uses tracked package metadata and commit time and embeds no installer. With a verified terminal transfer, version comes from the immutable installer and matching release context, while updated-at comes from canonical `publication.publishedAt`. Presentation converts that stable instant to local time and names the timezone.

## Failure modes

- Missing, invalid, stale, or mismatched provenance renders an unavailable state.
- Launch time, file timestamps, current clock values, and hand-entered labels are invalid substitutes.
- A release whose terminal manifest, context, transfer receipt, exact commit, or GitHub readback disagrees cannot claim a verified front-screen value. A tracked `1.0.0` source version does not invalidate a verified `1.0.<run number>` terminal release.

## Security and privacy

Provenance is public release evidence and must exclude private paths, machine names, user names, internal network details, secrets, environment values, and unredacted build logs.

## Verification

Source inspection confirmed that `scripts/compose-site.mjs` supports the honest package-and-commit fallback and the fixed four-file terminal path. The release-bound path validates closed schemas, exact copied hashes, complete nested source bindings, run identity, target commit, release metadata, and downloaded Setup bytes before deriving version and updated-at. The website `renderProvenance` consumer validates semantic version, commit, source, timestamp, and installer agreement, displays local time with seconds and timezone on `#front-provenance`, and renders an honest unavailable state when validation fails. The focused terminal suite was deliberately red 4 of 4, then green with 4 passed, 0 failed, and 0 skipped after restoration. A real terminal release, built interaction, captures, and deployed-response proof remain pending.

## Suggested articles

- [Status and build provenance](../site/status-and-provenance.md)
- [Release, installation, and updates](release-install-and-updates.md)
- [Website universal-feature inventory](../inventory/site-universal-features.md)
