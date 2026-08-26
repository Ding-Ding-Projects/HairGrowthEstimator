# Privacy and data boundaries

## Behavior

Measurements, haircut dates, notes, settings, and visitor preferences are local by default. Desktop state lives in the product's private user-data directory. Service state lives in the configured JSON data file. Website preferences live in the visitor's browser profile. Same-origin website tabs exchange only browser storage events from the shared origin. They do not send visitor state over the network.

## Configuration

Network synchronization is opt-in through a configured HTTP or HTTPS service URL or a local SSH forward. Non-loopback service mode requires an API key. Allowed browser origins are exact configured values.

The website ships a static Content Security Policy in the template HTML. It includes `default-src 'self'`, `script-src 'self'`, `worker-src 'self'`, `connect-src 'self' http://127.0.0.1:11434 http://localhost:11434`, `object-src 'none'`, `frame-src 'none'`, `base-uri 'none'`, and `form-action 'self'`. Image sources are limited to same-origin and data images plus the documented public GitHub asset hosts. Served-header verification and proof that every composed resource remains usable under this policy are pending.

Browser state and appearance imports pass through strict JSON parsing, complete schema validation, allowlisted fields, bounded arrays and strings, unsafe-key rejection, and construction of a new sanitized state before persistence. Saved Ollama state is limited to the same two exact loopback origins allowed by the runtime and Content Security Policy. General export uses a positive allowlist, so a newly added live-state field stays excluded until it receives an explicit privacy and representation decision. JSONL haircut convenience rows come only from the already redacted `record.state.haircuts` array, never directly from live state.

## Failure modes

- A user who clears browser storage loses website-only preferences, locks, local history, and authenticator data.
- A stale same-origin tab mutation is refused after a newer revision is detected. The newer state replaces the older view, and the visitor must repeat any still-needed change.
- An invalid desktop JSON state currently falls back to defaults without preserving the invalid file.
- A server data-file read failure can prevent requests.
- Misconfigured private-LAN publishing can expose the service beyond the intended interface.
- A missing or weakened Content Security Policy can expand the effect of injected markup or a compromised same-origin file.
- Broad object copying during import or export can make a future sensitive field cross the boundary without a deliberate decision.

## Security and privacy

Do not place API keys, SSH keys, personal vocabulary contents or metadata, custom image bytes, authenticator secrets, or private paths in source, logs, captures, issues, release notes, analytics, or ordinary exports. The desktop main process stores the service API key separately with operating-system encryption when available. The website has no equivalent operating-system vault. Its CSV and TSV exports are normalized from the already redacted positive-allowlist record and repeat the omission list and representation description on every row.

The website's 10 percent startup surprise references the project-approved public dim-sum catalog image for `hk-dish-0001`; it does not copy that image into this repository. The request carries no measurement, profile identifier, credential, or analytics parameter. The eight hair-length reference photographs follow a different boundary and are local build assets mapped by `assets/hair-growth/stages.json`.

## Verification

Source inspection confirmed separate API-key storage, URL credential rejection, service authentication for non-loopback mode, bounded request bodies, no record-body logging, normalized tabular privacy metadata, JSONL derivation from `record.state.haircuts`, monotonic same-origin revisions, stale-write refusal, the explicit browser-storage warning, exact Ollama origin alignment, and the static Content Security Policy. `site/security-contract.js` provides strict `parseJsonStrict`, `validateBrowserState`, `validateAppearanceMap`, `sanitizeImportedState`, `validateStoredStateEnvelopeText`, nested `validateOllama`, and positive-allowlist `buildRedactedExportState` boundaries. Active state, appearance, vocabulary, storage-envelope, and export consumers call those boundaries. The focused hardening test covers the JSONL allowlist and Ollama origin source boundaries, and the focused serializer test verifies privacy omissions in CSV and TSV for the current record. Complete built import behavior, corrupt-state recovery, policy response inspection, the anonymous catalog-asset request, privacy captures, and end-to-end network evidence remain pending.

## Suggested articles

- [Browser storage limitations](browser-storage-limitations.md)
- [Private LAN hosting](../operations/private-lan.md)
- [SSH tunnels](../operations/ssh-tunnels.md)
