# Version and build provenance

## Behavior

Every front screen must show the running version and that exact version's recorded updated-at local date and time, including seconds and timezone. The desktop version comes from package or packaged application metadata. The website version comes from its composed artifact manifest. The timestamp comes from recorded build or release provenance bound to that artifact.

## Configuration

A valid provenance record should include schema version, product version, source commit, build or release instant in UTC, artifact identifier or digest, and generator version. Presentation converts the stable instant to local time and names the timezone.

## Failure modes

- Missing, invalid, stale, or mismatched provenance renders an unavailable state.
- Launch time, file timestamps, current clock values, and hand-entered labels are invalid substitutes.
- A build whose package version differs from its provenance version cannot claim a verified front-screen value.

## Security and privacy

Provenance is public release evidence and must exclude private paths, machine names, user names, internal network details, secrets, environment values, and unredacted build logs.

## Verification

Source inspection confirmed that `scripts/compose-site.mjs` derives the package version, exact 40-character source commit, and updated-at instant, then injects them into `#build-provenance`. The website `renderProvenance` consumer validates semantic version, commit, and timestamp boundaries, displays local time with seconds and timezone on `#front-provenance`, and renders an honest unavailable state when validation fails. The composer source exists, but a composed artifact bound to a verified release has not been exercised. Focused tests, deliberate removal regressions, packaged interaction, website interaction, captures, and deployed-response proof remain pending.

## Suggested articles

- [Status and build provenance](../site/status-and-provenance.md)
- [Release, installation, and updates](release-install-and-updates.md)
- [Website universal-feature inventory](../inventory/site-universal-features.md)
