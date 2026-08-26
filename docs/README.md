# Hair Growth Estimator documentation

This documentation describes the Windows desktop product, its optional HTTP service, its release and packaging paths, its evidence harness, and its public documentation and download website. It distinguishes source implementation, local verification, built-product evidence, and published evidence.

## Documentation map

- [Product features](features/README.md)
- [Public website](site/README.md)
- [HTTP API](api/README.md)
- [Operations](operations/README.md)
- [Security and privacy](security/README.md)
- [Completeness inventories](inventory/README.md)
- [Release and packaging](release/README.md)
- [Built evidence harness](verification/built-evidence-harness.md)

## Evidence language

- **Implemented** means the named source boundary exists in the inspected commit.
- **Locally verified** means the named local check completed successfully against the stated source candidate.
- **Built-product verified** means the packaged desktop product, installer, container archive, or composed website was exercised directly.
- **Published verified** means the immutable release, deployed website, or downloadable asset was read back from its public destination.
- **Pending** means no accepted proof exists yet. A planned selector, test name, workflow, capture path, or release filename is not evidence by itself.

## Integrated source basis

The implementation basis immediately before this documentation update is `a4cec62c55804e6e4eb39d4bbf759e83eed2719f`.

It includes the complete desktop and service core, the public website and localization sources, all eight generated hair-reference images, the frozen built-evidence harness, reproducible Windows and OCI packaging, release automation, and GitHub Pages deployment wiring.

The application and website share these calculation facts:

- `1 in = 2.54 cm` for unit conversion.
- `365.2425 / 12 = 30.436875 days` for one estimate month.
- The current-length calculation and projected-target calculation use the same month value.
- The shipped planning default is an adjustable 1.0 cm per month estimate, not a medical fact.
- Hair growth varies meaningfully between people and over time.

`app/shared/hair.js` supplies the desktop and core month contract. `site/state-contract.js` supplies the website contract. Focused core and website checks cover the two calculation paths. Integrated source parity is complete, while packaged interaction remains pending.

## Hair-reference source authority

The eight generated male hair-reference PNG files and their manifests are integrated under `assets/hair-growth/`.

`assets/hair-growth/stages.json` is the single stage-to-file mapping authority. The composer and packaging paths consume that authority instead of maintaining a second mapping. Local checks verify the manifest structure, file identities, image dimensions, PNG structure, and SHA-256 boundaries. The strict fixture composes all eight stages, changes one image to observe a digest refusal, restores it, and observes success.

Source integration and automated image validation are complete. Final human pixel review, animation interaction, built-product capture, and README images remain pending.

## Language and localization

The source provides English, playful Hong Kong-style Cantonese, and compact bilingual presentation. English and Cantonese each have an independent persisted funny level from 1 through 5, both defaulting to 5.

The hand-written localization inventory contains exactly:

- 250 `ui-core` entries
- 274 `ui-settings` entries
- 686 `runtime` entries
- 66 English and Cantonese documentation article pairs

The focused localization checks deliberately remove one catalog entry and one article mirror, observe failure, restore them, and observe success. The accepted source checks do not replace composed-browser interaction or captures across every localized state.

## Desktop and service core

The integrated core includes estimation, haircut history, exact unit conversion, local storage, the HTTP service, managed SSH tunnelling, provenance, local history, language presentation, School mode, narration, schedules, attention accommodations, personal-vocabulary loading, update validation, accessibility wiring, and privileged-boundary checks.

The integrated core run reports 349 passed, 2 explicitly skipped, and 0 failed. Skipped checks are explicitly optional external-source boundaries, not silent passes.

## Website source

The website includes build-bound provenance, responsive and accessible structure, local assets, documentation browsing, browser-style navigation, contextual menus, regular-expression tools, local notifications and history, visitor-local settings, and explicit browser limitations for local model, file-conversion, lock, and authentication-code demonstrations.

The integrated website run reports 53 passed, 2 explicitly skipped because optional external private sources were absent, and 0 failed. A separate accepted run with the current private vocabulary supplied through its external value-free path reports 55 passed, 0 failed, and 0 skipped.

These are source and composition checks. They do not establish final browser interaction, visual quality, or deployed behavior.

## Built evidence harness

The frozen evidence harness binds each planned interaction to the exact source commit, packaged executable, `app.asar`, packaging receipt, viewport, display scale, theme, language, semantic state, accessibility target, input method, PNG bytes, privacy review, and completion marker.

It also provides isolated application-data roots, exact CDP target proof, dynamic window identity, durable retry and recovery rules, window-only recording, and safe process teardown.

Its local checks report 30 passed and 0 failed, plus 18 of 18 JavaScript syntax checks. No final product capture or screen recording has been produced yet.

## Release and packaging

The source includes build and validation paths for:

- a runnable Windows x64 packaged directory
- a genuine unsigned Squirrel.Windows `Setup.exe`, `RELEASES`, and full `.nupkg` family
- a deterministic Linux amd64 OCI layout archive for the hair-length service
- exact dependency bootstrap and digest verification
- source-preservation, provenance, icon, package, container, line-count, safe-output, and publication validation
- one four-job release workflow and one GitHub Pages workflow
- a fixed four-file post-run terminal transfer for release-bound website composition

The complete release-packaging check set reports 85 passed and 0 failed. This verifies the packaging and workflow contracts in source. The final application, installer, and OCI products have not yet been built from the final integrated commit, and no release has been published.

## Product boundary

The public website is a documentation, download, status, settings, and link surface. It is not the installed desktop product and does not replace it. Website controls affect only visitor-owned browser state unless an article explicitly describes a supported local connection.

## Remaining evidence

- Final clean Windows application and Squirrel.Windows builds
- Final deterministic OCI archive build
- Built desktop and website interaction ledgers
- Real captures for every required surface and state
- A committed real screen recording
- The detailed README with the complete non-collapsed capture set
- One unique non-draft GitHub release and downloadable-asset readback
- GitHub Pages deployment and served-response verification
- Repository homepage and social-preview upload verification
- Private-LAN host deployment and health verification
- Final merge ancestry proof and safe cleanup
