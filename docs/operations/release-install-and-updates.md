# Release, installation, and updates

## Behavior

Windows releases must use genuine Squirrel.Windows packaging and include `Setup.exe`, `RELEASES`, a full `.nupkg`, and generated delta packages where available. Artifacts remain unsigned by policy. The product must state that Windows may show an unknown-publisher or SmartScreen warning.

The installed desktop product must check a configured HTTPS update feed on startup and on a bounded schedule, validate feed metadata and package hashes, download without interrupting active work, and show a persistent non-blocking ready state with exact version, release notes, unsigned-artifact warning, Restart to install update, and Later actions.

## Configuration

`package.json` currently selects the Squirrel target, disables forced code signing, and names `dist/squirrel-windows` as the output directory. A release workflow must build and publish from the pinned source commit, record workflow timing, attach required artifacts, line-count evidence, and public dim-sum metadata, and avoid running tests or lint in GitHub Actions.

The website consumes one immutable installer-manifest schema through composer-side `optionalInstaller` and `validateInstallerManifest`. `MAX_INSTALLER_MANIFEST_BYTES` limits the JSON input to 65,536 bytes, and a fatal UTF-8 `TextDecoder` rejects malformed text before parsing. The exact 12-field record binds schema version 1, owner, repository, product version, composed commit, version tag, `windows-x64`, a safe versioned executable filename no longer than 160 characters, a positive asset size no larger than 2 GiB, lowercase SHA-256 digest, explicit unsigned status, and a published non-draft release record with a string publication time, release ID, asset ID, and exact immutable GitHub release-asset URL. The composer rejects missing, unknown, mismatched, mutable, draft, oversized, invalidly encoded, or malformed values before embedding any installer record.

The browser does not rely on the composer alone. `isValidProvenance` validates the exact build record, and `isValidInstallerManifest` revalidates the complete installer and publication contract against it. The runtime repeats the escaped package-version tag match, filename and asset-size limits, digest, unsigned state, publication types and IDs, and immutable URL before `renderProvenance` enables a download.

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

Source inspection confirmed composer-side `MAX_INSTALLER_MANIFEST_BYTES`, fatal UTF-8 decoding, `validateInstallerManifest`, exact field matching, package-version and commit binding, immutable-host and release-identity checks, a 2 GiB asset-size ceiling, unsigned status, and published non-draft release metadata. Runtime `isValidProvenance` and `isValidInstallerManifest` repeat the complete contract. The focused repair proof deliberately removed the bounded decoder and let a 65,536-byte-overrun fixture through, and separately removed the runtime's exact escaped-version tag match, 160-character filename bound, and string-only publication-time check. The affected checks were red before restoration and passed afterward as part of the three-check run with 0 failed and 0 skipped. A real embedded manifest, local `build.bat`, `build-installer.bat`, complete Squirrel artifacts, unsigned signature inspection, artifact hashes, updater states, release target, downloadable assets, public website link, and final workflow result remain pending.

## Suggested articles

- [Release code name and dim-sum record](release-code-name.md)
- [Version and build provenance](version-provenance.md)
- [Home and verified download](../site/home-and-download.md)
- [Status Hub boundaries](../security/status-hub-boundaries.md)
