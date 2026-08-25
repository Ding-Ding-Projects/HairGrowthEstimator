# Local Ollama mediation

## Behavior

The website's current Ollama surface is a browser-mediated local integration. It performs only an explicit user-requested loopback `/api/tags` request and must not call a cloud model service, invent installed models, or claim that Ollama launches arbitrary programs.

The current surface covers a bounded connection result and installed-tag list. Exhaustive catalog refresh, running-state detail, batch pulls, local chat, hardware fit, and allowlisted harness profiles remain visibly unavailable or absent. Every unavailable state must remain useful through local help and saved state.

## Configuration

The browser accepts only the exact origins `http://127.0.0.1:11434` and `http://localhost:11434`. `connectOllama` rejects HTTPS, IPv6 spellings, other ports, credentials, paths beyond `/`, queries, and fragments, then stores the normalized `url.origin`. The static Content Security Policy names the same two origins in `connect-src`. `validateOllama` restricts saved browser state to the same origins, with only an optional root slash, and bounds the stored model list and check timestamp. The explicit request applies a 5-second timeout, validates a JSON response no larger than 1 MiB, and stores up to 2,000 reported model tags. A complete mediator must additionally identify its exact version, allowlist every supported route, and own privileged operations. Model selection, tag, variant, quantization, context, and parameters must come from verified data. Hardware-fit labels expose their evidence and uncertainty.

## Failure modes

- A static HTTPS website cannot call an arbitrary local HTTP service reliably because of mixed-content and cross-origin boundaries.
- An origin other than the two exact documented loopback origins is rejected before any request or state mutation.
- Without the approved mediator, the surface must show unavailable status and must not simulate data.
- Catalog, pull, and chat timeouts remain bounded and preserve the last verified local state.
- Harness launch accepts only registered executable profiles and never raw shell text.

## Security and privacy

Prompts, chat history, attachments, model state, and local paths remain local. The browser never receives mediator credentials. Harness environment values are allowlisted and secrets are redacted from previews and logs.

## Verification

Source inspection confirmed the two exact HTTP loopback origins in `connectOllama`, normalized origin persistence, the matching Content Security Policy `connect-src`, saved-state enforcement through `validateOllama`, the bounded `/api/tags` request, status copy, tag list, local state, and honest browser limitation text. The focused hardening test covers alignment among the runtime origin set, policy, and saved-state validator. A mediator is absent. Health depth, catalog completeness, offline cache behavior, batch pull, chat streaming, harness preview, rollback, secret exclusion, and built-site evidence remain pending.

## Suggested articles

- [Ollama mediation boundary](../security/ollama-local-mediation.md)
- [Local service operation](../operations/local-service.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
