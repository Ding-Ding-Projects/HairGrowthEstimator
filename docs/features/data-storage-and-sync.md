# Local storage and optional synchronization

## Behavior

The desktop main process stores version 1 state in `hair-growth.json` under the product's private user-data directory. Writes use a unique temporary file followed by a bounded retrying rename. The optional HTTP service stores profiles and haircut histories in its configured JSON data file and serializes mutations.

Local storage is the default. The product can be configured with a direct HTTP or HTTPS service URL, or with a local port reached through a managed SSH tunnel. The inspected source exposes the required privileged operations through an isolated preload bridge.

## Configuration

- `settings.storageMode` defaults to `local`.
- `settings.serverUrl` defaults to `http://127.0.0.1:4782`.
- Connection timeout defaults to 8,000 ms and is bounded to 1,000 through 30,000 ms by the request helper.
- The service data path is controlled by `HAIR_DATA_FILE`.
- The service accepts a separate profile identifier in each API path.

## Failure modes

- Missing local data creates a default state.
- Invalid local JSON currently also creates a default state without preserving or surfacing the invalid bytes.
- Transient rename failures with codes `EPERM`, `EACCES`, or `EBUSY` are retried seven times with increasing delay.
- Other write failures propagate to the caller.
- Network timeout aborts the request, while invalid JSON in a server response propagates as an error.

## Security and privacy

The API key is encrypted through the operating system storage facility when available and is stored separately from settings. If encryption is unavailable, the main process refuses to store a new key. URLs with embedded credentials are rejected. Network mode on the service requires a configured API key of at least 24 characters.

## Verification

Source inspection confirmed unique temporary files, bounded rename retries, serialized service mutations, bounded request timeouts, separate API-key storage, and URL validation. Crash recovery, corrupt-file preservation, full client synchronization, conflict behavior, and built-artifact evidence are pending.

## Suggested articles

- [Local service operation](../operations/local-service.md)
- [Private LAN hosting](../operations/private-lan.md)
- [SSH tunnels](../operations/ssh-tunnels.md)
