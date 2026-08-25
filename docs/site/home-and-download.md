# Home and verified download

## Behavior

The Home page must explain what the desktop product does, show the complete feature set, link to detailed documentation, expose current status, and provide a direct Windows installer download only after an immutable release asset has been verified. It must state visibly that the website is not the installed product.

## Configuration

The installer link must be derived from a validated release manifest and must include the exact version and platform. Open Graph metadata must be present in the served HTML, with an absolute HTTPS image URL, dimensions, alt text, a large-image social card, and theme color.

## Failure modes

- Before a verified release exists, the installer button must be absent rather than guessed.
- If the release manifest cannot be validated, the page must keep the last verified factual state and show an honest unavailable message.
- A relative social image URL or JavaScript-injected metadata will not satisfy link preview crawlers.
- An unavailable capture must be labeled as pending rather than replaced by a mock product image.

## Security and privacy

The page must not contain analytics, third-party scripts, remote fonts, secrets, private host details, or visitor-specific data in metadata. Download links must use public immutable release assets.

## Verification

Source inspection confirmed the visible website-only boundary, complete navigation shell, static Open Graph tags, absolute HTTPS `og:image`, dimensions, alt text, large-image card, theme color, local logo assets, and composer-owned social-preview generation. `optionalInstaller` accepts only a manifest with an HTTPS URL and 64-character lowercase SHA-256, while `renderProvenance` keeps the button disabled until that data is valid. A composed artifact, verified installer manifest, anonymous image fetch, public deployment, served-response inspection, and real-product captures remain pending.

## Suggested articles

- [Offline documentation browser](documentation-browser.md)
- [Changelog viewer](changelog-viewer.md)
- [Release, installation, and updates](../operations/release-install-and-updates.md)
- [Status and build provenance](status-and-provenance.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
