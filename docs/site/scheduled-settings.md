# Scheduled and external settings

## Behavior

Scheduled rules temporarily override website language, theme, density, accent, fonts, motion, display name, and any other exposed appearance value. A local rule can use optional start and end dates, a start and end time, every day or selected weekdays, and the visitor's configured timezone. Later matching rules win deterministically, and base settings return when no rule matches.

Each rule may use local values, a validated versioned HTTPS API, or a Home Assistant boolean entity. An `on` entity activates the rule; `off` leaves the base value or another matching rule in effect.

## Configuration

The template currently declares a label, start and end times, weekdays, theme, timezone status, and rule list. Date bounds, source selection, API schema, Home Assistant fields, stable rule IDs, enabled state, cancellation guards, and migrations remain pending.

Cross-midnight ranges continue into the next day. Equal start and end values, partial input, daylight-saving transitions, precedence, timeout, refresh interval, and fallback behavior must be documented in the runtime schema.

## Failure modes

- Invalid or partial dates and times do not create a rule.
- An older network response cannot overwrite a newer edit or activation.
- Offline, malformed, refused, rate-limited, or `off` sources retain the last valid local or base state and show a non-blocking recovery message.
- A remote value is never silently written back as the permanent base setting.

## Security and privacy

External URLs reject embedded credentials, unexpected redirects, file schemes, and non-loopback HTTP. Responses are size and time bounded and allowlisted to known setting fields. A static website cannot use an operating-system credential vault, so the Home Assistant credential boundary is not complete and must not accept a reusable access token until a secure mediated design exists.

## Verification

Source inspection confirmed local labels, start and end times, selected weekdays, stable generated IDs, enabled state, later-rule precedence, equal-time all-day behavior, cross-midnight windows, browser timezone display, one-second reevaluation, persistence, removal confirmation, and base-theme fallback. The current rules schedule only themes and have no start or end dates, source choice, API validation, or Home Assistant route. Focused boundary tests, localization, accessibility, and built-artifact evidence are pending.

## Suggested articles

- [Settings and appearance](settings-and-appearance.md)
- [Browser storage limitations](../security/browser-storage-limitations.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
