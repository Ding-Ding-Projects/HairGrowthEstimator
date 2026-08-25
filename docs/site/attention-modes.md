# Attention modes

## Behavior

The website exposes five independent, off-by-default interface accommodations:

- Focus de-emphasizes inactive sections without hiding them.
- Low stimulation reduces non-essential motion and informational interruption.
- Time awareness shows elapsed session time and time since the last local change.
- One thing at a time keeps one user-chosen next action visible across context changes.
- Momentum offers a factual, dismissible prompt after inactivity and respects a stated not-now period.

The modes can be combined. They are not a diagnosis, assessment, medical feature, productivity score, streak, or ranking.

## Configuration

The template declares `#adhd-focus`, `#adhd-low-stim`, `#adhd-time`, `#adhd-one`, `#next-action`, and `#adhd-momentum`, plus the `#attention-bar` display. Each mode requires an independent persisted boolean. The next action and momentum snooze deadline require bounded strings and timestamps.

## Failure modes

- A mode must never hide content without one obvious way to restore it.
- Low stimulation cannot override an operating-system reduced-motion request with more motion.
- Time awareness reports factual durations and does not nag.
- Momentum respects the promised not-now period instead of reappearing immediately.
- Corrupt state falls back to every mode off and reports the reset.

## Security and privacy

All attention state remains in browser-local storage and is excluded from analytics and public records. Copy must never infer or disclose a diagnosis. The user-chosen next action is ordinary private content and is omitted from captures unless a deterministic non-personal profile supplies it.

## Verification

Source inspection confirmed five independent default-off booleans, persisted next action, focus and low-stimulation classes, elapsed and last-change text, a visible next-action bar, and a 40-minute momentum notification with a one-hour snooze deadline. Low stimulation suppresses informational snackbar interruptions and informational narration while continuing to record the message in the notification center. Warnings and errors remain visible and eligible for narration. Focused evidence must cover independent combinations, persistence, exact timers, snooze, reduced motion, School mode interaction, three language modes, funny-level extremes, keyboard and screen-reader paths, narrow layouts, and captures.

## Suggested articles

- [Accessibility and responsive layout](accessibility-and-responsive-layout.md)
- [Settings and appearance](settings-and-appearance.md)
- [Notifications and local history](notifications-and-history.md)
