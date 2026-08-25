# Language, playfulness, School mode, and startup surprise

## Behavior

The website offers three persisted presentation modes:

- English presents the English copy only.
- Playful Hong Kong-style Cantonese presents the Cantonese copy only.
- Bilingual presents English as the compact primary line and Cantonese as a shorter secondary line. The second line supplements the first without duplicating controls or crowding narrow layouts.

English and Cantonese each have an independent persisted funny level from 1 through 5. Both default to 5. Level 1 is fully professional, level 5 is maximally playful, and the intermediate levels increase playfulness progressively. The setting applies to every message category, including information, progress, success, warnings, errors, destructive-action copy, security copy, and accessibility copy. Humor changes voice only. Every variant retains the same factual placeholders, including names, dates, durations, counts, affected data, failure reasons, and recovery actions.

The dialog-emoji preference is separate from the funny levels. It adds a relevant decorative emoji to dialogs and message boxes when enabled. It does not add emoji to buttons, action labels, field labels, accessible names, or factual values.

School mode is a shared, user-renamable browser setting. Every page under the same website origin reads the same versioned record, watches it for changes, and applies a newer revision without requiring a reload. While the mode is enabled, the website forces English and removes Cantonese, bilingual, funny-level, personal-vocabulary, and dim-sum capabilities from rendered controls, routes, search results, overlays, notifications, and accessible text. The visitor's prior choices stay stored but dormant. Disabling the mode restores those choices live. Once renamed, only the chosen name appears on website surfaces that refer to the mode.

The website's sharing boundary is the current browser profile and origin. Browser storage events can synchronize open same-origin tabs, but a static website cannot directly watch the installed desktop product's operating-system record. Cross-product live sharing therefore requires an explicitly mediated local connection and is not implied by website-only storage.

On an eligible startup, the website makes exactly one fresh random draw and shows the surprise only when the result is at least 0 and below 0.10. The dish name comes from the public `Ding-Ding-Projects/dim-sum-photos` catalog in English and Traditional Chinese, and an image is shown only when that catalog has a published photo asset for the selected record. The surface is non-blocking, does not steal focus, and appears no more than once per launch. It is suppressed during first run, School mode, error recovery, update activity, an active visitor task, a quiet or do-not-disturb state, or after a surprise has already been shown in that launch. There is no preference that disables the surprise.

## Configuration

The established controls are `#language-mode`, `#funny-en`, `#funny-yue`, `#dialog-emoji`, and `#school-mode`. The language value is one of `en`, `yue`, or `both`. Each funny level is an integer from 1 through 5. The School mode record requires a schema version, monotonically increasing revision, update timestamp, enabled state, and bounded display name. Stored values are validated as one complete record before use, and invalid records fall back to the shipped English presentation without partially applying fields.

Translation resources remain separate from behavior. The L06 registry owns exactly eight message identifiers: `informational.saved`, `success.applied`, `progress.working`, `warning.review`, `error.failed`, `destructive.confirm`, `security.blocked`, and `accessibility.status`. Message variants use the same named placeholder set at all five funny levels in both languages. A missing language, level, category, message, or factual placeholder makes the complete registry validation fail before use. It is never applied partially. Bilingual layout never creates a second operable control for one action.

The hand-written Cantonese source inventory contains exactly 250 `ui-core` entries, 274 `ui-settings` entries, and 686 runtime entries. Fifty English documentation articles each have one Cantonese mirror. The composer validates and merges the catalogs through one contract, binds every English article to its mirror, and embeds one locale payload. Exact commands, URLs, code, dates, versions, arithmetic, identifiers, and external facts remain unchanged. School mode bypasses the locale payload and restores the previous selected language when the mode ends.

The surprise uses one launch-scoped eligibility decision and one launch-scoped random draw. A rerender, tab switch, settings change, or catalog retry does not draw again. Catalog metadata and photo availability are validated before presentation. If no eligible published asset can be resolved, startup continues without the surprise.

## Failure modes

- An unsupported language value falls back to English and reports a non-blocking recovery message.
- Complete persisted settings validation rejects an out-of-range funny level. The pure presentation resolver defensively rounds and clamps a transient finite number to 1 through 5, and uses the validated fallback for a nonnumeric value.
- A message variant with missing, renamed, or extra factual placeholders fails the complete registry check. The invalid registry is not used.
- A stale School mode revision cannot overwrite a newer local revision.
- A malformed incoming shared record is ignored and the last validated state remains active. A malformed initial record returns to the validated browser base or shipped default.
- If browser storage cannot be read or watched, the website must report that live sharing is unavailable instead of claiming synchronization. Explicit unavailable-state behavior remains pending composed verification.
- A missing, malformed, unpublished, or unreachable catalog image never delays startup and never substitutes an invented or locally generated dish.
- Reduced motion removes non-essential entrance and dismissal animation while retaining the dish name, image alternative text, and dismissal timing.

## Security and privacy

Language, funny-level, dialog-emoji, and School mode state stays in visitor-controlled browser storage. The School mode name is bounded plain text and is never interpreted as markup. Personal-vocabulary contents are not copied into the School mode record, diagnostics, exports, history, or public records.

School mode is a user-experience control, not an access-control boundary. Clearing the website's local storage resets it, and the interface states that recovery route honestly. The surprise reads only public catalog metadata and published public photo assets. It does not send visitor state, identifiers, or measurements to the catalog host.

## Verification

Source implementation is present in `site/presentation-contract.js`, `site/app.js`, `site/security-contract.js`, and `site/index.template.html`. The accepted pure-contract run, `node --test tests/site/presentation-contract.test.mjs`, reported 12 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo, and exit code 0. The exact relevant test titles are `normalizes exact language modes and independent funny levels with School forcing English`, `keeps every message category complete across both languages and all five levels`, `normalizes the shared renameable School record and all suppression decisions`, and `uses an exact startup draw below ten percent and applies every suppression condition`. The final runtime-binding test also covers exact listener registration and teardown plus red-to-green caller mutations. The accepted main source-boundary run in `tests/site/language-attention.test.mjs` reported 5 passed after the deliberate source-removal state reported 0 passed and 5 failed.

The focused localization run, `node --test tests/site/localization.test.mjs`, reported 5 passed, 0 failed, and 0 skipped. It validates the exact catalog counts, every static visible and accessible English source, all 50 article pairs, one composer and runtime route, technical-fact parity, and the explicit hand-written inventory. Its deliberate deletion of one catalog entry and omission of one article locale both turned the completeness check red before restoration.

Those results are source evidence only. Source catalogs and article mirrors are complete at the named boundaries, but compact bilingual layout, user rename across every rendered visible and accessible reference, actual same-origin tab propagation, storage-unavailable status, full suppression and restoration, and catalog asset availability still require composed-website interaction.

The pure-contract run proved negative and nonfinite draw refusal, the inclusive zero and exclusive 0.10 boundaries, and every suppression input. The main source-boundary run proved that Low stimulation reaches the exact `quietMode` caller field. The current runtime's update-path argument is still a fixed false value, so live update-state integration remains pending. One draw per launch, no opt-out control, public-catalog bilingual names, published-photo behavior, non-blocking presentation, alternative text, offline handling, reduced motion, composed interaction, and capture evidence remain pending.

## Suggested articles

- [Settings and appearance](settings-and-appearance.md)
- [Narrator and voice selection](narrator-and-voices.md)
- [Scheduled and external settings](scheduled-settings.md)
- [Browser storage limitations](../security/browser-storage-limitations.md)
