# Status Hub boundaries

## Behavior

The product and public website require their own status surfaces. A shared Status Hub may receive project and release state, but it does not replace the product's local status controls or the website's public factual status page.

## Configuration

Status records may include public repository URL, default branch, release channel, source commit, build and packaging results, deployment URL, and evidence links. A status value must identify its source and last update time. Unrun checks remain unrun.

## Failure modes

- When the shared hub is unreachable or enrollment is unavailable, the local surface reports that exact limitation and does not claim synchronization.
- A hard-coded status chip is not evidence.
- A question or action control must not appear to send unless a real authenticated endpoint accepted it and the receiving inbox was confirmed.
- A private operational hub must not leak private host or credential information into the public website.

## Security and privacy

The public status surface contains only public release facts. Enrollment credentials and private infrastructure remain outside source, browser bundles, logs, captures, and public records. The public website never receives agent or bridge credentials.

## Verification

The website template and runtime contain a local status panel, embedded-provenance validation, and an explicit unavailable card for the shared service. They do not register a project, synchronize status, or deliver replies. Shared integration, evidence links, authenticated delivery checks, and built-artifact proof remain pending.

## Suggested articles

- [Status and build provenance](../site/status-and-provenance.md)
- [Version and build provenance](../operations/version-provenance.md)
- [Privacy and data boundaries](privacy-and-data-boundaries.md)
