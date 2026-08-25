# Export behavior

## Behavior

The desktop preload bridge exposes a save operation that writes caller-provided UTF-8 text to a user-selected destination. The save dialog supports folder creation and overwrite confirmation.

The browser source serializes a redacted visitor-state record to JSON, JSONL, YAML, TOML, XML, CSV, TSV, Markdown, HTML, SQL, TypeScript, JavaScript, Python, Go, Rust, JSON Schema, and Protobuf text. It also exports haircut records, history, changelog entries, regex snippets, and appearance presets through browser downloads. Authenticator secrets, lock credentials, personal-vocabulary mappings, and custom-logo bytes are identified as omitted from the general state export.

CSV and TSV no longer reduce the combined state to aggregate counts. They use one normalized long-form row for every JSON scalar or empty container in the complete redacted export. Each row contains `schemaVersion`, `exportedAt`, `encoding`, `lineEndings`, `representation`, `privacy`, `recordType`, `recordId`, `path`, and `valueJson`. The path is an RFC 6901-style JSON Pointer into the redacted record. `recordType` identifies the top-level state collection and `recordId` carries the nearest stable record identifier when one exists. `valueJson` preserves the JSON type, including strings with commas, quotes, tabs, and line breaks. Empty arrays and objects receive explicit rows, so an empty collection does not disappear.

The desktop preload exposes an isolated save boundary, but desktop serializers and direct Visual Studio Code handoff remain pending.

## Configuration

The renderer supplies a suggested filename and complete content. A complete export implementation must state encoding, line endings, schema version, active filters, omitted fields, and any lossy representation before writing.

CSV uses RFC 4180-style quoted cells with doubled embedded quotes and LF records. TSV uses LF records and escapes backslash, tab, carriage return, and line feed characters inside cells. Both repeat explicit representation and privacy metadata on every row so detached row subsets remain understandable. Their representation is faithful to the already redacted JSON record, but neither format restores omitted secrets because those values were deliberately excluded before normalization.

## Failure modes

- Canceling the save dialog returns `{ canceled: true }`.
- A file-system write failure rejects the operation.
- The current main-process handler trusts renderer-provided content size and has no explicit byte bound. A bounded contract is still required.
- There is no confirmed direct open-in-Visual-Studio-Code action.
- A consumer that treats `valueJson` as plain display text instead of JSON will lose value types. The representation column names this requirement before download.
- CSV and TSV import is not implemented. The compatible full-state import remains JSON-only and states that limitation in the current inventory.

## Security and privacy

Exports are user-directed and may contain personal measurements and notes. API keys and other credentials must never be serialized. The normalized tabular rows repeat the full omission statement and never replace a redacted marker with source secret material. Overwrites must remain an explicit user decision.

## Verification

Source inspection confirmed the isolated desktop save bridge, overwrite-aware dialog, browser serializers, redacted general export record, normalized CSV and TSV rows, explicit representation and privacy metadata, empty-container rows, and feature-specific browser downloads. `tests/site/correctness.test.mjs` proves separate haircut records, nested estimator fields, empty collections, commas, quotes, line breaks, tabs, representation metadata, and privacy omissions survive CSV and TSV serialization, then independently rebuilds the exact input record from the normalized rows. A product import route for those formats, redaction mutation tests, size-bound tests, cancel and overwrite interactions, other format round trips, archive formats, editor handoff, and built-artifact evidence remain pending.

## Suggested articles

- [Haircut history and reset behavior](haircut-history.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
- [Local file converter limits](../security/file-converter-boundaries.md)
