# HTTP API

The HTTP API stores one profile and its haircut history under a caller-selected profile identifier.

## Endpoints

| Method | Path | Purpose | Authentication |
| --- | --- | --- | --- |
| `GET` | `/health` | Runtime status, version, and bind mode | None |
| `GET` | `/version` | Service name and version | None |
| `GET` | `/api/profiles/{profileId}` | Read a profile record | API key when configured |
| `PUT` | `/api/profiles/{profileId}` | Create or replace profile values | API key when configured |
| `POST` | `/api/profiles/{profileId}/haircuts` | Create or replace a haircut by identifier | API key when configured |
| `DELETE` | `/api/profiles/{profileId}/haircuts/{haircutId}` | Delete one haircut | API key when configured |

## Configuration

See [Local service operation](../operations/local-service.md) for environment variables and start commands. The service accepts JSON bodies up to 64 KiB and returns JSON with `cache-control: no-store` and `x-content-type-options: nosniff`.

## Failure modes

The API uses HTTP 400 for invalid data, 401 for an invalid API key, 403 for a disallowed browser origin, 404 for an unknown route or record, 405 for an unsupported method, 413 for an oversized request body, and 500 for an unexpected service failure.

## Security and privacy

Use loopback by default. Non-loopback mode requires an API key. The API key is passed through `x-api-key` and must never appear in URLs, source, collection examples, logs, or public records. CORS applies only to configured exact origins and is not client authentication.

## Verification

Source inspection confirmed the route and validation boundaries. Focused request tests and a live Postman collection run are pending.

## Collections

- [Hair Growth API collection](hair-growth-api.postman_collection.json)
- [Master API collection](master.postman_collection.json)

## Suggested articles

- [Haircut history and reset behavior](../features/haircut-history.md)
- [Local service operation](../operations/local-service.md)
- [Private LAN hosting](../operations/private-lan.md)
