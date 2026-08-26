# Scheduled and external settings

## Behavior

The L06 schedule contract temporarily overrides website language, theme, density, accent, font scale, and motion. Base settings remain stored separately and return when no enabled rule matches. Other appearance and customization values are not part of this rule shape yet and remain an explicit completeness gap rather than being silently ignored.

A local rule can use optional inclusive start and end dates, start and end times, every day or an explicit weekday set. Evaluation receives the browser-resolved IANA timezone as a separate input rather than duplicating it into every rule. A normal time window matches from its start up to, but not including, its end on the same local date. A cross-midnight window is attributed to its start weekday, and its after-midnight portion belongs to the previous start date and weekday. Its end is also exclusive. Equal start and end times are the explicit all-day exception. Date boundaries are evaluated from the current instant in the displayed timezone before precedence is resolved.

Every rule has a stable identifier, bounded label, enabled state, source type, explicit priority, and deterministic list order. Higher priority wins. When priorities are equal, the later rule in persisted list order wins. One rule is applied atomically, so values from two equal candidates are never mixed. An edit records a new local revision, and an expired override never overwrites the visitor's base values.

Each rule may use local values, a validated versioned HTTPS API, or a Home Assistant boolean entity. An active validated API response can supply allowlisted partial settings that override that rule's persisted settings for the current evaluation only. It never changes the persisted rule or base settings. A Home Assistant `binary_sensor` or `input_boolean` state of `on` activates the persisted rule values, while `off` leaves the base value or another matching rule in effect. External results refresh on activation and a bounded interval. A generation identifier prevents an older response from overwriting a newer edit or result.

## Configuration

The schedule editor includes a label, native start and end dates, start and end times, Every day versus selected weekdays, priority, enabled state, language, theme, density, accent, font scale, motion, source selection, API configuration, Home Assistant configuration, timezone status, and the rule list. The editor displays the browser-resolved IANA timezone used by evaluation. The timezone is not stored redundantly on every rule.

Saved rules from the preceding website version are migrated before strict validation. A prior theme-only rule retains its identifier, label, enabled state, times, weekdays, theme, and creation time. Migration gives it priority zero, no date limits, a local source, and no language, density, or motion override. Its accent and font scale are initialized from the visitor's saved base settings so migration does not immediately change those values. Malformed or mixed legacy records remain invalid and are quarantined with the enclosing saved state instead of being partially applied.

The persisted rule has exactly `id`, `label`, `enabled`, `priority`, `startDate`, `endDate`, `start`, `end`, `everyDay`, `days`, `settings`, `source`, and `createdAt`. Priority is an integer from -1000 through 1000. Dates are blank or real `YYYY-MM-DD` values. Times are real `HH:MM` values. Days are unique integers from 0 through 6 and are required when Every day is off.

The `settings` object has exactly `language`, `theme`, `density`, `accent`, `fontScale`, and `motion`. Language is `unchanged`, `en`, `yue`, or `both`. Theme is `unchanged`, `dark`, `light`, or `contrast`. Density is `unchanged`, `compact`, `comfortable`, or `spacious`. Accent is `unchanged` or a 3, 4, 6, or 8 digit hexadecimal color. Font scale is from 0.75 through 2. Motion is `unchanged`, `full`, or `reduced`.

The `source` object has exactly `kind`, `url`, and `entityId`. Kind is `local`, `api`, or `homeAssistant`. Local values use the same validators as direct settings changes. External sources define a request timeout, refresh interval bounds, maximum response bytes, expected schema version, and allowlisted setting keys. Unknown fields, unsupported versions, invalid partial date or time input, impossible date ranges, or an empty weekday set reject the complete rule instead of applying a subset.

An API URL must use HTTPS. HTTP is accepted only for exact loopback hosts. Redirects, embedded credentials, URL fragments, file URLs, non-HTTP schemes, and host changes after validation are rejected. A Home Assistant rule also requires a validated base URL and an entity identifier matching `binary_sensor.*` or `input_boolean.*`.

## Failure modes

- Invalid or partial dates and times do not create a rule.
- A start date after an end date is invalid. Omitting both dates leaves the date range unbounded.
- An empty weekday selection is invalid unless Every day is selected.
- Daylight-saving changes are evaluated from the current instant in the browser-resolved IANA timezone. The displayed local date and time are compared directly, so a skipped wall-clock interval never produces a synthetic match and both occurrences of a repeated wall-clock interval are evaluated consistently.
- An older network response cannot overwrite a newer edit or activation.
- Offline, malformed, refused, redirected, oversized, timed-out, rate-limited, unauthenticated, or `off` sources retain the local base state or another currently valid rule and show a non-blocking recovery message.
- A remote value is never silently written back as the permanent base setting.
- Removing or disabling the winning rule immediately recomputes the winner and restores the base state when no other rule matches.
- A browser suspended in the background recomputes from current time on resume instead of replaying every missed interval.

## Security and privacy

External responses are size and time bounded, parsed as a versioned schema, and allowlisted to known setting fields. They cannot provide scripts, markup, file paths, arbitrary URLs, or additional requests. Requests use cancellation and generation checks and never log response bodies or credential values.

A static website cannot place a Home Assistant access token in an operating-system credential vault, and cross-origin browser requests are subject to the target's CORS policy. The direct route therefore accepts a token only into tab memory for the current page lifetime. The token is never written to the rule, browser storage, history, exports, logs, documentation, or a URL, and reloading the page requires it again. This has lower durability and isolation than an operating-system vault and the interface states that limitation.

The direct request works only when the exact validated Home Assistant origin permits the website through CORS. A refused preflight or response remains an unavailable state, not an authentication guess. A visitor who needs durable credential storage or a target that does not permit browser CORS needs an explicitly configured same-origin or loopback mediator that owns the credential outside the static page and returns only the bounded state. The website does not claim that such mediation is automatically installed.

## Verification

Source implementation is present through `validateScheduleRule`, `evaluateScheduleRules`, `validateExternalSettingsResponse`, `addSchedule`, `updateScheduledOverrides`, and `refreshExternalSchedules`. The accepted 12 of 12 pure-contract result proved the exact rule, settings, and source shapes; enum and numeric bounds; real dates and times; URL and entity boundaries; browser-supplied IANA timezone evaluation; optional dates; start-inclusive and end-exclusive normal and cross-midnight windows; the equal-time all-day exception; weekday ownership; highest-priority and later-list-position precedence; external activation; partial API settings; Home Assistant `on` and `off`; and response-schema refusal. The exact schedule test titles are `validates bounded scheduled rules, source fields, URLs, dates, times, and entity identifiers`, `evaluates timezone windows, optional dates, weekdays, cross-midnight rules, and stable precedence`, and `validates versioned API and Home Assistant response envelopes without persisting remote values`. The final runtime-binding test also proves the API `settings` handoff and `evaluation.settings` consumption through deliberate red-to-green mutations. The accepted main source-boundary run passed its schedule controls, schema, response bounds, redirect refusal, and session-token boundaries after the deliberate source-removal state was red.

Those results are source evidence only. Persistence, base-state restoration, background resume, daylight-saving transitions in a real browser, atomic application of the six currently supported settings, broader appearance and customization scheduling, and composed interaction remain pending.

The focused source evidence covers HTTPS and exact-loopback URL validation, embedded-credential and fragment refusal, response schema and allowlists, API activation, Home Assistant `on` and `off`, and source presence for redirect refusal, 16 KiB response bounds, a 3-second timeout, session-only credentials, and generation ordering. Real redirects, oversized bodies, cancellation, stale responses, offline behavior, missing credentials, CORS refusal, optional mediator absence, rate limiting, remote-value non-persistence, composed-website interaction, and capture evidence remain pending.

## Suggested articles

- [Language, playfulness, School mode, and startup surprise](language-and-school-mode.md)
- [Settings and appearance](settings-and-appearance.md)
- [Browser storage limitations](../security/browser-storage-limitations.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
