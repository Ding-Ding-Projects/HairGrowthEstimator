# Export behavior

## Behavior

The desktop preload bridge exposes a save operation that writes caller-provided UTF-8 text to a user-selected destination. The save dialog supports folder creation and overwrite confirmation.

The browser source serializes a redacted visitor-state record to JSON, JSONL, YAML, TOML, XML, CSV, TSV, Markdown, HTML, SQL, TypeScript, JavaScript, Python, Go, Rust, JSON Schema, and Protobuf text. It also exports haircut records, history, changelog entries, regex snippets, and appearance presets through browser downloads. Authenticator secrets, lock credentials, personal-vocabulary mappings, and custom-logo bytes are identified as omitted from the general state export.

The desktop preload exposes an isolated save boundary, but desktop serializers and direct Visual Studio Code handoff remain pending.

## Configuration

The renderer supplies a suggested filename and complete content. A complete export implementation must state encoding, line endings, schema version, active filters, omitted fields, and any lossy representation before writing.

## Failure modes

- Canceling the save dialog returns `{ canceled: true }`.
- A file-system write failure rejects the operation.
- The current main-process handler trusts renderer-provided content size and has no explicit byte bound. A bounded contract is still required.
- There is no confirmed direct open-in-Visual-Studio-Code action.

## Security and privacy

Exports are user-directed and may contain personal measurements and notes. API keys and other credentials must never be serialized. Overwrites must remain an explicit user decision.

## Verification

Source inspection confirmed the isolated desktop save bridge, overwrite-aware dialog, browser serializers, redacted general export record, and feature-specific browser downloads. Serializer tests, redaction tests, size-bound tests, cancel and overwrite interactions, format round trips, archive formats, editor handoff, and built-artifact evidence are pending.

## Suggested articles

- [Haircut history and reset behavior](haircut-history.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
- [Local file converter limits](../security/file-converter-boundaries.md)
