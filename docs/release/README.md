# Release and packaging

This category documents the reproducible build, Windows installer, OCI container archive, dependency bootstrap, release automation, and integrity evidence for Hair Growth Estimator.

## Articles

- [Dependency inventory and bootstrap](dependency-inventory.md)
- [Windows application and Squirrel.Windows packaging](windows-packaging.md)
- [OCI container packaging](container-packaging.md)
- [GitHub Actions release automation](automation.md)
- [Provenance, integrity, and line-count evidence](provenance-and-integrity.md)

## Supported release products

| Product | Platform | Format | Primary evidence |
| --- | --- | --- | --- |
| Desktop application | Windows x64 | Runnable packaged directory | `dist/package/packaged-app-manifest.json` |
| Desktop installer | Windows x64 | Genuine Squirrel.Windows `Setup.exe`, `RELEASES`, and full `.nupkg` | `dist/squirrel-windows/release-manifest.json` |
| Hair-length service | Linux amd64 | OCI image layout tar archive | `dist/container/container-manifest.json` |

All Windows executables are intentionally unsigned. Windows can display an unknown-publisher or SmartScreen warning. The release process never discovers, requests, generates, or uses a code-signing certificate.

## Release workflow shape

The workflow runs on every push and every `workflow_dispatch` invocation. Each run enters one four-job release path in this exact order:

1. `windows-package` builds and validates the runnable Windows application and Squirrel.Windows family.
2. `linux-container` builds the deterministic Linux OCI archive after the Windows product is available.
3. `publish-release` validates both transferred products and publishes one unique, non-draft release.
4. `finalize-release` performs read-only verification while terminal completion timing remains pending.

After a successful workflow run reaches its terminal state, the committed post-run wrapper patches that same release once and emits the website-safe handoff below `dist/terminal-transfer`. Earlier task-branch pushes made before the workflow supported all pushes did not create runs and cannot be presented as retroactive release evidence.

The first release has no prior full package. It therefore contains exactly one full Squirrel package and no delta package. Every later release must acquire one independently verified prior full package from the configured earlier non-draft release before it generates a delta. Missing, ambiguous, or mismatched prior-release evidence fails closed instead of silently publishing a later full-only update feed.

## Failure behavior

Build scripts exit nonzero on the first unresolved dependency, packaging, provenance, icon, signing-policy, or integrity problem. A successful packaging command is not enough by itself. Each product must also pass its committed validator and produce its manifest before it can be staged for a release.

## Security summary

- Tool archives and executable build helpers have pinned SHA-256 values.
- npm dependencies are installed from `package-lock.json` with integrity verification.
- Windows code signing is disabled and the absence of an Authenticode certificate table is verified.
- Release builds start from a clean commit and compare packaged bytes with Git blobs from that exact commit.
- The service image uses a digest-pinned base, a non-root account, and documented read-only runtime constraints.
- Release publication stages only allowlisted, already validated files.

## Suggested articles

- [GitHub Actions release automation](automation.md)
- [Provenance, integrity, and line-count evidence](provenance-and-integrity.md)
