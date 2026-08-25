# Haircut history and reset behavior

## Behavior

The server stores dated haircut records with an identifier, post-cut length in centimetres, a note, and an update timestamp. Creating a record replaces another record with the same identifier and sorts the resulting history by date, newest first. A record can be deleted by identifier.

The browser source creates or edits a dated haircut record, stores its post-cut length in canonical centimetres, sorts records with newer dates first, and replaces the estimator baseline date and length with that haircut. The website then rerenders the record list and estimate. The desktop renderer transition remains pending because the renderer was not present at the latest inspection.

## Configuration

- Dates use `YYYY-MM-DD`.
- Post-cut length is bounded to 0 through 300 centimetres.
- Notes are trimmed and limited to 500 characters.
- Client-supplied identifiers must use 8 through 64 letters, numbers, or hyphens. Otherwise the server creates a UUID.

## Failure modes

- Invalid dates, lengths, notes, and objects receive HTTP 400.
- Deleting an unknown record receives HTTP 404.
- Concurrent service writes are serialized through the store transaction queue.
- No edit-specific HTTP route exists. A client currently edits by posting the same identifier again.
- Browser bulk deletion routes through the declared destructive-action confirmation, but undo and built interaction proof remain pending.
- Desktop deletion confirmation and undo behavior are not present in the inspected renderer snapshot.

## Security and privacy

Haircut dates and notes may be personal. The service writes them to its configured data file with restrictive file mode where supported. Network mode requires an API key. Logs do not print record bodies.

## Verification

Source inspection confirmed create, edit, sort, browser baseline reset, filtered export, and bulk deletion in `site/app.js`, plus create, replace-by-identifier, sort, and delete behavior in `server/index.js`. Focused API tests, browser and desktop reset tests, destructive confirmation tests, history export tests, and built-artifact evidence are pending.

## Suggested articles

- [Hair growth estimation](hair-growth-estimation.md)
- [Export behavior](export.md)
- [HTTP API](../api/README.md)
