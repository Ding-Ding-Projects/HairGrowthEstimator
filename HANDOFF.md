# Handoff

## Scope completed in this change

This change prepares the public documentation website, detailed categorized documentation, build-time provenance, deterministic product-logo social preview, and source-level verification for Hair Growth Estimator. The current correctness repair also reconciles haircut baselines, rejects future chronology, serializes same-origin browser writes, and replaces aggregate-only CSV or TSV output with faithful normalized rows.

This documentation lane maps the accepted second website repair batch without claiming built or published evidence that has not appeared. The strict personal-vocabulary, browser-state, appearance, sanitized-import, stored-envelope, positive export-allowlist, disposable Worker, and Worker-client modules and their active browser consumers are now present in source. The source also includes pre-read and stable-byte-count vocabulary loading, fatal UTF-8 validation, exact external scanner schema and count checks, localized vocabulary status and action states, School-sensitive regex and overlay closure, rebuilt-tab `focusTarget` restoration, JSONL derivation from `record.state.haircuts`, clean Worker queue recovery after construction or message-send failure, a bounded fatal-UTF-8 hair manifest, exact Ollama loopback-origin alignment, template policy, internal documentation routing, complete Tools and Settings tab relationships, explicit setting-control names, complete context-menu keyboard behavior and opener return, narrow-layout discovery access, the deliberately focusable article target, bounded fatal-UTF-8 installer input, composer-side immutable installer validation, complete runtime installer revalidation, and byte-level PNG inspection. The complete focused hardening suite reports 11 passed, 0 failed, and 0 skipped after restoration, including the integrated service-counterpart audit. Canonical source images, complete negative-regression coverage, built interaction, complete localization, installer publication, month-calculation parity, and capture evidence remain pending.

The website visibly states that it is not the primary application and not an embedded replacement for the installed application. Installer download controls remain disabled because no immutable release manifest is present.

## Main implementation paths

- `site/index.template.html`: composed website structure and front-screen provenance boundary.
- `site/styles.css`: responsive Material Design 3 Expressive styling, themes, high contrast, focus, touch sizing, and reduced motion.
- `site/state-contract.js`: pure baseline selection, date validation, revisioned state envelopes, Web Locks and IndexedDB transaction coordination, stale-write refusal, and normalized delimited export.
- `site/security-contract.js`: strict JSON parsing, bounded personal-vocabulary validation, browser-state and appearance validation, sanitized import construction, positive export allowlisting, and bounded stored-envelope parsing.
- `site/regex-client.js` and `site/regex-worker.js`: disposable Worker client, bounded queue and deadline handling, and isolated regular-expression request evaluation.
- `site/app.js`: visitor-local settings and feature interactions, active-baseline reconciliation, guided date errors, storage-event adoption, and transaction-backed persistence.
- `scripts/compose-site.mjs`: provenance binding, documentation bundling, canonical hair-reference asset ingestion, release-manifest validation, and social-preview generation.
- `docs/`: categorized feature, site, operations, security, API, and completeness documentation.
- `tests/site/`: hand-written source checks, focused state correctness tests, and deliberate red-then-green negative regressions.
- `tests/site/hardening.test.mjs`: source-present focused hardening and integrated service-counterpart audit. The restored suite reports 11 passed, 0 failed, and 0 skipped. The accepted deliberate fixtures cover only their named source boundaries; this documentation lane did not run the suite.
- `social-preview.png`: genuine generated product logo card, not a mock interface.

## Verification state

Source syntax, composition, static structure, provenance, responsive invariants, accessibility structure, local-asset rules, documentation contracts, privacy boundaries, and deliberate negative regressions are verified locally. The correctness repair adds a separate focused suite. Its latest run reports 5 passed, 0 failed, and 0 skipped for newest-haircut selection, retained fallback, future-date refusal, concurrent monotonic revisions, stale-writer refusal, normalized CSV or TSV content, unavailable-lock refusal, and the deliberate source-boundary regression.

The combined command `node --test tests/site/site.test.mjs tests/site/correctness.test.mjs`, with the private dictionary supplied only through `PRIVATE_VOCABULARY_SOURCE` from outside this public repository, reports 15 passed, 0 failed, and 0 skipped. The website suite contributes 10 passes and the correctness suite contributes 5. The strict asset fixture first composes all eight canonical stages, then changes one image and observes the SHA-256 boundary fail, then restores the image and observes composition succeed. Before implementation, the new correctness suite was deliberately run without `site/state-contract.js` and reported 0 passed and 5 failed on that exact missing boundary. Restoring the implementation and inventory returned all 5 to green.

The final focused repair proof used exactly these three tests: `accessibility repair boundaries are explicit and responsive controls remain operable`, `installer manifest and canonical hair images fail closed on incomplete or mismatched evidence`, and `installer manifest accepts only the complete immutable publication contract`. Its red fixture removed `#docs-article`'s `tabindex="-1"`; removed composer `MAX_INSTALLER_MANIFEST_BYTES` and fatal `TextDecoder` handling while a 65,536-byte-overrun fixture was accepted; and removed the runtime's exact escaped-version tag match, 160-character filename bound, and string-only publication-time check. All 3 checks were red before implementation. After restoration, the same 3 passed with 0 failed and 0 skipped.

The latest focused hardening fixture contained 11 tests and deliberately removed or weakened six exact boundaries: `SCHOOL_SENSITIVE_REGEX_OWNERS` and related overlay closure; rebuilt `focusTarget` restoration; JSONL use of `record.state.haircuts`; Worker construction and `postMessage` queue recovery; `MAX_HAIR_MANIFEST_BYTES` plus fatal UTF-8 decoding; and exact Ollama origin alignment across `connectOllama`, normalized persistence, Content Security Policy, and `validateOllama`. The adversarial state reported 5 passed and 6 failed. After restoration, the same suite reported 11 passed, 0 failed, and 0 skipped. The restored set includes the integrated service-counterpart audit.

Four separate personal-vocabulary fixtures also have accepted narrow proof. The pre-read `MAX_VOCABULARY_BYTES` and stable-byte-count boundary was red 1, then passed 1 after restoration. The localized status, choose or replace, clear, polite atomic status region, palette destination, and School-filtering anchors were red 1, then passed 1 after restoration. The owned-copy exemption boundary for user-authored and factual labels was red 1, then passed 1 after restoration. The external scanner was red 1 with `PRIVATE_VOCABULARY_EXPECTED_COUNT` set to 0, then passed 1 with the expected count restored to 100. That scanner fatal-decodes the file, requires exact `schemaVersion` and `entries` root fields, verifies the exact count and nonempty text replacements without printing values, excludes only the public `Slop Machine` value, and requires a nonempty private replacement scan.

The deterministic `social-preview.png` was opened and inspected at 1280 by 640 pixels. The original product logo, full product name, and tagline are visible without clipping. The root and composed copies have SHA-256 `0167cfa340c247441071e7859024ac7a655c996fadbf18d5513aab45b29b898c` and are byte-identical.

The existing negative-regression record is partial. Earlier runs deliberately removed `id="front-provenance"`, `data-open-regex-for="strip-search"`, and `site/state-contract.js`. Later fixtures covered only the exact article-focus, installer, six hardening, and three personal-vocabulary boundaries named above. Those results do not prove the complete inventory, every localization entry, every interaction record, or every capture record has red-then-green coverage. This documentation lane ran no tests, builds, or captures. It records the accepted focused results without extending them to built behavior or complete inventory proof.

## Release workflow contract

No file under `.github/workflows/` is included in this feature branch. Release wiring belongs in a later, dedicated integration change so this feature commit cannot trigger a premature release.

The later Pages workflow should:

1. Run on the official `windows-2025` image.
2. install the Node version declared by the release integration, currently expected to be Node 22.18.0;
3. derive `SOURCE_DATE_EPOCH` from the exact commit time;
4. set `REQUIRE_HAIR_ASSETS=1`;
5. run only the website composer, with no tests or lint in GitHub Actions;
6. upload and deploy the composed Pages artifact;
7. collect only explicitly safe build evidence;
8. avoid release-publication overlap and avoid cancellation that could strand a deployment.

Repository self-hosted runners were not available. Organization runner inventory could not be read because the current credential lacks organization-administration scope. The supported route is therefore the official hosted image, with explicit dependency bootstrap.

## Remaining evidence and external requirements

- Integrate and validate the eight canonical hair-reference PNG files and manifest under `assets/hair-growth/`.
- Inspect source-present `inspectPng` validation against every canonical image before treating any image as available.
- Exercise the source-present `parseJsonStrict`, `validatePersonalVocabularyText`, `validatePersonalVocabularyCache`, `validateBrowserState`, `validateAppearanceMap`, `sanitizeImportedState`, `validateStoredStateEnvelopeText`, positive-allowlist `buildRedactedExportState`, and their active consumers through the composed browser artifact. Their focused source checks are accepted; built interaction remains pending.
- Exercise the source-present `navigateDocumentationLink`, `activateManagedTab`, `handleManagedTabKeydown`, `focusFilteredTabFallback`, `SETTING_CONTROL_NAMES`, `applyExplicitSettingNames`, `closeContextMenu`, Worker-backed `runRegexWorkbench`, search consumers of `createRegexWorkerClient`, static Content Security Policy, and focusable article target through the composed browser artifact.
- Preserve the restored 11-test hardening result while integrating the canonical assets, then exercise its source-present boundaries through the composed website. The service-counterpart audit is included in the accepted 11-test result, but its deliberate health-route break remains evidence for that boundary only.
- Compose a real installer manifest through `optionalInstaller`, `validateInstallerManifest`, `isValidProvenance`, and `isValidInstallerManifest`, then exercise the enabled and rejected download states in the built website.
- Exercise real same-origin tab contention with both Web Locks and the IndexedDB fallback in a composed browser artifact.
- Exercise guided future-date errors and create, edit, and delete baseline selection through the real rendered controls.
- Reconcile and verify the adjustable 1.0 cm per month default and elapsed-month calculation across the website, service, and installed application.
- Download CSV and TSV from the composed artifact and independently reassemble the normalized rows before claiming a browser round trip.
- Drive the exact built website and packaged application through the approved off-screen interaction route.
- Capture all required real surfaces, narrow layouts, themes, states, and accessibility flows.
- Commit a real screen recording of the packaged application.
- Add the final workflow only after all feature branches are safely integrated.
- Build and verify the unsigned installer set.
- Publish an immutable release manifest before enabling downloads.
- Deploy the website, fetch its served HTML, and verify every Open Graph tag and anonymous image request.
- Upload `social-preview.png` through Settings, General, Social preview, Upload an image.
- Complete the final README capture update after real built-artifact evidence exists. `README.md` was outside this documentation lane and remains unchanged here.
- Set and verify the repository homepage after publication.

## Open issue scan

- [HairGrowthEstimator issue 1, Build hair growth estimator desktop app and LAN service](https://github.com/Ding-Ding-Projects/HairGrowthEstimator/issues/1) remained open at the 2026-08-25 read-only scan. It was last updated at `2026-08-25T03:21:06Z` and still tracks the full application, service, website, installer, release, and evidence scope.
- [agent-global-memory issue 1, Require a consistent Hong Kong uncle conversation voice](https://github.com/Ding-Ding-Projects/agent-global-memory/issues/1) remained open at the same read-only scan. It was last updated at `2026-08-25T04:35:12Z`, remains outside this public repair branch, and was not modified.

## Next owner

The integration owner should first merge the website source with the canonical image assets, run the focused local website checks again with `REQUIRE_HAIR_ASSETS=1`, and only then add final release workflow wiring.
