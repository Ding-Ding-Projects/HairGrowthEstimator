# Ollama mediation boundary

## Behavior

A public HTTPS website cannot safely assume direct access to a visitor's local Ollama service. The current browser surface offers only an explicit user-requested loopback `/api/tags` probe and reports mixed-content or cross-origin refusal. A complete suite requires an explicitly installed, loopback-only mediator with a bounded allowlisted protocol. It must never proxy model traffic through the public host.

## Configuration

The current browser probe accepts only `http://127.0.0.1:11434` or `http://localhost:11434`, with no credentials, extra path, query, or fragment. It stores `url.origin`, while the saved-state validator permits only those same origins with an optional root slash. The template Content Security Policy uses the same two `connect-src` entries. A future mediator must identify its version, allowed website origin, local runtime status, supported operations, and payload limits. It accepts only documented local Ollama HTTP API operations and registered harness profiles. Model catalog state records completeness, pages, timestamp, source identity, and staleness.

## Failure modes

- Mixed-content and cross-origin restrictions can block direct local HTTP requests from a public HTTPS page.
- A stopped or missing mediator leaves the website unavailable but still able to show local documentation.
- A stale catalog remains labeled stale and is never presented as current.
- Hardware-fit evidence missing any required fact produces Unknown or a conservative result.

## Security and privacy

Prompts, responses, attachments, local model state, and private paths remain on the visitor's computer. The mediator rejects public bind addresses, arbitrary URLs, redirects, arbitrary shell, unregistered executables, oversized payloads, and secrets in logs or previews.

## Verification

Source inspection confirmed that the browser accepts only the exact HTTP origins `http://127.0.0.1:11434` and `http://localhost:11434`, stores the normalized origin, calls only `/api/tags`, applies a 5-second timeout, rejects a malformed or larger-than-1-MiB JSON result, and caps the stored list at 2,000 tags. `validateOllama` and the static Content Security Policy carry the same origin boundary. The restored focused hardening test covers this source alignment. There is no installed mediator, exhaustive catalog, hardware evidence, pull queue, chat, or harness. Mediator binding, broader route allowlisting inside a future mediator, catalog completeness, secret redaction, harness rollback, and end-to-end local evidence remain pending.

## Suggested articles

- [Local Ollama mediation](../site/ollama-mediation.md)
- [Local service operation](../operations/local-service.md)
- [Privacy and data boundaries](privacy-and-data-boundaries.md)
