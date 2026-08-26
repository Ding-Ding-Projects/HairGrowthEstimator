# Windows application and Squirrel.Windows packaging

The repository has two root build scripts. Both fetch and verify exact MinGit, portable Node.js, the lockfile graph, the Electron runtime, and Squirrel helper executables. Both support silent automation and refuse to publish anything.

## Runnable packaged application

Interactive:

```bat
build.bat
```

Silent:

```bat
build.bat /s
```

`build.bat` produces `dist/win-unpacked/Hair Growth Estimator.exe` through the same electron-builder configuration used by release automation. Interactive mode offers to run the packaged executable only after packaging and validation succeed. Silent mode never prompts, pauses, launches a window, or waits for input.

The validator requires:

- a plausible Windows PE executable;
- `resources/app.asar`;
- no Authenticode certificate table;
- package version and source commit equal to the release context;
- every regular `app.asar` file and byte equal to the exact hand-written candidate inventory or documented release transformation, with unexpected root, package, framework, application, and asset paths rejected;
- every packaged server byte equal to the candidate commit;
- a generated icon manifest whose master and output hashes agree;
- all seven canonical icon resources embedded in the executable.

Release transformation never rewrites tracked `app/provenance.json`, `app/release-metadata.json`, `package.json`, or `package-lock.json`. Generated release bytes live under `dist/package-input` and replace only their logical packaged paths. Application, asset, canonical icon, and server inputs are materialized under `dist/package-source` from exact candidate Git blobs, so checkout line-ending conversion cannot change packaged bytes. `dist/package/packaged-app-manifest.json` records the candidate commit, executable and `app.asar` paths and SHA-256 values, logical and staged provenance paths and hashes, the packaged provenance hash, and the verified tracked-source byte-inventory receipt.

The generated electron-builder configuration sets `extraMetadata.version` from the exact release context. This makes the packaged root metadata version agree with staged provenance while tracked `package.json` stays unchanged. The prepack step runs `npm run verify:icons`; icon generation is a separate source-maintenance action and never occurs implicitly during release packaging. `scripts/release/assert-source-preserved.mjs` captures and verifies the tracked tree around packaging, while executable icon editing is limited to generated output.

## Squirrel.Windows installer

Interactive:

```bat
build-installer.bat
```

Silent:

```bat
build-installer.bat /s
```

The expected release family is:

- `HairGrowthEstimator-Setup-<version>-x64.exe`
- `RELEASES`
- one full `.nupkg` for the first release
- `release-manifest.json`
- delta packages after a prior release exists and the configured feed can provide it

Portable-only, ZIP-only, MSI-only, NSIS, MSIX, and other installer families are not supported release substitutes.

The first release has no prior full package, so it must contain exactly one full `.nupkg` and no delta package. This boundary is allowed only for the first release. For each later release, packaging must acquire exactly one full package from the configured earlier non-draft release and independently validate its release identity, tag, target commit, filename, bytes, digest, NuGet identity, and `RELEASES` row before delta generation. Missing, ambiguous, stale, corrupt, or mismatched prior-package evidence fails closed. The release path never silently treats a later build as another first release.

## Icon provenance

`assets/icons/logo-master.svg` is the canonical source. `scripts/core/generate-icons.mjs` uses `sharp` 0.34.3 to produce seven PNG sizes and a multi-resolution `.ico`. `assets/icons/icon-manifest.json` records the master bytes, master SHA-256, renderer version, file sizes, and output hashes.

The package maps the canonical generated files into the application asset paths. Squirrel update metadata uses an immutable raw GitHub URL containing the exact source commit. Because `signAndEditExecutable` remains disabled under the no-signing policy, a separate post-pack step uses the digest-verified Squirrel resource editor only to embed the canonical icon. The same verified step updates `Setup.exe`. The installer validator reads the actual PE resource group and compares all seven icon payload digests with the packaged `.ico`.

## Installer integrity

The installer validator checks:

1. Exact setup filename, version, architecture, minimum shape, SHA-256, unsigned state, and embedded icon resources.
2. Every `RELEASES` row against the named package's byte count and SHA-1.
3. Every package SHA-256 for the stronger release manifest.
4. Exactly one full package for the first release.
5. The full package's NuGet version.
6. The setup executable's embedded bootstrap ZIP contains `Update.exe` and the exact full package bytes named by the validated `RELEASES` entry.
7. The actual application executable and `app.asar` inside the full package.
8. Package, provenance, and release-metadata versions and source commits.
9. Actual application, asset, icon, and server contents against Git blobs from the clean candidate.
10. The complete Windows product release identity matches the logical-run context used by container packaging and publication.

ZIP parsing rejects absolute paths, drive-prefixed paths, parent traversal, duplicate entries, truncated data, unsupported compression, CRC disagreement, and central-directory size disagreement.

## Unsigned release warning

The setup executable and installed application are intentionally unsigned. Users can receive Windows unknown-publisher or SmartScreen warnings. Hashes and release manifests provide transport and package integrity evidence, but they are not a code-signing substitute and are never described as one.

## Failure recovery

Delete only generated `dist/` output after preserving logs, then rerun the same root script. Do not work around a script failure with a direct electron-builder command. Repair the root script or validator so the supported path remains reproducible.

## Suggested articles

- [Dependency inventory and bootstrap](dependency-inventory.md)
- [Provenance, integrity, and line-count evidence](provenance-and-integrity.md)
- [GitHub Actions release automation](automation.md)
