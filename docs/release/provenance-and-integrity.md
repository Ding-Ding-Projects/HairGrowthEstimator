# Provenance, integrity, and line-count evidence

Release evidence is bound to the artifact that was actually built. A metadata file claiming a commit is not accepted as proof by itself.

## Candidate source binding

Before packaging, `scripts/release/assert-clean-candidate.mjs` requires an empty porcelain status and records the exact commit, commit epoch, and release-identity digest when a resolved context already exists. A continuation on the same commit also requires an empty status. Release-specific `package.json`, `app/release-metadata.json`, and `app/provenance.json` bytes are generated only below `dist/package-input`; the staged lockfile is build input and is not mapped into `app.asar`. `scripts/release/assert-source-preserved.mjs` hashes every tracked file before packaging and requires every path and byte to remain identical afterward. Any staged, untracked, renamed, deleted, changed, or tampered source entry stops packaging.

The generated electron-builder configuration sets `extraMetadata.version` from the resolved release context, so the packaged root metadata and staged provenance carry the same version without editing tracked `package.json`. Before packaging, `npm run verify:icons` checks the committed master, generated PNG and ICO outputs, manifest hashes, dimensions, and multiresolution icon inventory. Packaging does not regenerate tracked icon files. After resource editing touches only generated executable output, `scripts/release/assert-source-preserved.mjs` proves tracked source remains byte-identical.

For `app.asar`, the expected inventory covers:

- every packaged `app/` file;
- every packaged non-generated asset;
- canonical icon outputs mapped from `assets/icons/` into runtime asset paths;
- `package.json` with only the release version transformation;
- `app/provenance.json` derived from the candidate commit;
- `app/release-metadata.json` with only the documented release-context transformation.

The validator enumerates every regular file in the actual archive, including paths outside the expected `app/`, `assets/`, and root package record. The full actual set must equal the hand-written expected set. A missing file, unexpected framework or package file, extra uncommitted file, or one-byte difference fails validation.

The server is checked twice: once in the Windows package's `resources/server/` tree and once in the final `/opt/hair-growth/server/` files reconstructed from the OCI layers. Both must equal the candidate Git blobs.

Each `sourceBinding.appAsar` and `sourceBinding.server` receipt uses the same closed schema. It contains `fileCount`, `bytes`, `inventorySha256`, and the complete `files` array. Each file record contains exactly `path`, `source`, `bytes`, and `sha256`, in packaged-path sort order. The validator requires `fileCount === files.length`, requires the aggregate byte count to equal the sum of every record, and refuses an empty inventory. It recomputes `inventorySha256` as SHA-256 over the UTF-8 concatenation of every sorted record in this exact form:

```text
<path>\0<bytes>\0<sha256>\n
```

The descriptive `source` value remains visible in each record but is not part of the aggregate hash. This lets an independent consumer recalculate the same inventory digest without trusting a claimed summary.

## Windows manifest

`release-manifest.json` records:

- schema and installer family;
- version, source commit, platform, and architecture;
- setup filename, bytes, SHA-256, unsigned state, and embedded icon identity;
- the setup bootstrap payload's exact embedded full-package filename, bytes, and SHA-256;
- `RELEASES` filename, bytes, and SHA-256;
- every package filename, type, bytes, SHA-1, and SHA-256;
- embedded application executable and `app.asar` hashes;
- release code name and catalog record;
- exact source-binding file counts, byte totals, per-file hashes, and aggregate inventory hashes.
- the complete logical-run release identity, including catalog status, pinned catalog commit and blob, candidate commit, version, and container transport filename.

SHA-1 remains present because the Squirrel `RELEASES` format requires it. SHA-256 is recorded independently for release integrity.

## OCI manifest

`container-manifest.json` records:

- version, source commit, creation time, and source epoch;
- immutable base name, multi-platform index digest, and selected `linux/amd64` manifest digest;
- platform, image digest, config digest, and layer count;
- non-root and read-only runtime requirements;
- archive filename, format, bytes, and SHA-256;
- declared build input hashes;
- actual OCI server source-binding evidence.
- descriptor media-type, digest, and byte-length validation plus the two-build reproducibility result.

## Line counting

Run:

```text
npm run count-lines
```

For a release commit:

```text
node scripts/core/count-lines.mjs --commit <full-commit> --markdown line-count.md --json line-count.json
```

The committed counter reads the named Git commit rather than the working directory. It reports project source, tests, styles and markup, scripts and configuration, documentation, generated text, generated image binaries, lockfiles, and other binaries. Its hand-written extensionless inventory includes `.gitignore` and `Dockerfile`, so they cannot disappear from a suffix-based discovery pass. Project, excluded, and grand totals remain visible together.

Total and non-blank text lines are separate. Binary files contribute bytes and file counts but zero text lines. Generated files, dependencies, lockfiles, and binary assets do not inflate the project-code total.

Surviving-line authorship comes from `git blame`. A line is classified as agent-authored when its commit author is `Claude Fable 5`, its commit author ends in `[bot]`, or its commit contains the exact `Claude Fable 5` co-author trailer. Every other surviving line is classified as human-authored. Attribution totals must equal line totals for every aggregate, or the counter fails.

## Release timing

The active workflow records the normalized earliest server job start and the exact server publication time. It publishes `Workflow completed: pending terminal run verification` and `Workflow duration: pending terminal run verification` because a running finalizer cannot know its own terminal timestamp.

After the workflow completes successfully, the terminal helper reads each GitHub Actions run attempt through the attempt-specific job endpoint. It validates the exact run ID, source commit, run number, version, four job names, job IDs, and attempt lineage. Failed or skipped historical jobs may contribute retry history but never become selected successful timing bounds. The helper patches only the two pending completion lines, calculates stable `HH:mm:ss`, and reads the same release back exactly. Exact earlier terminal notes are retained without a second patch. Foreign, ambiguous, or unbound timing text fails.

Only terminal mode writes `installer-manifest.json`. That file exactly matches the website composer's strict owner, repository, tag, target, version, platform, filename, bytes, SHA-256, unsigned, and nested publication schema. Active workflow verification writes only pending readback evidence, so a website build cannot accidentally expose a download before terminal release currentness is proven.

## First-release delta boundary

The first release has no prior full package from which to derive a meaningful update delta. It must publish exactly one full package and no delta package. Release metadata records this as `first-release-no-previous-package` and marks the feed as required after the first release.

For every later release, the packaging path must acquire exactly one prior full package from the configured earlier non-draft release. Before delta generation, it must verify the prior release identity, tag and target binding, expected full-package filename, downloaded byte count and digest, NuGet package identity, and its validated `RELEASES` row. It must then validate every generated delta row and package against the new release manifest. A missing release, no matching full package, multiple candidates, stale target, failed download, or any size, hash, name, version, or feed disagreement fails closed. A later release never falls back silently to a full-only feed.

## Suggested articles

- [GitHub Actions release automation](automation.md)
- [Windows application and Squirrel.Windows packaging](windows-packaging.md)
