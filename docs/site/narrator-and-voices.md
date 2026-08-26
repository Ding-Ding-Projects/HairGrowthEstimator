# Narrator and voice selection

## Behavior

The narrator is off by default. Enabling it is a deliberate visitor action. Its persisted language choice is English, Cantonese, or Both. Both always means English followed by Cantonese through one serialized queue. Speech never overlaps, and a newer queued event in the same category replaces its superseded predecessor. Admission uses a 250 ms global debounce plus category cooldowns: 5 seconds for informational, progress, and warning events; 3 seconds for success; 2 seconds for accessibility; 1 second for destructive and security; and 0 seconds for errors. An error is always admitted as urgent regardless of debounce or a prior error time.

English and Cantonese each have an independent voice picker. The default for each language is Choose automatically. The pickers enumerate voices reported by the browser, persist the stable `voiceURI` identity rather than the localized display name, and explain the voice actually in effect. Voice enumeration is asynchronous. The runtime reads the initial list, subscribes to `voiceschanged`, retries a bounded number of delayed reads when the first list is empty, and unsubscribes during teardown. Rate and pitch use bounded platform-supported ranges and default to normal delivery.

The factual content of a spoken event is the same at every funny level. Voice changes style and delivery, not the error reason, affected record, elapsed time, count, or recovery action. Quiet presentation and reduced-motion preferences suppress only optional cues, not the visible factual message.

Browsers do not expose a dependable, portable signal that says a screen reader is currently speaking. The website therefore cannot promise automatic screen-reader detection or audio ducking. It keeps narration off by default, exposes an explicit visitor-controlled yield setting, stops optional speech when yielding is requested, and states this limitation beside the control. This is an honest browser limitation, not evidence that assistive technology is absent.

## Configuration

The established controls are `#narrator-enabled`, `#narrator-language`, `#voice-en`, `#voice-yue`, `#narrator-rate`, `#narrator-pitch`, and `#assistive-tech-active`, with factual status lines for both voice pickers. Values are accepted only after complete settings validation:

Saved state from the preceding website version is migrated before strict validation. The prior five-field narrator record keeps its enabled state, both stable voice identities, rate, and pitch. Its narrated language starts from the visitor's saved website language, while the newly introduced assistive-technology, quiet-hours, and reduced-sound choices start off. A prior narrator record with an extra, missing, or malformed field is still rejected instead of being partially guessed.

- enabled and yield values are booleans;
- language is `en`, `yue`, or `both`;
- `voiceURIEn` and `voiceURIYue` are either the automatic sentinel or a bounded `voiceURI` reported by the browser;
- persisted rate stays from 0.1 through 10 and pitch stays from 0 through 2; the visible rate slider deliberately offers the narrower 0.5 through 2 range;
- assistive-technology, quiet-hours, and reduced-sound states are booleans;
- `NARRATION_DEBOUNCE_MS` is 250, `NARRATION_COOLDOWNS_MS` carries the fixed per-category values above, and the queue accepts at most 64 entries through the pure contract.

A chosen but currently missing voice identity is retained. The interface does not silently rewrite the preference to automatic selection. If that voice later returns, it can become effective again without another selection.

## Failure modes

- An empty first enumeration remains in a loading state until a bounded retry or `voiceschanged` update resolves it. It is not reported immediately as no voices installed.
- A selected voice that is no longer installed stays selected while the current automatic fallback and missing-selection state are reported separately.
- A network-backed voice may become unavailable offline. When the browser exposes that property, the status identifies it before speech is attempted.
- No compatible voice produces a factual unavailable state. It never substitutes an unrelated language voice while claiming the requested language is active.
- Unsupported speech synthesis leaves all visible messages usable and keeps the narrator control in an honest unavailable state.
- Cancelling, disabling narration, enabling the yield control, or leaving the page cancels the active utterance, clears the bounded queue, and releases event listeners.
- If the Cantonese track in Both mode cannot be spoken, the English track does not become evidence that the complete bilingual event succeeded. The visible status reports the partial result.

## Security and privacy

Narration operates only on already-visible, allowlisted event text. It must not speak credentials, private vocabulary payloads, hidden state, browser-storage contents, or private file paths. The website does not add a narration upload endpoint or transmit speech text itself.

Some browser or operating-system voices are network-backed. Selecting one can cause the browser or platform speech service to process text outside the page. The website cannot inspect or guarantee that provider's transport. The status identifies network-backed voices when the browser reports the fact, and offline behavior remains explicit.

## Verification

Source implementation is present through `normalizeNarratorSettings`, `shouldYieldNarration`, `buildNarrationTracks`, `evaluateNarrationAdmission`, `replaceQueuedNarration`, `scheduleVoiceEnumeration`, `queueNarrationTracks`, and `playSpeechQueue`. The accepted 12 of 12 pure-contract result proved default-off state; English, Cantonese, and strictly ordered Both tracks; independent stable identities; rate and pitch normalization; assistive-technology, quiet-hours, and reduced-sound yielding; exact debounce and category cooldown decisions; urgent error admission; category replacement; and queue bounds. The exact narrator test title is `normalizes narrator choices, yields explicitly, serializes tracks, and replaces queued categories`. The final runtime-binding test is `pins School storage, narrator admission, scheduled API values, voice retry, and startup quiet mode with red-to-green source proof`; it proved narrator admission callers and timestamps, startup and `voiceschanged` delayed enumeration, and listener teardown. The accepted main source-boundary run also passed its narrator boundary after the deliberate source-removal run was red.

Browser assistive-technology verification is limited to the explicit yield control, focus and accessible descriptions, and the documented lack of reliable automatic detection. It must not claim that a static page detected or ducked a real screen reader. Actual empty-then-populated enumeration, missing and returning voices, network-backed status, no-compatible-voice behavior, spoken ordering, real-time debounce and cooldown behavior, speech errors, cancel and teardown, persistence, composed-website interaction, and capture evidence remain pending.

## Suggested articles

- [Language, playfulness, School mode, and startup surprise](language-and-school-mode.md)
- [Accessibility and responsive layout](accessibility-and-responsive-layout.md)
- [Settings and appearance](settings-and-appearance.md)
- [Notifications and local history](notifications-and-history.md)
