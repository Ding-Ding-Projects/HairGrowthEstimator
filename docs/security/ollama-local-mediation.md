# Ollama mediation boundary

## Behavior

A public HTTPS website cannot safely assume direct access to a visitor's local Ollama service. The current browser surface offers only an explicit user-requested loopback `/api/tags` probe and reports mixed-content or cross-origin refusal. A complete suite requires an explicitly installed, loopback-only mediator with a bounded allowlisted protocol. It must never proxy model traffic through the public host.

## Configuration

The mediator identifies its version, allowed website origin, local runtime status, supported operations, and payload limits. It accepts only documented local Ollama HTTP API operations and registered harness profiles. Model catalog state records completeness, pages, timestamp, source identity, and staleness.

## Failure modes

- Mixed-content and cross-origin restrictions can block direct local HTTP requests from a public HTTPS page.
- A stopped or missing mediator leaves the website unavailable but still able to show local documentation.
- A stale catalog remains labeled stale and is never presented as current.
- Hardware-fit evidence missing any required fact produces Unknown or a conservative result.

## Security and privacy

Prompts, responses, attachments, local model state, and private paths remain on the visitor's computer. The mediator rejects public bind addresses, arbitrary URLs, redirects, arbitrary shell, unregistered executables, oversized payloads, and secrets in logs or previews.

## Verification

Source inspection confirmed that the browser accepts only `127.0.0.1`, `localhost`, or `[::1]` HTTP or HTTPS URLs without embedded credentials, calls only `/api/tags`, applies a 5-second timeout, rejects a malformed or larger-than-1-MiB JSON result, and caps the stored list at 2,000 tags. There is no installed mediator, exhaustive catalog, hardware evidence, pull queue, chat, or harness. Origin enforcement, mediator binding, broader route allowlist, catalog completeness, secret redaction, harness rollback, and end-to-end local evidence are pending.

## Suggested articles

- [Local Ollama mediation](../site/ollama-mediation.md)
- [Local service operation](../operations/local-service.md)
- [Privacy and data boundaries](privacy-and-data-boundaries.md)
