# Changelog

All notable changes are documented here. Dates and immutable commit links are added only when they can be verified.

## Unreleased

Implementation basis before this release-record update: `a4cec62c55804e6e4eb39d4bbf759e83eed2719f`

The release entry cannot truthfully link to its own future integration commit. The final release record must replace this candidate note with the exact immutable commit and release date.

### Added

- A Windows desktop application for hair-growth estimation, haircut resets and history, exact centimetre and inch display, target-date projection, local persistence, private-LAN service access, and managed SSH tunnelling.
- Eight generated male hair-reference stages, their single `assets/hair-growth/stages.json` mapping authority, and a digest-bearing image-sequence manifest.
- English, playful Hong Kong-style Cantonese, and bilingual presentation with independently persisted English and Cantonese funny levels.
- Shared School mode behavior, narrator and voice controls, scheduled settings, startup surprise rules, five independent attention accommodations, local history, notifications, accessibility wiring, and privacy-preserving personal-vocabulary loading.
- A public documentation website with build-bound provenance, responsive layouts, local assets, search and regular-expression tools, contextual appearance controls, visitor-local demonstrations, detailed feature articles, and a deterministic product-logo social preview.
- Versioned Cantonese catalogs containing 250 `ui-core`, 274 `ui-settings`, and 686 `runtime` entries, plus 66 complete documentation mirrors and an explicit localization inventory.
- A frozen built-evidence harness with exact source and package identity, isolated data roots, exact page targeting, per-interaction ledgers, window-only capture, resumable recovery, privacy review, and bounded recording support.
- Reproducible release packaging for a runnable Windows x64 application, an unsigned Squirrel.Windows installer family, and a deterministic Linux amd64 OCI archive.
- Push and manual-dispatch workflows for release packaging and GitHub Pages deployment. The workflows contain packaging and publication validation only, with no test or lint jobs.
- Dependency bootstrap, source-preservation, provenance, icon, line-count, safe-output, terminal-transfer, installer, container, and publication validators.

### Fixed

- Desktop, core, and website calculations now use one average Gregorian month, `365.2425 / 12 = 30.436875 days`, for current-length and projected-target calculations.
- The adjustable 1.0 cm per month default remains explicitly non-medical and subject to meaningful individual variation.
- The active baseline now comes from the newest valid remaining haircut while preserving the independent manual fallback.
- Future manual baselines and haircut dates are rejected, and legacy future haircut records remain visible without becoming active.
- Same-origin website writes now use monotonic revisions, per-document writer identity, Web Locks or IndexedDB serialization, storage-event reconciliation, and visible stale-write refusal.
- CSV and TSV exports now contain normalized JSON Pointer rows, typed values, and explicit representation and privacy metadata.
- Strict personal-vocabulary, browser-state, appearance, stored-envelope, and import validation now fail closed without partial application.
- Browser regular-expression work runs in bounded disposable Workers with queue recovery after construction or message-send failure.
- School-sensitive overlays close when School mode hides their targets, filtered tabs restore focus safely, and managed context menus return focus to their opener.
- Release-bound website composition accepts only the fixed four-file terminal transfer and independently revalidates the successful workflow attempt, release identity, published release, Setup asset, and source bindings.
- Terminal transfer receipts now distinguish the originating `contextRunAttempt` from a later successful `terminalRunAttempt`.
- Root build scripts send timing events through a fresh helper batch context, avoiding repeated same-file label lookup failures on Windows.
- Packaged application validation now reads nested ASAR entries with the host path separator and proves the behavior with a real temporary archive.
- Application, asset, canonical icon, and server package inputs now come from an exact candidate Git-blob snapshot, so checkout line-ending conversion cannot alter release bytes.
- Setup icon validation now verifies the canonical primary executable icon group while retaining the Squirrel installer groups used by the packaged bootstrapper.
- Setup icon replacement now uses in-process resource editing with collision-free icon ids, validates the complete icon-resource graph, preserves auxiliary Squirrel groups byte for byte, and stages a verified custom Squirrel vendor directory so the embedded updater receives the same canonical icon without mutating installed dependencies.
- Squirrel package validation now accepts strictly formed explicit ZIP directory records while retaining traversal, alias, type, payload, and ancestor-conflict refusal.
- Installer validation now reads `Update.exe` from the outer Setup bootstrap payload, where Squirrel places it, while validating the full `.nupkg` independently without requiring a nonexistent inner updater.
- Container builds now materialize `Dockerfile` and every server input from exact candidate Git blobs before both reproducibility builds, preventing checkout line-ending conversion from changing OCI payload bytes.

### Security and privacy

- No analytics, trackers, remote fonts, or CDN runtime assets are included.
- The website declares a static Content Security Policy and permits local model connections only to the documented loopback origins.
- Private visitor state remains local to the browser profile and is excluded from public records and ordinary exports.
- Personal-vocabulary data is supplied only through an external private file, is validated before use, and is never committed to this repository.
- Scheduled network destinations, service credentials, IPC channels, evidence paths, installer inputs, and update metadata use bounded fail-closed validation.
- Release builds require a clean candidate and prove tracked source bytes remain unchanged during packaging.
- Windows executables are intentionally unsigned. Release hashes and manifests provide integrity evidence but are not a code-signing substitute.
- The OCI service archive uses a digest-pinned base, a non-root account, source-bound server bytes, and documented read-only runtime restrictions.

### Locally verified source state

- Core application checks: 349 passed, 2 explicitly skipped, 0 failed.
- Website checks at the integrated candidate: 53 passed, 2 explicitly skipped because optional external private sources were absent, 0 failed.
- A separate website run with the current private vocabulary supplied through its external value-free path reported 55 passed, 0 failed, and 0 skipped.
- Evidence-harness checks: 30 passed, 0 failed, plus 18 of 18 JavaScript syntax checks.
- Release-packaging checks: 86 passed, 0 failed.
- Localization checks prove all three catalog counts and all 66 article pairs, including deliberate catalog-entry deletion and article-mirror omission failures before restoration.
- The strict hair-asset fixture composes all eight canonical stages, rejects a changed image at the SHA-256 boundary, and succeeds again after restoration.
- The evidence harness and release packaging are source and contract verified. They have not yet produced final user-facing capture or release evidence.

### Pending release evidence

- Build the final runnable application, unsigned Squirrel.Windows installer family, and OCI archive from the final clean commit.
- Drive the packaged application and composed website through the approved off-screen route.
- Capture every required surface and commit the real screen recording.
- Replace the README capture plan with the complete real, non-collapsed capture set.
- Publish and verify one unique non-draft GitHub release and all required downloadable assets.
- Deploy GitHub Pages, verify the served Open Graph response and anonymous image fetch, and set the repository homepage.
- Deploy the private-LAN service only after the final container bytes and target host state are revalidated.
- Complete integration ancestry proof and remove only proven task-owned merged branches and worktrees.
