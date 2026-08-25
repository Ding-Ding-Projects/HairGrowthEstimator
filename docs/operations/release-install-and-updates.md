# Release, installation, and updates

## Behavior

Windows releases must use genuine Squirrel.Windows packaging and include `Setup.exe`, `RELEASES`, a full `.nupkg`, and generated delta packages where available. Artifacts remain unsigned by policy. The product must state that Windows may show an unknown-publisher or SmartScreen warning.

The installed desktop product must check a configured HTTPS update feed on startup and on a bounded schedule, validate feed metadata and package hashes, download without interrupting active work, and show a persistent non-blocking ready state with exact version, release notes, unsigned-artifact warning, Restart to install update, and Later actions.

## Configuration

`package.json` currently selects the Squirrel target, disables forced code signing, and names `dist/squirrel-windows` as the output directory. A release workflow must build and publish from the pinned source commit, record workflow timing, attach required artifacts, line-count evidence, and public dim-sum metadata, and avoid running tests or lint in GitHub Actions.

## Failure modes

- `assets/app-icon.png` is referenced but was absent from the inspected revision, which blocks packaging.
- No update feed or updater implementation was present in the inspected source.
- The build configuration does not yet explicitly show `signExecutable: false`.
- A setup executable without matching `RELEASES` and package assets is incomplete.
- Release success cannot be inferred from local configuration or an unverified workflow status.

## Security and privacy

Code signing is not used. Integrity depends on HTTPS transport, immutable release assets, published hashes, feed validation, and rollback protections. Update credentials must never enter renderer code, release assets, logs, or source.

## Verification

Local `build.bat`, `build-installer.bat`, complete Squirrel artifacts, unsigned signature inspection, artifact hashes, updater states, release target, downloadable assets, public website link, and final workflow result are pending.

## Suggested articles

- [Release code name and dim-sum record](release-code-name.md)
- [Version and build provenance](version-provenance.md)
- [Home and verified download](../site/home-and-download.md)
- [Status Hub boundaries](../security/status-hub-boundaries.md)
