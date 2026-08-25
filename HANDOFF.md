# Handoff

## Scope completed in this change

This change prepares the public documentation website, detailed categorized documentation, build-time provenance, deterministic product-logo social preview, and source-level verification for Hair Growth Estimator.

The website visibly states that it is not the primary application and not an embedded replacement for the installed application. Installer download controls remain disabled because no immutable release manifest is present.

## Main implementation paths

- `site/index.template.html`: composed website structure and front-screen provenance boundary.
- `site/styles.css`: responsive Material Design 3 Expressive styling, themes, high contrast, focus, touch sizing, and reduced motion.
- `site/app.js`: visitor-local settings and feature interactions.
- `scripts/compose-site.mjs`: provenance binding, documentation bundling, canonical hair-reference asset ingestion, release-manifest validation, and social-preview generation.
- `docs/`: categorized feature, site, operations, security, API, and completeness documentation.
- `tests/site/`: hand-written source checks and deliberate red-then-green negative regressions.
- `social-preview.png`: genuine generated product logo card, not a mock interface.

## Verification state

Source syntax, composition, static structure, provenance, responsive invariants, accessibility structure, local-asset rules, documentation contracts, privacy boundaries, and deliberate negative regressions are verified locally.

The focused command `node --test tests/site/site.test.mjs` reports 9 passed, 0 failed, and 0 skipped when the external private dictionary is supplied from outside this public repository. The strict asset fixture first composes all eight canonical stages, then changes one image and observes the SHA-256 boundary fail, then restores the image and observes composition succeed.

The deterministic `social-preview.png` was opened and inspected at 1280 by 640 pixels. The original product logo, full product name, and tagline are visible without clipping. The root and composed copies have SHA-256 `0167cfa340c247441071e7859024ac7a655c996fadbf18d5513aab45b29b898c` and are byte-identical.

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
- Drive the exact built website and packaged application through the approved off-screen interaction route.
- Capture all required real surfaces, narrow layouts, themes, states, and accessibility flows.
- Commit a real screen recording of the packaged application.
- Add the final workflow only after all feature branches are safely integrated.
- Build and verify the unsigned installer set.
- Publish an immutable release manifest before enabling downloads.
- Deploy the website, fetch its served HTML, and verify every Open Graph tag and anonymous image request.
- Upload `social-preview.png` through Settings, General, Social preview, Upload an image.
- Set and verify the repository homepage after publication.

## Open issue scan

- [HairGrowthEstimator issue 1](https://github.com/Ding-Ding-Projects/HairGrowthEstimator/issues/1) remains open and tracks the full application, service, website, installer, release, and evidence scope.
- The shared-instruction repository has one separate open instruction-change issue. It remains outside this public feature branch and was not modified.

## Next owner

The integration owner should first merge the website source with the canonical image assets, run the focused local website checks again with `REQUIRE_HAIR_ASSETS=1`, and only then add final release workflow wiring.
