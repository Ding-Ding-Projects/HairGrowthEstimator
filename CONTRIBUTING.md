# Contributing

Thank you for improving Hair Growth Estimator.

## Before changing code

1. Read [AGENTS.md](AGENTS.md), [the documentation index](docs/README.md), and the article for the feature you plan to change.
2. Keep changes focused and preserve unrelated work.
3. Do not add analytics, trackers, remote fonts, CDN assets, secrets, machine-specific paths, or private infrastructure details.
4. Do not add a guessed installer URL. Download controls require an immutable verified release manifest.

## Website changes

The website is composed with:

```powershell
npm run compose-site
```

Use a disposable output directory during development:

```powershell
$env:SITE_OUTPUT_DIR = Join-Path $env:TEMP "hair-growth-site"
npm run compose-site
```

When canonical hair-reference assets are present, also verify the strict integrated mode:

```powershell
$env:REQUIRE_HAIR_ASSETS = "1"
npm run compose-site
```

## Local checks

```powershell
node --check site/app.js
node --check scripts/compose-site.mjs
node --test tests/site/site.test.mjs
git diff --check
```

If you add a search field, settings control, feature surface, or documentation article, update its hand-written inventory in the same change. Prove new completeness checks by deliberately removing the exact protected boundary, observing a failure, restoring it, and observing success.

## Documentation and evidence

Every user-visible behavior needs a categorized article covering behavior, configuration, failure modes, security, verification, and suggested reading. Real captures must come from the exact built artifact. Do not use a mock, a design reference, or a source preview as implementation evidence.

## Commit messages

Use a precise English subject and a playful Hong Kong-style Cantonese body. Humor may describe surprising code behavior, but never mock a person. Every commit uses the project-required author identity and trailer documented in [AGENTS.md](AGENTS.md).
