# Search and regex workbench

## Behavior

Every website search field must keep plain-text search as its default and provide its own adjacent anchored full regex builder. The builder uses the browser's JavaScript regular-expression engine and must identify the engine, dialect, supported flags, supported and unsupported constructs, escaping rules, and bounded evaluation behavior.

The full workbench covers guided and raw construction, explanations, token annotations, live matches, capture tables, replacement preview, expected-match test cases, saved snippets, import and export, match navigation, zero-width matches, bounded timing, backtracking-risk warnings, adversarial-input warnings, and a bounded trace or an exact explanation when tracing is unavailable.

## Configuration

Each search field owns its own query, pattern, flags, validation, and mode. State must never leak between a global search, menu filter, dropdown filter, tab search, settings search, history search, or another owner. Pattern and sample limits must be explicit and enforced before evaluation.

## Failure modes

- Invalid syntax must preserve the user's input and show an inline error.
- Unsupported constructs remain visible with an exact engine explanation.
- Empty and zero-width matches must advance safely and terminate.
- Evaluation exceeding its bound must stop and report that no result was produced.
- An empty result renders a named no-match state.

## Security and privacy

Patterns and sample text are evaluated locally and are not transmitted or persisted without a deliberate save action. Evaluation must be bounded to reduce regular-expression denial-of-service risk.

## Verification

The browser source implements independent owner records, plain or regex modes, pattern and sample bounds, flag filtering, structured token explanations, live matches and captures, replacement preview, expected outcomes, copy, JSON import and export, elapsed timing, and heuristic backtracking warnings. Evaluation remains synchronous on the main thread, so a catastrophic pattern can block before the elapsed-time report. Guided construction, a complete engine capability matrix, saved snippet management, match navigation, bounded execution isolation, and trace support are incomplete. The complete owner list is maintained in [the regex-builder inventory](../inventory/regex-builders.md). Focused tests and built-site interaction evidence are pending.

## Suggested articles

- [Tabbed navigation](tabbed-navigation.md)
- [Settings and appearance](settings-and-appearance.md)
- [Regex-builder ownership inventory](../inventory/regex-builders.md)
