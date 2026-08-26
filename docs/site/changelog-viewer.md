# Changelog viewer

## Behavior

The changelog panel declares date inputs, text search, filtered export, and an article list. Entries must cover every released version with the version, release date, categorized facts, and the full commit SHA that completed the change. The displayed short SHA links to that exact commit.

Date and text filters compose. Typed local dates and ISO dates remain visible when partial or invalid so a user can correct them. Export reflects the visible filtered range and retains commit SHAs.

## Configuration

Build composition is expected to embed a versioned changelog array into `#bundled-changelog`. The date picker requires month and year navigation, range selection, named presets, and locale-aware input. Search stays plain text until regex is explicitly enabled through the adjacent workbench.

## Failure modes

- An unknown commit remains visibly unavailable and is never replaced with a nearby guess.
- An invalid date reports the problem without clearing the typed input.
- A version with no recorded changes says so explicitly.
- A missing or malformed embedded catalog produces an honest empty state.

## Security and privacy

Changelog content comes from the repository record and is rendered through the shared safe markup renderer. It must not contain secrets or visitor-local history. External commit links use the project's public forge URL and do not carry visitor identifiers.

## Verification

Source inspection confirmed embedded-array parsing, date-range and text filtering, exact 40-character commit validation before linking, unavailable commit copy, empty results, and Markdown export. The current export writes the entire embedded catalog rather than the active filtered view, and the date controls are native inputs without the required advanced calendar behavior. English and Cantonese source copy is present through the validated changelog mirror. Runtime composition, commit existence validation, focused interaction, keyboard flow, and built-artifact evidence remain pending.

## Suggested articles

- [Offline documentation browser](documentation-browser.md)
- [Notifications and local history](notifications-and-history.md)
- [Status and build provenance](status-and-provenance.md)
