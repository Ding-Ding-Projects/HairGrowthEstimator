# Release, installation, and updates

## Behavior

Windows releases must use genuine Squirrel.Windows packaging and include `Setup.exe`, `RELEASES`, a full `.nupkg`, and generated delta packages where available. Artifacts remain unsigned by policy. The product must state that Windows may show an unknown-publisher or SmartScreen warning.

The installed desktop product must check a configured HTTPS update feed on startup and on a bounded schedule, validate feed metadata and package hashes, download without interrupting active work, and show a persistent non-blocking ready state with exact version, release notes, unsigned-artifact warning, Restart to install update, and Later actions.

## Configuration

`package.json` currently selects the Squirrel target, disables forced code signing, and names `dist/squirrel-windows` as the output directory. A release workflow must build and publish from the pinned source commit, record workflow timing, attach required artifacts, line-count evidence, and public dim-sum metadata, and avoid running tests or lint in GitHub Actions.

The website consumes a release only from the exact four-file `dist/terminal-transfer` directory. Installer, release-context, and terminal-receipt JSON inputs are each bounded to 65,536 bytes, and trusted product validation is bounded to 16,777,216 bytes for its complete sorted source-binding arrays. Fatal UTF-8 decoding, closed schemas, copied-file byte counts and hashes, exact logical-run identity, exact composed commit, nested application and server bindings, container binding, and terminal publication metadata must all agree. The receipt separates the originating `contextRunAttempt` from the `terminalRunAttempt` that completed publication. A rerun may make the terminal value later. The composer queries the exact GitHub Actions run-attempt record and verifies its run, attempt, commit, repository, completed status, and successful conclusion. Job-name topology is not part of this consumer proof. A partial directory is rejected, while a wholly absent directory produces honest package-and-commit provenance with no installer URL.

The release version comes from the verified terminal installer and may validly be `1.0.<run number>` while tracked package metadata remains `1.0.0`. Updated-at comes from canonical `publication.publishedAt`, never source metadata or composition time. The composer independently rereads the tagged GitHub release and downloads the Setup asset to recheck its byte count and SHA-256. The browser then revalidates the release-bound provenance source, exact tag, filename and size limits, digest, unsigned state, publication fields and IDs, and immutable URL before `renderProvenance` enables a download.

## Failure modes

- `assets/app-icon.png` is referenced but was absent from the inspected revision, which blocks packaging.
- No update feed or updater implementation was present in the inspected source.
- The build configuration does not yet explicitly show `signExecutable: false`.
- A setup executable without matching `RELEASES` and package assets is incomplete.
- A mutable latest-release URL, unapproved asset host, missing asset size, extra field, or mismatched release identity leaves the website download state unavailable.
- Release success cannot be inferred from local configuration or an unverified workflow status.

## Security and privacy

Code signing is not used. Integrity depends on HTTPS transport, immutable release assets, published hashes, feed validation, and rollback protections. Update credentials must never enter renderer code, release assets, logs, or source.

## Verification

Source inspection confirmed the fixed transfer path, exact four-file inventory, every byte bound, fatal UTF-8 decoding, closed schemas, source-binding record validation, receipt hashes, separate context and terminal attempt identities, external GitHub Actions attempt readback, release/context identity, exact composed target, independent GitHub release metadata, and downloaded Setup-byte verification. Runtime `isValidProvenance` and `isValidInstallerManifest` repeat the embedded release contract. The focused suite was deliberately red 4 of 4 before implementation for a static-version contradiction, target mismatch, stale or incomplete receipt, and missing manifest. A later unequal-attempt fixture deliberately turned red 1 of 1, then restoration reported 4 passed, 0 failed, and 0 skipped. A real terminal transfer, local `build.bat`, `build-installer.bat`, complete Squirrel artifacts, unsigned signature inspection, updater states, public website link, and final workflow result remain pending.

## Suggested articles

- [Release code name and dim-sum record](release-code-name.md)
- [Version and build provenance](version-provenance.md)
- [Home and verified download](../site/home-and-download.md)
- [Status Hub boundaries](../security/status-hub-boundaries.md)
