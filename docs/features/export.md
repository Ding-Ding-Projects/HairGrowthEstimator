# Export behavior

## Behavior

The desktop preload bridge exposes a save operation that writes caller-provided UTF-8 text to a user-selected destination. The save dialog supports folder creation and overwrite confirmation.

The browser source serializes a redacted visitor-state record to JSON, JSONL, YAML, TOML, XML, CSV, TSV, Markdown, HTML, SQL, TypeScript, JavaScript, Python, Go, Rust, JSON Schema, and Protobuf text. It also exports haircut records, history, changelog entries, regex snippets, and appearance presets through browser downloads. Authenticator secrets, lock credentials, personal-vocabulary mappings, and custom-logo bytes are identified as omitted from the general state export.

CSV and TSV no longer reduce the combined state to aggregate counts. They use one normalized long-form row for every JSON scalar or empty container in the complete redacted export. Each row contains `schemaVersion`, `exportedAt`, `encoding`, `lineEndings`, `representation`, `privacy`, `recordType`, `recordId`, `path`, and `valueJson`. The path is an RFC 6901-style JSON Pointer into the redacted record. `recordType` identifies the top-level state collection and `recordId` carries the nearest stable record identifier when one exists. `valueJson` preserves the JSON type, including strings with commas, quotes, tabs, and line breaks. Empty arrays and objects receive explicit rows, so an empty collection does not disappear.

The desktop preload exposes an isolated save boundary, but desktop serializers and direct Visual Studio Code handoff remain pending.

The general browser export is constructed from a positive allowlist. `buildRedactedExportState` selects the documented exportable visitor-state fields in `site/security-contract.js`, and `redactedExportRecord` consumes that result and adds explicit omission metadata. It does not deep-copy the complete live state and try to remove known secrets afterward, so a future sensitive field stays excluded until the allowlist and documentation are deliberately updated.

JSONL writes the complete redacted record as its first line. Its additional `type: "haircut"` rows are derived only from `record.state.haircuts`, where `record.state` is the positive-allowlist result produced above. `serializeExport` does not read live `state.haircuts` directly, so the convenience rows cannot bypass the export privacy boundary.

## Configuration

The renderer supplies a suggested filename and complete content. A complete export implementation must state encoding, line endings, schema version, active filters, included sections, omitted fields, and any lossy representation before writing.

CSV uses RFC 4180-style quoted cells with doubled embedded quotes and LF records. TSV uses LF records and escapes backslash, tab, carriage return, and line feed characters inside cells. Both repeat explicit representation and privacy metadata on every row so detached row subsets remain understandable. Their representation is faithful to the already redacted JSON record, but neither format restores omitted secrets because those values were deliberately excluded before normalization.

## Failure modes

- Canceling the save dialog returns `{ canceled: true }`.
- A file-system write failure rejects the operation.
- The current main-process handler trusts renderer-provided content size and has no explicit byte bound. A bounded contract is still required.
- There is no confirmed direct open-in-Visual-Studio-Code action.
- A consumer that treats `valueJson` as plain display text instead of JSON will lose value types. The representation column names this requirement before download.
- CSV and TSV import is not implemented. The compatible full-state import remains JSON-only and states that limitation in the current inventory.
- A newly added live-state field is intentionally absent from general export until it is added to the positive allowlist with a privacy review.
- A JSONL serializer that reads live haircut state directly could bypass a later allowlist decision. Haircut rows must continue to come only from `record.state.haircuts`.
- State import must reject unknown root fields, unsafe keys, invalid nested shapes, excessive counts, and values outside their declared bounds before any live state mutation.

## Security and privacy

Exports are user-directed and may contain personal measurements and notes. API keys and other credentials must never be serialized. The positive allowlist excludes authenticator secrets, lock credentials, personal-vocabulary content and metadata, custom-logo bytes, transient coordination data, imported unknown fields, and any future field that has not received an explicit export decision. The normalized tabular rows repeat the full omission statement and never replace a redacted marker with source secret material. Overwrites must remain an explicit user decision.

## Verification

Source inspection confirmed the isolated desktop save bridge, overwrite-aware dialog, browser serializers, normalized CSV and TSV rows, explicit representation and privacy metadata, empty-container rows, feature-specific browser downloads, positive-allowlist `buildRedactedExportState` consumption by `redactedExportRecord`, JSONL haircut-row derivation only from `record.state.haircuts`, strict root-field parsing, sanitized state import, and allowlisted appearance import. The focused hardening test covers the positive-allowlist JSONL source boundary. `tests/site/correctness.test.mjs` proves separate haircut records, nested estimator fields, empty collections, commas, quotes, line breaks, tabs, representation metadata, and privacy omissions survive CSV and TSV serialization, then independently rebuilds the exact input record from the normalized rows. A product import route for tabular formats, size-bound tests, cancel and overwrite interactions, other format round trips, archive formats, editor handoff, and built-artifact evidence remain pending.

## Suggested articles

- [Haircut history and reset behavior](haircut-history.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
- [Local file converter limits](../security/file-converter-boundaries.md)
