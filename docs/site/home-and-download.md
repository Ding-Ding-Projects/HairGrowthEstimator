# Home and verified download

## Behavior

The Home page must explain what the desktop product does, show the complete feature set, link to detailed documentation, expose current status, and provide a direct Windows installer download only after an immutable release asset has been verified. It must state visibly that the website is not the installed product.

## Configuration

The installer link is derived from a strictly validated immutable release manifest. `optionalInstaller` reads no more than `MAX_INSTALLER_MANIFEST_BYTES`, which is 65,536 bytes, and decodes the input through a fatal UTF-8 `TextDecoder` before parsing JSON. `validateInstallerManifest` accepts exactly `schemaVersion`, `owner`, `repository`, `tag`, `target`, `version`, `platform`, `filename`, `bytes`, `sha256`, `unsigned`, and `publication`. It binds owner and repository, the composed commit, package version, a versioned tag and executable filename, `windows-x64`, a positive asset size no larger than 2 GiB, a lowercase SHA-256 digest, explicit unsigned status, published non-draft release state, publication time, positive release and asset IDs, and the exact immutable GitHub release-asset URL. Missing or unknown fields, mismatched identity, mutable or altered URLs, unsupported platforms, invalid sizes or hashes, and draft or unverified publication states are rejected as a whole.

The browser repeats these checks before enabling the download. `isValidProvenance` verifies the exact build record, and `isValidInstallerManifest` revalidates every installer and publication field against that record, including the escaped package-version tag, 160-character filename limit, string publication time, positive IDs, and exact immutable URL. `renderProvenance` enables the control only when both validators accept the embedded record.

Open Graph metadata must be present in the served HTML, with an absolute HTTPS image URL, dimensions, alt text, a large-image social card, and theme color. A static Content Security Policy must restrict scripts, styles, images, workers, connections, frames, objects, forms, and base URLs to the minimum origins required by the documented website features.

## Failure modes

- Before a verified release exists, the installer button must be absent rather than guessed.
- If the release manifest cannot be validated, the page must keep the last verified factual state and show an honest unavailable message.
- A manifest that names a valid-looking hash but a mutable or unapproved download URL must not enable the installer control.
- A manifest parser failure, asset-size overflow, unknown field, or unsupported schema must keep downloads disabled without retaining partially trusted fields.
- A relative social image URL or JavaScript-injected metadata will not satisfy link preview crawlers.
- An unavailable capture must be labeled as pending rather than replaced by a mock product image.

## Security and privacy

The page must not contain analytics, third-party scripts, remote fonts, secrets, private host details, or visitor-specific data in metadata. Download links must use public immutable release assets.

## Verification

Source inspection confirmed the visible website-only boundary, complete navigation shell, static Open Graph tags, absolute HTTPS `og:image`, dimensions, alt text, large-image card, theme color, local logo assets, composer-owned social-preview generation, the static Content Security Policy, `MAX_INSTALLER_MANIFEST_BYTES`, fatal UTF-8 decoding, strict composer-side `validateInstallerManifest`, runtime `isValidProvenance`, and complete runtime `isValidInstallerManifest` validation. The two installer-focused checks named `installer manifest and canonical hair images fail closed on incomplete or mismatched evidence` and `installer manifest accepts only the complete immutable publication contract` were deliberately red when the bounded decoder and runtime checks were absent, then passed after restoration as part of the focused three-check run with 0 failed and 0 skipped. A composed artifact carrying a real verified installer manifest, anonymous image fetch, public deployment, served-response inspection, and real-product captures remain pending.

## Suggested articles

- [Offline documentation browser](documentation-browser.md)
- [Changelog viewer](changelog-viewer.md)
- [Release, installation, and updates](../operations/release-install-and-updates.md)
- [Status and build provenance](status-and-provenance.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
