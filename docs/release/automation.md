# GitHub Actions release automation

`.github/workflows/release.yml` runs on every push and on `workflow_dispatch`. A successful logical workflow run publishes exactly one unique, non-draft GitHub Release. Earlier task-branch pushes made before the all-push trigger existed had no workflow run and cannot be claimed retroactively.

## Version identity

The release version is `1.0.<github.run_number>`. A rerun attempt keeps the same logical version and can resume the same staged release. A later workflow run receives a larger run number and therefore a larger version. Product artifact names include both run ID and run attempt.

The Windows job resolves the catalog-backed release context once for the logical run and carries those exact bytes inside its required product artifact. A rerun reuses the earliest valid context bound to the same run ID and candidate commit. The container, publication, and finalization jobs refuse to recompute it. Publication and finalization independently select the newest unexpired Windows and container product for that logical run, then reject any identity disagreement.

## Jobs

| Job | Runner | Purpose |
| --- | --- | --- |
| `windows-package` | `windows-2025` | Build and validate the runnable application and complete Squirrel.Windows family |
| `linux-container` | `ubuntu-24.04` | Build and validate the deterministic OCI archive |
| `publish-release` | `ubuntu-24.04` | Combine validated products, count lines, stage one draft, publish it once, and verify server bytes |
| `finalize-release` | `ubuntu-24.04` | Revalidate the published release while completion timing remains honestly pending |

The dependency order is exactly `windows-package`, then `linux-container`, then `publish-release`, then `finalize-release`. There is no matrix expansion, parallel publication path, or fifth release job.

All third-party actions use reviewed full commit SHAs, and the workflow validator rejects every unreviewed `uses:` entry, wrong revision, or wrong occurrence count. Node.js 22.18.0, npm 10.9.3, GitHub CLI 2.98.0, Docker Engine 29.6.1, and Docker Buildx 0.27.0 are explicit. The committed bootstrap always installs or reuses the exact digest-verified GitHub CLI archive and executable instead of accepting a mutable compatible system version.

## No tests or lint in Actions

The workflow runs no unit, integration, end-to-end, lint, type, coverage, accessibility, or screenshot checks. It builds, packages, validates release integrity, and publishes. This is an explicit delivery tradeoff: a commit whose local tests would fail can still be released because no test verdict exists in Actions. Local checks must be run and reported by the source task, but their verdict never gates the workflow.

Packaging and integrity validation remain part of the build because they determine whether a real release product exists and matches its declared source. They are not presented as product-behavior test coverage.

## Clean candidate boundary

Each build job records a clean candidate marker before release metadata is generated. The marker contains the exact commit, commit epoch, and resolved release-identity digest when available. Release-specific package metadata, application metadata, and provenance are written only below `dist/package-input`. Application, asset, canonical icon, and server inputs are materialized below `dist/package-source` from exact Git blobs at the marked commit before the builder reads them. Tracked source files must remain byte-identical and Git status must remain empty throughout packaging. Any staged, untracked, renamed, deleted, or changed entry fails. The Windows and OCI validators independently compare actual packaged content with Git blobs from the marked commit, and the Windows receipt records the before-and-after tracked-source inventory hash.

## Publication sequence

1. Reuse the earliest valid logical-run context from the Windows product.
2. Query all artifacts for the logical run and independently select the newest unexpired Windows and container product, even when they came from different rerun attempts.
3. Re-run the Squirrel and OCI parsers against the transferred bytes, compare actual packaged contents with candidate Git blobs, and compare both product identities with the reused context.
4. Stage only safe basenames named by the validated Windows and container manifests.
5. Run the committed line counter against the exact source commit.
6. Create or resume one draft release for the unique tag.
7. Upload only missing assets. An existing asset must download and hash identically before it is reused.
8. Verify every server-side asset byte count and SHA-256 by downloading it again.
9. Publish the draft once.
10. Read the exact server publication timestamp, update only that release-note boundary, leave `Workflow completed` and `Workflow duration` explicitly pending, and read the notes back exactly.
11. Run the fourth workflow job to re-download and revalidate the products, tag, non-draft state, pending timing lines, and every release asset. This active job is read-only and never guesses its own completion timestamp.
12. After the workflow reaches a terminal successful state, invoke the committed `scripts/release/finalize-run.mjs` wrapper against the same run and release. The exact public command is `node scripts/release/finalize-run.mjs --repository Ding-Ding-Projects/HairGrowthEstimator --run-id <positive-decimal-run-id> --commit <40-character-lowercase-SHA>`.
13. Retain the fixed terminal transfer described below. The site-consumable installer manifest is withheld until terminal verification succeeds.

The post-run terminal patch is a release-currentness requirement. A release whose notes still say completion is pending is published but not current for final handoff or website download composition. `Workflow completed` is the maximum exact `completed_at` from the selected successful four-job server inventory. The later release mutation and independent readback are a separate fact: the wrapper records the GitHub response `Date` from its last independent release readback as `releaseCurrentnessVerifiedAt` in output-only `release-readback.json`. It never relabels that later instant as workflow completion and never patches the timestamp into the release notes, which would create a self-referential mutation.

The wrapper is a one-shot local execution: its work, staging, release-output, and terminal-transfer directories must all be absent before it starts. It may retain exact earlier terminal notes when the server already carries them, but local output from a completed or interrupted invocation must be inspected and removed before another invocation. Foreign or ambiguous timing text fails closed. The wrapper creates no tag, release, or asset.

## Post-run terminal transfer

The wrapper accepts only the repository identity, positive decimal run ID, and full lowercase candidate SHA shown above. It requires a clean checkout at that exact commit, verifies the origin identity, downloads and revalidates the selected products, finalizes the existing release, and reads the release and server assets back independently.

There is no production destination override. The destination must be absent before the wrapper starts and is fixed at `dist/terminal-transfer`. The wrapper atomically emits exactly these four files:

- `installer-manifest.json`, written only after terminal release currentness is proven;
- `release-context.json`, preserving the logical-run identity;
- `trusted-product-validation.json`, preserving the independently revalidated Windows and container source bindings;
- `terminal-transfer-receipt.json`, binding the other three files by exact sorted filename, byte count, and SHA-256 together with repository, run, attempt, tag, target, and version.

The wrapper rereads the fixed directory and validates the receipt before success. An existing destination, extra or missing payload, wrong file order, invalid JSON, byte-count mismatch, digest mismatch, identity disagreement, nonterminal run, unsuccessful run, wrong origin, or source change fails closed.

When the pinned public catalog is available, the release links the authoritative published dim-sum photo and names its catalog record. It does not copy or attach the catalog image to this repository or its release. Catalog unavailability does not invent a dish or block the build. The release then uses its version alone and records the unavailable state.

## Release assets

The required external release assets are:

- the unsigned Squirrel.Windows setup executable;
- `RELEASES`;
- every full or delta package named by `RELEASES`;
- `release-manifest.json`;
- the OCI archive;
- `container-manifest.json`;
- Markdown and JSON line-count evidence.

## Credentials and permissions

Catalog and artifact reads receive only the job-scoped `secrets.GITHUB_TOKEN` on the exact step that needs it. The broad `secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN` chain appears only on the publication step. Credentials are never printed or written to release evidence. Checkout steps do not persist credentials. Build and in-workflow finalization jobs have read-only contents and Actions access. Only the publication job receives scoped contents write permission. The separate post-run terminal operation receives release write access only when it is deliberately invoked after the run is complete.

## Failure evidence

Six bounded Actions artifacts have distinct roles. Two required product transfers contain the validated Windows and container products. They run only after successful staging, fail when files are absent, and do not ignore upload errors. Four evidence uploads run with `always()`, tolerate missing evidence with a warning, retain data for seven days, and cannot mask an earlier build result. The Windows and container evidence collectors copy only a hand-written safe partial-output inventory and record each copied file's exact source path, path class, byte count, SHA-256, run, attempt, commit, and job outcome. Unknown files, symbolic links, dependency directories, source trees, caches, credentials, and outputs beyond the committed byte and file-count bounds are never copied. This lets a failed-job rerun recreate a missing product transfer without treating failure evidence as a publishable product.

No release is published unless both packaging jobs succeed. A packaging failure can leave a push without a release. A test or lint verdict cannot do so because those checks do not run in Actions.

## Suggested articles

- [Dependency inventory and bootstrap](dependency-inventory.md)
- [Provenance, integrity, and line-count evidence](provenance-and-integrity.md)
- [Windows application and Squirrel.Windows packaging](windows-packaging.md)
