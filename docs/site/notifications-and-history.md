# Notifications and local history

## Behavior

Informational, success, progress, and non-decision failures appear as non-blocking corner notifications. Errors and warnings persist until dismissed. A notification center keeps dismissed items reviewable and supports filtering, selection, bulk dismissal, bulk deletion through destructive confirmation, and filtered export.

Visitor-owned settings, lists, and records require append-only local history. History includes factual action labels, date-range and action filters, text search, diff, restore as a new revision, labels, retention controls, and redacted export.

The implemented website stores each accepted state snapshot in a monotonic browser envelope. Same-origin `storage` events load a later revision. A stale transaction produces a persistent warning that names the revision and states that the older change was not saved. This browser-revision mechanism does not turn the bounded history array into Git, full snapshot diff, or cross-device synchronization.

## Configuration

The website stores notification and history state in a versioned browser-local envelope with revision, writer identity, write time, and payload. Web Locks or an IndexedDB read-write transaction serializes same-origin writes. Filters start collapsed when inactive, persist their collapsed state, and disclose an active filter while collapsed.

## Failure modes

- Browser storage exhaustion or corruption must be reported without claiming the new revision was recorded.
- A failed history write must not silently block the primary user action.
- Bulk actions must report partial results and every excluded item.
- Restoring history must create a new entry rather than rewrite prior history.
- A later storage event supersedes queued snapshots from the older local generation. Those snapshots are refused and never replayed over the newer revision.

## Security and privacy

Secrets, personal vocabulary contents, custom logo bytes, authentication material, and private paths are excluded from notification bodies, history snapshots, exports, and captures.

## Verification

Source inspection confirmed corner snackbars, persistent errors and warnings, timed informational messages, a searchable notification list, select-every-match, confirmed bulk deletion, a bounded append-only history array, date and text filtering, redacted history export, monotonic state revisions, stale-write warnings, and same-origin storage-event reconciliation. In Low stimulation mode, informational snackbar interruptions and their narration are suppressed while the records remain available in the notification center; warnings and errors remain visible. `tests/site/correctness.test.mjs` covers exclusive monotonic writes and stale refusal. The current history surface has no action filter, diff, restore, labels, or retention editor. Notification bulk dismissal, filtered export, storage-quota recovery, localization, and built-site evidence remain incomplete.

## Suggested articles

- [Changelog viewer](changelog-viewer.md)
- [Destructive-action confirmation](destructive-confirmation.md)
- [Settings and appearance](settings-and-appearance.md)
- [Local locks and authenticator](locks-and-authenticator.md)
- [Browser storage limitations](../security/browser-storage-limitations.md)
