# Private LAN hosting

## Behavior

Private LAN mode allows another trusted device on the same private network to reach the hair-growth service. It is opt-in. The service must bind to a non-loopback address, and the container port must be published on an explicitly chosen private interface.

## Configuration

Set `HAIR_HOST` to the intended container bind address and provide a strong `HAIR_API_KEY`. In Compose, set `HAIR_PUBLISH_ADDRESS` to the exact host-side private address instead of the default loopback value. Set `HAIR_CORS_ORIGINS` only when a browser client needs a known exact origin.

## Failure modes

- Missing or short API key prevents non-loopback startup.
- Firewall rules may block the published port.
- Network address changes can make a saved direct URL stale.
- An overly broad bind exposes health and version routes beyond the intended interface.
- CORS configuration does not protect non-browser clients and is not a replacement for the API key.

## Security and privacy

Use this mode only on a private trusted network. Do not publish the service directly to the public internet. Prefer an SSH tunnel when the server host is not on the same trusted network segment. Never embed credentials in the server URL or commit them to Compose files.

## Verification

Source inspection confirmed the API-key startup requirement and exact-origin CORS. Live host identity, interface binding, firewall reachability, authentication refusal, and end-to-end desktop synchronization remain pending.

## Suggested articles

- [SSH tunnels](ssh-tunnels.md)
- [Docker deployment](docker-deployment.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
