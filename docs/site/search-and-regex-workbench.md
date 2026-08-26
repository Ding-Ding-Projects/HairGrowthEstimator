# Search and regex workbench

## Behavior

Every website search field must keep plain-text search as its default and provide its own adjacent anchored full regex builder. The builder uses the browser's JavaScript regular-expression engine and must identify the engine, dialect, supported flags, supported and unsupported constructs, escaping rules, and bounded evaluation behavior.

The full workbench covers guided and raw construction, explanations, token annotations, live matches, capture tables, replacement preview, expected-match test cases, saved snippets, import and export, match navigation, zero-width matches, bounded timing, backtracking-risk warnings, adversarial-input warnings, and a bounded trace or an exact explanation when tracing is unavailable.

## Configuration

Each search field owns its own query, pattern, flags, validation, and mode. State must never leak between a global search, menu filter, dropdown filter, tab search, settings search, history search, or another owner. Pattern and sample limits must be explicit and enforced before evaluation.

Regular-expression evaluation runs in a dedicated local Worker from `site/regex-worker.js`, not on the main interface thread. `site/regex-client.js` provides `createRegexWorkerClient` with bounded concurrency and queueing, per-request disposable Workers, response identifiers, cancellation, deadlines, and termination on every settlement path. If Worker construction throws, the client releases the active slot before rejecting and continues pumping queued work. If `postMessage` throws, the shared settlement path terminates the Worker, releases the active slot, pumps the queue, and rejects the request once. The Worker bounds pattern, sample, replacement, test-case, batch, match-count, and response sizes and has no DOM authority. `runRegexWorkbench` uses the Worker `scan` operation. `filterSearchItems` keeps plain-text matching local by default and routes regex-enabled owner searches through the Worker `testMany` operation in bounded batches, with per-owner cancellation and stale-generation refusal. Worker creation failure disables regex evaluation instead of falling back to synchronous construction. The static Content Security Policy permits only the local Worker source. Built interaction remains pending.

## Failure modes

- Invalid syntax must preserve the user's input and show an inline error.
- Unsupported constructs remain visible with an exact engine explanation.
- Empty and zero-width matches must advance safely and terminate.
- Evaluation exceeding its bound must stop and report that no result was produced.
- A timed-out or malformed Worker response must terminate that Worker before another evaluation starts.
- Worker creation failure must leave the interface usable and report that bounded evaluation is unavailable. It must not fall back to synchronous regular-expression execution.
- Worker construction or `postMessage` failure must reject the affected request and release queue capacity, so a later valid request is not blocked by a leaked active slot.
- An empty result renders a named no-match state.

## Security and privacy

Patterns and sample text are evaluated locally and are not transmitted or persisted without a deliberate save action. Evaluation must be bounded to reduce regular-expression denial-of-service risk. Worker messages carry only the bounded pattern, flags, sample, replacement, expected cases, and generated request identifier. They must not include visitor state, credentials, file paths, or DOM content outside the selected sample.

## Verification

The browser source implements independent owner records, plain or regex modes, pattern and sample bounds, flag filtering, structured token explanations, Worker-backed live matches and captures, replacement preview, expected outcomes, copy, strict JSON snippet import, export, elapsed timing, heuristic backtracking warnings, and queue recovery after Worker construction or message-send refusal. Source inspection found regular-expression constructors only in `site/regex-worker.js`; `site/app.js` routes `runRegexWorkbench` and `filterSearchItems` through `createRegexWorkerClient` and has no synchronous regular-expression fallback. The focused hardening test covers bounded Worker recovery after a refused construction path. Guided construction, a complete engine capability matrix, saved snippet management, match navigation, trace support, and built-site interaction evidence remain incomplete.

## Suggested articles

- [Tabbed navigation](tabbed-navigation.md)
- [Settings and appearance](settings-and-appearance.md)
- [Regex-builder ownership inventory](../inventory/regex-builders.md)
