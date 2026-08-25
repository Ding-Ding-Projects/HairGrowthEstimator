# Home and verified download

## Behavior

The Home page must explain what the desktop product does, show the complete feature set, link to detailed documentation, expose current status, and provide a direct Windows installer download only after an immutable release asset has been verified. It must state visibly that the website is not the installed product.

Estimator explanations on the Home page use one average Gregorian month of `365.2425 / 12 = 30.436875 days` for both elapsed current-length calculations and remaining projected-target calculations. The 1.0 cm per month planning default is adjustable, non-medical, and subject to meaningful individual variation. The supporting clinical overview remains [Hair Growth Disorders, StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK499948/).

## Configuration

The installer link is derived only from the fixed `dist/terminal-transfer` handoff. That directory must contain exactly `installer-manifest.json`, `release-context.json`, `trusted-product-validation.json`, and `terminal-transfer-receipt.json`. Installer, context, and receipt inputs are each limited to 65,536 bytes. The complete trusted-product record is limited to 16,777,216 bytes because it carries sorted source-binding file arrays. Every input uses fatal UTF-8 decoding, closed object fields, exact byte counts, and SHA-256 verification before any release identity is accepted. Environment-selected or legacy `release/installer-manifest.json` inputs are ignored.

`validateInstallerManifest` accepts exactly `schemaVersion`, `owner`, `repository`, `tag`, `target`, `version`, `platform`, `filename`, `bytes`, `sha256`, `unsigned`, and `publication`. The release context, trusted validation, and terminal receipt independently bind the owner and repository, exact composed commit, logical run and attempt, release version and tag, copied file bytes, complete source bindings, and terminal publication identity. The release version is allowed to differ from tracked `package.json`, so a real `1.0.<run number>` release is not contradicted by the static `1.0.0` source version. The composer derives the visible version from the verified terminal installer manifest and derives updated-at from its canonical `publication.publishedAt`. With no terminal-transfer directory, it keeps an honest package-and-commit provenance record with no installer URL.

Before composition succeeds, the composer independently reads the exact tagged GitHub release, verifies its target, IDs, state, publication time, and Setup asset metadata, downloads that Setup asset, and recomputes its byte count and SHA-256. The browser then repeats the embedded provenance and installer checks. `renderProvenance` enables the control only when the release-bound provenance source, exact version tag, 160-character filename limit, canonical publication time, positive IDs, exact immutable URL, and installer record all agree.

Open Graph metadata must be present in the served HTML, with an absolute HTTPS image URL, dimensions, alt text, a large-image social card, and theme color. A static Content Security Policy must restrict scripts, styles, images, workers, connections, frames, objects, forms, and base URLs to the minimum origins required by the documented website features.

## Failure modes

- Before a verified release exists, the installer control remains disabled and carries no URL rather than guessing one.
- If the release manifest cannot be validated, the page must keep the last verified factual state and show an honest unavailable message.
- A manifest that names a valid-looking hash but a mutable or unapproved download URL must not enable the installer control.
- A manifest parser failure, asset-size overflow, unknown field, or unsupported schema must keep downloads disabled without retaining partially trusted fields.
- A relative social image URL or JavaScript-injected metadata will not satisfy link preview crawlers.
- An unavailable capture must be labeled as pending rather than replaced by a mock product image.

## Security and privacy

The page must not contain analytics, third-party scripts, remote fonts, secrets, private host details, or visitor-specific data in metadata. Download links must use public immutable release assets.

## Verification

Source inspection confirmed the visible website-only boundary, complete navigation shell, static Open Graph tags, absolute HTTPS `og:image`, dimensions, alt text, large-image card, theme color, local logo assets, composer-owned social-preview generation, static Content Security Policy, bounded fatal-UTF-8 terminal inputs, closed transfer schemas, complete source-binding validation, copied-file hashes, exact release identity, GitHub release readback, Setup-byte download verification, runtime `isValidProvenance`, and runtime `isValidInstallerManifest`. The focused terminal-transfer suite was deliberately red 4 of 4 before implementation for static-version contradiction, target mismatch, stale or incomplete receipt, and missing manifest. Restoring the contract produced 4 passed, 0 failed, and 0 skipped. A terminal transfer from a real release, public deployment, served-response inspection, and real-product captures remain pending.

## Suggested articles

- [Offline documentation browser](documentation-browser.md)
- [Changelog viewer](changelog-viewer.md)
- [Release, installation, and updates](../operations/release-install-and-updates.md)
- [Status and build provenance](status-and-provenance.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
