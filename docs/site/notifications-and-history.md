# Notifications and local history

## Behavior

Informational, success, progress, and non-decision failures appear as non-blocking corner notifications. Errors and warnings persist until dismissed. A notification center keeps dismissed items reviewable and supports filtering, selection, bulk dismissal, bulk deletion through destructive confirmation, and filtered export.

Visitor-owned settings, lists, and records require append-only local history. History includes factual action labels, date-range and action filters, text search, diff, restore as a new revision, labels, retention controls, and redacted export.

## Configuration

The website stores its notification and history state in versioned browser-local storage. Filters start collapsed when inactive, persist their collapsed state, and disclose an active filter while collapsed.

## Failure modes

- Browser storage exhaustion or corruption must be reported without claiming the new revision was recorded.
- A failed history write must not silently block the primary user action.
- Bulk actions must report partial results and every excluded item.
- Restoring history must create a new entry rather than rewrite prior history.

## Security and privacy

Secrets, personal vocabulary contents, custom logo bytes, authentication material, and private paths are excluded from notification bodies, history snapshots, exports, and captures.

## Verification

Source inspection confirmed corner snackbars, persistent errors and warnings, timed informational messages, a searchable notification list, select-every-match, confirmed bulk deletion, a bounded append-only history array, date and text filtering, and redacted history export. In Low stimulation mode, informational snackbar interruptions and their narration are suppressed while the records remain available in the notification center; warnings and errors remain visible. The current history surface has no action filter, diff, restore, labels, or retention editor. Notification bulk dismissal and filtered export are also incomplete. Focused persistence, storage-failure recovery, localization, and built-site evidence are pending.

## Suggested articles

- [Changelog viewer](changelog-viewer.md)
- [Destructive-action confirmation](destructive-confirmation.md)
- [Settings and appearance](settings-and-appearance.md)
- [Local locks and authenticator](locks-and-authenticator.md)
- [Browser storage limitations](../security/browser-storage-limitations.md)
