# Privacy and data boundaries

## Behavior

Measurements, haircut dates, notes, settings, and visitor preferences are local by default. Desktop state lives in the product's private user-data directory. Service state lives in the configured JSON data file. Website preferences live in the visitor's browser profile. Same-origin website tabs exchange only browser storage events from the shared origin. They do not send visitor state over the network.

## Configuration

Network synchronization is opt-in through a configured HTTP or HTTPS service URL or a local SSH forward. Non-loopback service mode requires an API key. Allowed browser origins are exact configured values.

## Failure modes

- A user who clears browser storage loses website-only preferences, locks, local history, and authenticator data.
- A stale same-origin tab mutation is refused after a newer revision is detected. The newer state replaces the older view, and the visitor must repeat any still-needed change.
- An invalid desktop JSON state currently falls back to defaults without preserving the invalid file.
- A server data-file read failure can prevent requests.
- Misconfigured private-LAN publishing can expose the service beyond the intended interface.

## Security and privacy

Do not place API keys, SSH keys, personal vocabulary contents, custom image bytes, authenticator secrets, or private paths in source, logs, captures, issues, release notes, analytics, or ordinary exports. The desktop main process stores the service API key separately with operating-system encryption when available. The website has no equivalent operating-system vault. Its CSV and TSV exports are normalized from the already redacted record and repeat the omission list and representation description on every row.

The website's 10 percent startup surprise references the project-approved public dim-sum catalog image for `hk-dish-0001`; it does not copy that image into this repository. The request carries no measurement, profile identifier, credential, or analytics parameter. The eight hair-length reference photographs follow a different boundary and are local build assets mapped by `assets/hair-growth/stages.json`.

## Verification

Source inspection confirmed separate API-key storage, URL credential rejection, service authentication for non-loopback mode, bounded request bodies, no record-body logging, browser export redaction, normalized tabular privacy metadata, monotonic same-origin revisions, stale-write refusal, and the explicit browser-storage warning. The focused serializer test verifies privacy omissions in CSV and TSV. Complete redaction mutation tests, corrupt-state recovery, the anonymous catalog-asset request, privacy captures, and end-to-end network evidence remain pending.

## Suggested articles

- [Browser storage limitations](browser-storage-limitations.md)
- [Private LAN hosting](../operations/private-lan.md)
- [SSH tunnels](../operations/ssh-tunnels.md)
