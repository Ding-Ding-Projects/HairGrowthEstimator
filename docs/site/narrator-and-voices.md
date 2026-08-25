# Narrator and voice selection

## Behavior

The narrator is off by default. When enabled, it speaks selected website events in English, Cantonese, or Both. Both means English followed by Cantonese through one serialized queue. Superseded queued events are replaced, speech never overlaps, and factual error details remain present at every funny level.

English and Cantonese each have an independent voice picker. The default is Choose automatically. The pickers use installed browser voices, subscribe to late voice enumeration, persist stable voice identities rather than display names, and explain the voice actually in effect. Rate and pitch use bounded platform-supported ranges.

## Configuration

The template declares `#narrator-enabled`, `#voice-en`, `#voice-yue`, `#narrator-rate`, `#narrator-pitch`, and status lines for both voices. The browser runtime persists those values, subscribes to `voiceschanged`, lists matching voices, and serializes event speech by category. A narrator-language picker and cooldown settings remain pending.

## Failure modes

- Empty first enumeration must be retried when the browser reports changed voices.
- A selected voice that is no longer installed stays selected while an explicit fallback is reported.
- A network-backed voice may become silent offline and must be identified as such when detectable.
- No compatible voice produces a factual unavailable state, not a fake success.
- Active assistive technology and reduced-sound preferences take priority over optional narration.

## Security and privacy

Narration operates on already-visible local event text. It must not speak secrets, credentials, personal-vocabulary payloads, hidden data, or private file paths. No spoken content is uploaded by the website.

## Verification

Source inspection confirmed opt-in speech, category replacement in a serialized queue, English voice-identity selection, rate, pitch, persistence, late enumeration, unavailable states, and network-backed voice labels. The current speech path always selects the English voice setting and does not speak English then Cantonese, so the Cantonese picker is not yet a renderer consumer. Cooldowns, screen-reader coordination, full language behavior, focused bounds tests, and built-artifact evidence are pending.

## Suggested articles

- [Accessibility and responsive layout](accessibility-and-responsive-layout.md)
- [Settings and appearance](settings-and-appearance.md)
- [Notifications and local history](notifications-and-history.md)
