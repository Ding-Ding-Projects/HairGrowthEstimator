# Browser storage limitations

## Behavior

The public website uses browser-local storage for visitor-owned settings and demonstrations. That storage belongs to one browser profile and origin. Same-origin tabs can reconcile revisions, but nothing is shared with another browser profile, device, the installed desktop product, or the optional service unless a separately documented mediator is active.

## Configuration

The browser runtime uses the stable key `hairGrowthEstimator.websiteState.v1` and visitor schema version 1. The value is wrapped in storage-envelope version 1 with a monotonic revision, a fresh writer identifier for each loaded document, recorded write time, and the state payload. It merges recognized nested settings with compiled defaults and provides a destructive-confirmation route to reset the state through the same exclusive transaction path. The key is independent of the visitor-facing display name.

Web Locks is the preferred same-origin transaction route. An IndexedDB read-write transaction is the supported fallback. The localStorage read, expected-revision comparison, write, and read-back verification occur inside that exclusive route. No unchecked localStorage write path remains for the combined visitor state.

## Failure modes

- Private or incognito sessions may discard data when closed.
- Browser clearing, origin changes, storage eviction, quota exhaustion, or corruption can remove data.
- Browser storage does not provide an operating-system credential vault.
- Same-origin storage coordination is not server synchronization, backup, or cross-device conflict resolution.
- A stale write is refused and its unsaved local mutation is discarded after the newer stored revision is loaded. The visitor must review and repeat the change if it is still required.
- If both Web Locks and IndexedDB are unavailable, writes stop with a visible failure instead of silently risking an overwrite.
- Static hosting cannot open a local application-data folder or launch arbitrary programs.

## Security and privacy

Website locks and local history are convenience features, not protection against someone with access to the browser profile. Authenticator secrets in browser storage require an explicit limitation disclosure. No visitor-owned state should be sent to the hosting provider beyond ordinary static-file requests.

The current browser runtime stores TOTP secrets and lock TOTP factors in the same localStorage record. General exports redact them, but localStorage itself is plaintext to code running under the origin. This is a known weaker boundary than an operating-system credential vault.

## Verification

Source inspection confirmed the stable key, revisioned envelope, default merge, fresh per-document writer identity, Web Locks and IndexedDB transaction routes, stale-write refusal, storage-event reconciliation, write-failure notification, transaction-based clear-data action, redacted general export, and display-name independence in `site/app.js` and `site/state-contract.js`. The focused concurrency test proves monotonic revision and stale-writer behavior through an exclusive lock adapter. Corrupt JSON still falls back to defaults without preserving the corrupt bytes or showing a dedicated recovery notification. Real IndexedDB contention, quota handling, reload persistence, private-mode behavior, no-network assertions, and built-artifact evidence remain pending.

## Suggested articles

- [Local locks and authenticator](../site/locks-and-authenticator.md)
- [Settings and appearance](../site/settings-and-appearance.md)
- [Privacy and data boundaries](privacy-and-data-boundaries.md)
