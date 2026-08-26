# Handoff

## Candidate identity

The completed integration reached local and remote `main` at `1ea6215d9ca27d6f66c61ec2a56696567daddb6e` before the follow-up workflow repair recorded below. The most recent runnable local package remains bound to `da7b68baa89678e3ca3d45188f122c379eccc8c4`.

This candidate contains four completed source milestones:

1. The complete public documentation website and localization sources.
2. The desktop, service, and shared calculation core with all eight generated hair-reference stages.
3. The frozen built-evidence harness.
4. Reproducible Windows, Squirrel.Windows, OCI, release, and GitHub Pages packaging sources.

A runnable unsigned Windows package was rebuilt from the recorded package candidate. Deterministic OCI and Squirrel.Windows products exist only as earlier local milestones. No complete screen capture set, screen recording, release verification, live-site response verification, or host deployment is claimed by this handoff.

## Post-integration workflow repair

The completed integration reached local and remote `main` at `1ea6215d9ca27d6f66c61ec2a56696567daddb6e`. GitHub Pages was enabled for the existing workflow source, and retry attempt 2 of run `32938126796` completed successfully.

Release run `32938126818` stopped before packaging because the icon verifier compared checkout-sensitive line endings in `assets/icons/icon-manifest.json`. The repair canonicalizes the SVG master and JSON manifest to LF at the verification boundary and adds an LF-versus-CRLF regression with an explicitly corrupted-manifest rejection. The same focused pass also repaired older workflow-contract mutation fixtures whose LF-only replacement could silently miss CRLF source.

Focused local verification after the repair reported 16 of 16 release-contract checks and 7 of 7 PNG icon sizes plus the multi-resolution ICO passing. The public-boundary scan covered 323 tracked files and 24 commits with no private-vocabulary findings. This is source verification for the follow-up repair, not a shipped-release claim.

The proven merged integration, website, website-repair, and narrow instruction-repair worktrees and branches were removed after their tips were verified as ancestors of their respective remote `main` branches. Four source branches containing intentionally excluded unsafe history remain preserved and are not cleanup candidates.

## Integrated product scope

The candidate includes:

- Exact centimetre and inch conversion using `1 in = 2.54 cm`.
- One shared average Gregorian estimate month, `365.2425 / 12 = 30.436875 days`, consumed by desktop, core, and website current-length and projected-target calculations.
- An adjustable 1.0 cm per month non-medical planning default with an individual-variation disclosure.
- Newest-valid-haircut baseline selection, retained manual fallback, future-date refusal, haircut history, and normalized exports.
- Eight generated male hair-reference PNG files, one stage mapping authority, and digest-bearing manifests.
- Local persistence, optional HTTP synchronization, private-LAN operation, and managed SSH tunnelling.
- English, playful Hong Kong-style Cantonese, bilingual presentation, independent funny levels, shared School mode, narrator controls, schedules, startup surprise, and five attention accommodations.
- Strict personal-vocabulary, state, appearance, export, network, IPC, evidence, updater, and release boundaries.
- A responsive documentation website with local assets, provenance, navigation, search, contextual tools, accessibility structure, and explicit browser limitations.
- A frozen off-screen evidence route with source and package binding, isolated data, exact page and window targeting, per-interaction ledgers, privacy review, recording, and recovery.
- Reproducible release paths for the Windows application, unsigned Squirrel.Windows installer family, Linux amd64 OCI archive, one non-draft GitHub release, and GitHub Pages deployment.

## Verification accepted at this candidate

| Area | Accepted local result | Boundary |
| --- | ---: | --- |
| Core | 349 passed, 2 explicitly skipped, 0 failed | Source behavior and strict boundaries |
| Website, integrated environment | 53 passed, 2 explicitly skipped, 0 failed | Source, composition, structure, and optional external-source skips |
| Website, external private vocabulary supplied | 55 passed, 0 failed, 0 skipped | Complete source suite with value-free external currentness |
| Evidence harness | 31 passed, 0 failed | Plan, identity, process, ledger, recovery, client-only capture, outer-window geometry, and recording contracts |
| Evidence JavaScript syntax | 18 of 18 passed | Every evidence JavaScript file |
| Release packaging | 87 passed, 0 failed | Windows, Squirrel.Windows, staged updater provenance, self-contained packaged receipts, OCI, workflow, source-binding, safe-output, and publication contracts |

Additional accepted facts:

- The three Cantonese catalogs contain 250, 274, and 686 entries.
- All 66 English documentation articles have one validated Cantonese mirror.
- Deliberate catalog-entry deletion and article-mirror omission turn the localization checks red before restoration.
- The strict asset fixture composes all eight hair stages, rejects one changed image by SHA-256, and succeeds after restoration.
- Desktop and core month calculations use `app/shared/hair.js`; website calculations use `site/state-contract.js`.
- The evidence harness has a self-contained package receipt and a verified client-only capture geometry contract, but no interaction step or screenshot has completed human pixel inspection.
- The current runnable package is bound to `da7b68baa89678e3ca3d45188f122c379eccc8c4`. Its unsigned executable is 244,440,576 bytes with SHA-256 `70170757df3815b3a881f5f1bfd72e431c80e208430858df55f27525cfbf89e3`; `resources/app.asar` is 18,474,116 bytes with SHA-256 `cf0f1707b9562490804ea4ee448a32e871d4eb6251f795181d8b11dd520fa4a5`; the canonical in-package receipt is 15,832 bytes with SHA-256 `65bfbb48cbd4b28c3e641c8dbc18adc35854c901cb9caf78095aa61589b4d8a5`.
- The current package completed through `build.bat /s` in `00:01:24`, including source preservation before and after packaging. It is a local build milestone, not a release verification claim.
- The 254-row proposed capture inventory was independently refuted as incomplete: 176 states are directly reachable, 49 require deterministic fixtures, 6 duplicate another visual state, and 23 are not reachable from the current product. It also omits nine canonical completeness areas, so it must be rewritten after the missing features are implemented.
- Root build timing now uses `scripts/release/batch-timing.bat`, and nested ASAR source binding is proven by a real temporary archive check.
- `scripts/release/stage-package-source.mjs` materializes application, asset, canonical icon, and server inputs from exact candidate Git blobs before packaging, preventing checkout line-ending conversion from changing release bytes.
- Setup icon replacement uses in-process `resedit` allocation, validates every group-to-icon reference, writes atomically, and preserves the installer bootstrapper's two additional internal icon groups byte for byte.
- Squirrel ZIP validation accepts only slash-terminated, attribute-confirmed, zero-payload directory records and keeps all existing extraction-safety checks.

## Main implementation paths

- `app/shared/hair.js`: shared desktop and core estimation, projection, unit, and timeline calculations.
- `app/core/`: state, history, presentation, School mode, narration, schedules, network, update, evidence, vocabulary, and privileged-boundary modules.
- `app/main.js`, `app/preload.js`, and `app/renderer/`: desktop process, isolated bridge, and user interface.
- `server/`: HTTP service, storage, profile and haircut routes, authentication, and health handling.
- `assets/hair-growth/`: eight canonical generated stages and their manifests.
- `site/` and `scripts/compose-site.mjs`: public website source and strict composition.
- `docs/locales/yue/`: Cantonese catalogs and article mirrors.
- `scripts/evidence/` and `tests/evidence/`: frozen built-evidence route and focused checks.
- `scripts/release/` and `scripts/release/tests/`: packaging, release, provenance, source-binding, and publication contracts.
- `.github/workflows/release.yml`: four-job release workflow for every push and manual dispatch.
- `.github/workflows/pages.yml`: exact static-site composition and deployment workflow.

## Remaining work

### Build and package

- Rebuild and validate the unsigned Squirrel.Windows setup executable, `RELEASES`, and full package from the future release candidate.
- Rebuild and validate the deterministic Linux amd64 OCI archive from the same future release candidate.
- Record exact final-release paths, sizes, SHA-256 values, source bindings, unsigned state, and provenance.

### Drive and capture

- Create the final hand-written interaction inventory.
- Drive the packaged desktop application through the approved off-screen route.
- Drive the composed website through the same evidence discipline.
- Inspect every original capture for visual correctness and sensitive data.
- Capture all required themes, languages, narrow layouts, errors, empty states, settings, dialogs, and accessibility states.
- Record and inspect a real packaged-application walkthrough.
- Update the README with the complete real capture set, shown directly rather than collapsed.

### Publish and deploy

- Publish and verify exactly one unique non-draft GitHub release from the intended commit.
- Verify every installer, package, OCI, manifest, line-count, and release-note asset by downloading it again.
- Complete the post-run terminal transfer and compose the release-bound installer state.
- Fetch the deployed GitHub Pages HTML and Open Graph image anonymously and verify the live response.
- Set and verify the repository homepage.
- Upload the root `social-preview.png` through repository settings.
- Recheck the selected private-LAN host and deploy the exact validated service image only after capacity, architecture, ports, and unrelated workloads remain safe.

### Integrate and clean

- Update the final public records with immutable release, deployment, capture, and product hashes.
- Merge the completed candidate into the default branch and verify the remote default branch contains it.
- Prove every task-owned cleanup source tip is an ancestor of the pushed default branch.
- Remove only inactive, task-owned, merged, pushed, and ancestry-proven branches and worktrees.
- Retain anything active, uncommitted, unmerged, unpushed, load-bearing, user-owned, or ownership-uncertain.

## Open issue scan

- [HairGrowthEstimator issue 1, Build hair growth estimator desktop app and LAN service](https://github.com/Ding-Ding-Projects/HairGrowthEstimator/issues/1) remains open and tracks the full application, service, website, installer, release, deployment, and evidence goal.
- [agent-global-memory issue 3, Five contract tests red](https://github.com/Ding-Ding-Projects/agent-global-memory/issues/3) remains open. Its narrow repair commit `a6dc8dcd36a1c55a37a86a29cc3dc0f7fad56a41` is integrated into `main`, while later status-artifact wording and authorized task-session contract mismatches remain unresolved. This handoff made no change to that repository.

## Next owner

The next owner should start from the pushed default branch after this session closeout. The first priority is implementing the 23 unreachable planned states and nine omitted canonical completeness areas, then replacing the refuted capture inventory. After that, rebuild every release product from one exact candidate, run the complete built-product evidence route, publish and verify the release and Pages deployment, and deploy the private-LAN service only if the inventoried shared host remains safe.
