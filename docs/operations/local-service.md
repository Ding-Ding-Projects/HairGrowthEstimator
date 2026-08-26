# Local service operation

## Behavior

The service is a Node.js HTTP process started with `node server/index.js` or the package script `npm run start:server`. It exposes `/health`, `/version`, and profile or haircut routes under `/api/profiles/{profileId}`. It binds to loopback by default.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HAIR_HOST` | `127.0.0.1` | Bind address |
| `HAIR_PORT` | `4782` | Listening port |
| `HAIR_DATA_FILE` | `data/hair-growth.json` | Persistent JSON file |
| `HAIR_API_KEY` | empty | API key, required for non-loopback binding |
| `HAIR_CORS_ORIGINS` | empty | Comma-separated exact allowed origins |

The port must be an integer from 1 through 65535. The service refuses non-loopback startup when the API key is shorter than 24 characters.

## Failure modes

- Invalid configuration stops startup with an explicit error.
- Request bodies above 64 KiB receive HTTP 413.
- Invalid JSON and invalid domain values receive HTTP 400.
- Unknown routes receive HTTP 404 and unsupported methods receive HTTP 405.
- The service request timeout is 15 seconds and the header timeout is 10 seconds.
- Corrupt persistent JSON currently propagates as a server failure rather than automatic reset.

## Security and privacy

Loopback is the safe default. Responses disable caching and MIME sniffing. CORS uses exact configured origins. When an API key is configured, comparison is timing safe and all profile routes require the `x-api-key` header. Health and version remain public to the bound network.

## Verification

Source inspection confirmed the routes, bounds, headers, authentication boundary, and default loopback bind. The accepted hardening suite adds a source-level counterpart audit tying the website container command to the server `/health` and profile-route boundaries, the `hair-growth-api` Compose service, and the container entry point. Its deliberate break changes the server health route and is pending until the suite and all integrated source owners are inspected together. This source audit is not runtime service evidence. Process launch, request matrix, restart persistence, malformed database recovery, and container health evidence remain pending.

## Suggested articles

- [HTTP API](../api/README.md)
- [Private LAN hosting](private-lan.md)
- [Docker deployment](docker-deployment.md)
