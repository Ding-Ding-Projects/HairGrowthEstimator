# SSH tunnels

## Behavior

The desktop main process can start a hidden `ssh.exe` process that forwards a selected local loopback port to the service's loopback port on a private host. The process uses batch mode, refuses interactive password prompts, checks the persistent user `known_hosts` file, requires forward setup to succeed, and sends bounded connection-state events to the renderer.

## Configuration

The SSH settings contain host, port, username, remote API port, local forwarded port, and an optional key-file path. The default SSH port is 22, remote API port is 4782, and local forwarded port is 14782. Host, username, and all ports are validated before process launch.

The current exact options include:

```text
BatchMode=yes
StrictHostKeyChecking=yes
UpdateHostKeys=no
UserKnownHostsFile=<user home>/.ssh/known_hosts
ExitOnForwardFailure=yes
ServerAliveInterval=30
ServerAliveCountMax=3
```

## Failure modes

- A host absent from `known_hosts` is refused by the current implementation.
- A changed recorded key is refused.
- Missing `ssh.exe` produces a specific error state.
- The current readiness check treats a process still running after 900 ms as connected. It does not independently probe the forwarded HTTP service and still requires repair.
- Tunnel exit after readiness changes state to disconnected.
- A key-file picker accepts several extensions but does not prove key format or file permissions.

## Security and privacy

Passwords are not accepted. Host-key verification is never disabled. The API remains bound to loopback on both ends of the forward. SSH diagnostics are bounded to the final 2,000 characters before a one-line user message, but future logging must continue to avoid key material and private paths.

## Verification

Source inspection confirmed strict known-host verification, no password prompt, port bounds, safe process spawning, and teardown. Tests against known, unknown, and changed host keys, independent service readiness, process cleanup, and built-artifact interactions are pending.

## Suggested articles

- [Private LAN hosting](private-lan.md)
- [Local service operation](local-service.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
