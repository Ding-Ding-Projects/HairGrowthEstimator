# Docker deployment

## Behavior

The provided Dockerfile packages only the service on `node:22-alpine`. It runs as the unprivileged `node` user, stores persistent data under `/data`, and exposes port 4782. The Compose service adds a named volume, read-only root file system, temporary `/tmp`, dropped Linux capabilities, and `no-new-privileges`.

## Configuration

Compose publishes to host loopback by default through `HAIR_PUBLISH_ADDRESS=127.0.0.1` and `HAIR_PUBLISH_PORT=4782`. Environment variables pass the service bind, API key, allowed origins, and data-file path.

## Failure modes

- The Dockerfile sets `HAIR_HOST=127.0.0.1`. Inside a container, that prevents traffic arriving through the container interface unless deployment overrides it. Compose currently inherits that default unless `HAIR_HOST` is provided. This is an unresolved deployment defect.
- No container health check is declared.
- `node:22-alpine` is a mutable tag unless a digest is pinned.
- Read-only mode requires every write to stay under the mounted data path or temporary file system.

## Security and privacy

The container runs without root privileges and without Linux capabilities. API keys belong in the deployment's secret store or protected runtime environment, not in source, Compose defaults, logs, or command arguments. Avoid exposing the port on public interfaces.

## Verification

Source inspection confirmed the least-privilege Compose settings. The accepted hardening suite adds a source-level counterpart audit tying the documented `docker compose up --build -d` command to the `hair-growth-api` Compose service, server health and profile routes, and `CMD ["node", "server/index.js"]`. The planned deliberate break changes only the server health-route counterpart. This does not resolve the container bind defect and is not image or runtime evidence. Image build, loopback and private-LAN reachability, persistent restart, read-only operation, health checking, digest pinning, and deployed service behavior remain pending.

## Suggested articles

- [Local service operation](local-service.md)
- [Private LAN hosting](private-lan.md)
- [Status Hub boundaries](../security/status-hub-boundaries.md)
