# Local storage and optional synchronization

## Behavior

The desktop main process stores version 1 state in `hair-growth.json` under the product's private user-data directory. Writes use a unique temporary file followed by a bounded retrying rename. The optional HTTP service stores profiles and haircut histories in its configured JSON data file and serializes mutations.

Local storage is the default. The product can be configured with a direct HTTP or HTTPS service URL, or with a local port reached through a managed SSH tunnel. The inspected source exposes the required privileged operations through an isolated preload bridge.

The public website uses a separate browser-only transaction contract. The stable localStorage key now contains an envelope with `storageEnvelopeSchema`, a monotonic `revision`, a fresh per-document `writerId`, `writtenAt`, and the version 1 visitor state. A write enters an exclusive Web Locks critical section when available. The browser falls back to a read-write IndexedDB transaction that serializes the same-origin localStorage read, revision comparison, write, and verification. If neither supported route exists, the write is refused visibly instead of using an unsafe best-effort write.

Every write compares its expected revision with the newest stored revision while holding the exclusive transaction. A mismatch returns the newer state and refuses the stale mutation. The tab adopts that state, explains that the older change was not saved, and asks the visitor to repeat it if still needed. A `storage` event adopts later revisions written by other same-origin tabs. No browser state is sent to another device, the optional service, or a network synchronization provider by this mechanism.

## Configuration

- `settings.storageMode` defaults to `local`.
- `settings.serverUrl` defaults to `http://127.0.0.1:4782`.
- Connection timeout defaults to 8,000 ms and is bounded to 1,000 through 30,000 ms by the request helper.
- The service data path is controlled by `HAIR_DATA_FILE`.
- The service accepts a separate profile identifier in each API path.
- The website state key remains `hairGrowthEstimator.websiteState.v1`; envelope revisioning does not change the product identity or import schema.
- A fresh writer identifier is created for each loaded browser document, mirrored into that tab's sessionStorage for local status, and recorded with each committed browser revision. A duplicated tab therefore receives a new identity when its document loads.

## Failure modes

- Missing local data creates a default state.
- Invalid local JSON currently also creates a default state without preserving or surfacing the invalid bytes.
- Transient rename failures with codes `EPERM`, `EACCES`, or `EBUSY` are retried seven times with increasing delay.
- Other write failures propagate to the caller.
- Network timeout aborts the request, while invalid JSON in a server response propagates as an error.
- A same-origin browser write whose base revision is stale is refused. The newer stored revision is loaded and the visitor receives a non-blocking warning.
- A browser without both Web Locks and IndexedDB cannot safely serialize writes, so persistence is refused with an exact recovery message.
- Manually clearing origin storage resets browser-only state and begins a new local revision lifecycle. It does not delete desktop or service data.

## Security and privacy

The API key is encrypted through the operating system storage facility when available and is stored separately from settings. If encryption is unavailable, the main process refuses to store a new key. URLs with embedded credentials are rejected. Network mode on the service requires a configured API key of at least 24 characters.

## Verification

Source inspection confirmed unique temporary files, bounded rename retries, serialized service mutations, bounded request timeouts, separate API-key storage, and URL validation. For the website, inspection confirmed the envelope, Web Locks route, IndexedDB transaction fallback, revision comparison, post-write verification, storage-event reconciliation, and stale-write warning in `site/state-contract.js` and `site/app.js`. `tests/site/correctness.test.mjs` proves two concurrent writers at revision zero produce one revision-one commit and one explicit stale refusal, followed by a revision-two commit. IndexedDB behavior in a real browser, storage quota failures, corrupt-value recovery, full client synchronization, and built-artifact evidence remain pending.

## Suggested articles

- [Local service operation](../operations/local-service.md)
- [Private LAN hosting](../operations/private-lan.md)
- [SSH tunnels](../operations/ssh-tunnels.md)
