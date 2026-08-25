# Browser storage limitations

## Behavior

The public website uses browser-local storage for visitor-owned settings and demonstrations. That storage belongs to one browser profile and origin. Same-origin tabs can reconcile revisions, but nothing is shared with another browser profile, device, the installed desktop product, or the optional service unless a separately documented mediator is active.

## Configuration

The browser runtime uses the stable key `hairGrowthEstimator.websiteState.v1` and visitor schema version 1. The value is wrapped in storage-envelope version 1 with a monotonic revision, a fresh writer identifier for each loaded document, recorded write time, and the state payload. It merges recognized nested settings with compiled defaults and provides a destructive-confirmation route to reset the state through the same exclusive transaction path. The key is independent of the visitor-facing display name.

Imported browser state is parsed and validated independently from stored envelopes. `parseJsonStrict`, `validateBrowserState`, `validateAppearanceMap`, and `sanitizeImportedState` reject duplicate or unsafe keys, enforce complete shapes and bounds, and construct a new value that excludes credentials, personal vocabulary, custom-logo bytes, coordination metadata, and unknown fields. The nested `validateOllama` boundary accepts saved local-model state only for `http://127.0.0.1:11434` or `http://localhost:11434`, with an optional root slash, plus bounded model rows and timestamp. A successful live connection persists the normalized `url.origin`. `validateStoredStateEnvelopeText` separately validates bounded stored envelopes and legacy state. The runtime uses those boundaries for initial load, storage-event adoption, persistence snapshots, state import, and appearance import.

Web Locks is the preferred same-origin transaction route. An IndexedDB read-write transaction is the supported fallback. The localStorage read, expected-revision comparison, write, and read-back verification occur inside that exclusive route. No unchecked localStorage write path remains for the combined visitor state.

## Failure modes

- Private or incognito sessions may discard data when closed.
- Browser clearing, origin changes, storage eviction, quota exhaustion, or corruption can remove data.
- Browser storage does not provide an operating-system credential vault.
- Same-origin storage coordination is not server synchronization, backup, or cross-device conflict resolution.
- A stale write is refused and its unsaved local mutation is discarded after the newer stored revision is loaded. The visitor must review and repeat the change if it is still required.
- If both Web Locks and IndexedDB are unavailable, writes stop with a visible failure instead of silently risking an overwrite.
- Static hosting cannot open a local application-data folder or launch arbitrary programs.
- A rejected import must leave the prior revision unchanged and must not partially merge recognized fields from an invalid payload.

## Security and privacy

Website locks and local history are convenience features, not protection against someone with access to the browser profile. Authenticator secrets in browser storage require an explicit limitation disclosure. No visitor-owned state should be sent to the hosting provider beyond ordinary static-file requests.

The current browser runtime stores TOTP secrets and lock TOTP factors in the same localStorage record. General exports redact them, but localStorage itself is plaintext to code running under the origin. This is a known weaker boundary than an operating-system credential vault.

## Verification

Source inspection confirmed the stable key, revisioned envelope, default merge, fresh per-document writer identity, Web Locks and IndexedDB transaction routes, stale-write refusal, storage-event reconciliation, write-failure notification, transaction-based clear-data action, positive-allowlist general export, strict whole-file import, allowlisted appearance import and application, normalized live Ollama origin persistence, exact saved Ollama origin validation, sanitized state construction, bounded stored-envelope parsing, invalid stored-state quarantine, and display-name independence in `site/app.js`, `site/state-contract.js`, and `site/security-contract.js`. The focused hardening test covers the saved Ollama origin source boundary. The focused concurrency test proves monotonic revision and stale-writer behavior through an exclusive lock adapter. Corrupt-state recovery, real IndexedDB contention, quota handling, reload persistence, private-mode behavior, no-network assertions, and built-artifact evidence remain pending.

## Suggested articles

- [Local locks and authenticator](../site/locks-and-authenticator.md)
- [Settings and appearance](../site/settings-and-appearance.md)
- [Privacy and data boundaries](privacy-and-data-boundaries.md)
