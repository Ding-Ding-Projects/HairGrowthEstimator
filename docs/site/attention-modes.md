# Attention modes

## Behavior

The website exposes five independent interface accommodations. Every mode is off by default and can be combined with any other mode:

- Focus brings the currently selected work forward and de-emphasizes inactive sections. It never hides content that cannot be restored with one obvious action.
- Low stimulation removes non-essential motion, quiets decorative color, and suppresses optional informational interruption. Warnings, errors, decisions, and accessible state changes remain available.
- Time awareness shows the elapsed website session time and the exact time since the most recent visitor-owned change where work is being performed. It reports facts without scoring, praise, or pressure.
- One thing at a time keeps one visitor-chosen next action visible across tab switches and reloads. The website does not infer, rank, or replace that action.
- Momentum offers a factual, dismissible prompt after 40 minutes without a visitor-owned change. Not now suppresses another prompt for one hour and is respected across reloads.

These are presentation accommodations. They are not a diagnosis, assessment, medical feature, treatment claim, productivity score, streak, or ranking. Their names describe what the interface does and do not require a visitor to disclose a condition.

Language mode and funny levels style the copy while durations, timestamps, and the selected next action remain exact. School mode forces the accommodation copy to English but does not silently enable or disable any attention mode. The visitor's existing attention choices remain stored through a School mode transition.

## Configuration

The established controls are `#adhd-focus`, `#adhd-low-stim`, `#adhd-time`, `#adhd-one`, `#next-action`, and `#adhd-momentum`, with `#attention-bar` as the in-context status surface. Each mode is an independent persisted boolean. The next action is bounded plain text. The session start, last visitor-owned change, inactivity threshold, and momentum snooze deadline are bounded timestamps or constants and are validated before duration arithmetic.

The operating system's reduced-motion preference always composes with Low stimulation. Turning Low stimulation off cannot restore motion that the operating system has asked the browser to reduce. Merely reading or rendering the page does not reset inactivity. A change timestamp advances only after a real visitor-owned state mutation succeeds.

## Failure modes

- A mode must never hide content without one obvious way to restore it.
- Low stimulation cannot override an operating-system reduced-motion request with more motion.
- Time awareness clamps invalid or future timestamps and reports an unavailable duration rather than a negative or invented value.
- Momentum respects the promised not-now period instead of reappearing immediately.
- A reload during the snooze period preserves the stated deadline. A clock change triggers a fresh bounded calculation and never creates an unbounded notification loop.
- Empty next-action text produces an honest no-action state rather than a sample task.
- Corrupt attention state falls back to every mode off and reports the reset in a non-blocking message.
- A hidden browser tab does not build a backlog of momentum prompts. Visibility restoration produces at most one current eligibility decision.

## Security and privacy

All attention state remains in visitor-controlled browser storage and is excluded from analytics, telemetry, public records, ordinary diagnostics, and public exports. Copy must never infer or disclose a diagnosis. The visitor-chosen next action is private content and is omitted from captures unless a deterministic non-personal profile supplies it. The modes make no network request and do not transmit timing or activity data.

## Verification

Source implementation is present through `ATTENTION_MODE_KEYS`, `ATTENTION_DEFAULTS`, `normalizeAttentionSettings`, `ATTENTION_SETTING_IDS`, `renderAttentionBar`, `momentumCheck`, `#momentum-snooze`, and the Focus and Low-stimulation styles. The exact pure-contract test title is `keeps all five attention accommodations independent and off by default with bounded state`. The accepted 12 of 12 result proved independent default-off state, trimmed and bounded next-action text, safe invalid-value defaults, and a bounded snooze timestamp. The main source-boundary run passed the five-control registry, Focus and Low-stimulation selectors, momentum control, and exact startup quiet-mode caller after the deliberate source-removal state was red.

Those results are source evidence only. Persistence across reloads, independent combinations, reset cleanup, reversible Focus behavior, operating-system reduced-motion precedence, warning and error delivery, elapsed and last-change timing, real-mutation ownership, no scoring language, truthful next-action empty state, the exact 40-minute threshold and one-hour Not now deadline, background-tab behavior, clock changes, no notification backlog, School mode transitions, all language modes, funny-level extremes, keyboard and screen-reader operation, narrow layouts, high text scaling, composed interaction, and capture evidence remain pending.

## Suggested articles

- [Language, playfulness, School mode, and startup surprise](language-and-school-mode.md)
- [Accessibility and responsive layout](accessibility-and-responsive-layout.md)
- [Settings and appearance](settings-and-appearance.md)
- [Notifications and local history](notifications-and-history.md)
