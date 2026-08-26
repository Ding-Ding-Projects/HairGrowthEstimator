# Destructive-action confirmation

## Behavior

Consequential delete, clear, overwrite, secret export, and irreversible bulk actions use one in-site confirmation surface. The dialog names the exact action and affected data, requires two independently operated key controls, and enables a full-range slider only after both keys are active. The destructive action runs only after the slider reaches completion.

Emergency exit, Escape, and cancellation remain available throughout. Focus returns to the originating control after cancellation or completion. Reduced motion keeps the state changes and progress factual without non-essential animation.

## Configuration

The template declares `#super-confirm-dialog`, `#confirm-action-name`, `#confirm-impact`, `#confirm-key-a`, `#confirm-key-b`, `#confirm-slider`, `#confirm-progress`, `#complete-confirm`, and emergency-exit actions. Runtime callers must pass a bounded action ID, affected-item preview, execute callback, and focus-return target.

## Failure modes

- One key, a partial slider, synthetic activation, stale callbacks, or a hidden shortcut must not execute the action.
- A changed selection invalidates the pending confirmation and requires a new preview.
- Execution failure reports the exact partial result and retains recoverable data.
- Re-entry is refused while an action is running.

## Security and privacy

The dialog never displays or logs credential values. A confirmation proves deliberate interaction, not identity. It must not be described as authentication or as protection against another person with browser access.

## Verification

Source inspection confirmed the two independent keys, disabled-until-ready slider, exact 100 percent requirement, progress element, delayed completion state, reduced-motion shortening, emergency-exit buttons, and callers for haircut, notification, schedule, appearance, authenticator, and site-data deletion. The current implementation stores a callback in memory but does not invalidate it when the underlying selection changes, and explicit focus return is not present for general destructive callers. Focused keyboard, touch, assistive-technology, Escape, localization, partial-result recovery, and built-artifact evidence are pending.

## Suggested articles

- [Local locks and authenticator](locks-and-authenticator.md)
- [Notifications and local history](notifications-and-history.md)
- [Local file converter](local-file-converter.md)
