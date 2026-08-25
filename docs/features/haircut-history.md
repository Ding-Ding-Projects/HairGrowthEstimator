# Haircut history and reset behavior

## Behavior

The server stores dated haircut records with an identifier, post-cut length in centimetres, a note, and an update timestamp. Creating a record replaces another record with the same identifier and sorts the resulting history by date, newest first. A record can be deleted by identifier.

The browser source creates or edits a dated haircut record, stores its post-cut length in canonical centimetres, and sorts records with newer dates first. After every create, edit, or bulk delete, `reconcileBaseline` selects the newest valid remaining haircut as the active estimate baseline. Ties are resolved deterministically by update time and then identifier. Editing an active record to an older date can make another record active. Deleting every valid haircut restores the independently retained manual fallback instead of reusing a deleted record. The website then rerenders the record list, active-source explanation, and estimate. The desktop renderer transition remains pending because the renderer was not present at the latest inspection.

## Configuration

- Dates use `YYYY-MM-DD`.
- Browser haircut dates must be today or earlier in the visitor's local timezone.
- Post-cut length is bounded to 0 through 300 centimetres.
- Notes are trimmed and limited to 500 characters.
- Client-supplied identifiers must use 8 through 64 letters, numbers, or hyphens. Otherwise the server creates a UUID.

## Failure modes

- Invalid dates, lengths, notes, and objects receive HTTP 400.
- Deleting an unknown record receives HTTP 404.
- Concurrent service writes are serialized through the store transaction queue.
- Same-origin browser tabs serialize visitor-state writes through Web Locks or an IndexedDB transaction, attach a monotonic revision and fresh per-document writer identity, and refuse a stale write rather than overwriting a newer revision.
- No edit-specific HTTP route exists. A client currently edits by posting the same identifier again.
- A future-dated legacy browser record remains visible with an inline warning but is excluded from the active baseline while its date remains in the future. Correcting it to today or earlier makes it eligible immediately.
- Browser bulk deletion routes through the declared destructive-action confirmation, but undo and built interaction proof remain pending.
- Desktop deletion confirmation and undo behavior are not present in the inspected renderer snapshot.

## Security and privacy

Haircut dates and notes may be personal. The service writes them to its configured data file with restrictive file mode where supported. Network mode requires an API key. Logs do not print record bodies.

## Verification

Source inspection confirmed create, edit, deterministic sort, baseline reconciliation, filtered export, and bulk deletion in `site/app.js`, selection rules in `site/state-contract.js`, plus create, replace-by-identifier, sort, and delete behavior in `server/index.js`. `tests/site/correctness.test.mjs` proves active selection after create, edit, and delete, retained fallback behavior, and future-record exclusion. Focused API tests, destructive confirmation interaction, history export interaction, desktop reset tests, and built-artifact evidence remain pending.

## Suggested articles

- [Hair growth estimation](hair-growth-estimation.md)
- [Export behavior](export.md)
- [HTTP API](../api/README.md)
