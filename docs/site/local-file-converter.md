# Local file converter

## Behavior

The website must present a local file-converter surface with categories for Documents and PDF, Images, Audio, Video, Archives, Structured Data and Spreadsheets, Code and Text, and Binary Encodings. Each category has its own search and adjacent regex builder. Formats with no bundled browser adapter remain visible but disabled with the exact reason.

The current source enables six single-file text adapters: formatted JSON, CSV to TSV, TSV to CSV, text to Base64, Base64 to UTF-8 text, and Markdown to escaped HTML. The source is limited to 1 MiB and the five unsupported media and document categories remain visibly disabled.

## Configuration

Source type is detected from bounded bytes, not only the extension. Enabled adapters declare source signatures, target format, lossiness, metadata and encoding behavior, resource bounds, local execution boundary, and output validation. The queue uses bounded chunks and must not load every selected path or byte into memory.

## Failure modes

- Unsupported, malformed, encrypted, or oversized input remains unchanged.
- Lossy output requires a specific disclosure before conversion.
- Output is offered only after signature or parse validation.
- Browser APIs cannot provide a complete offline adapter set for every known format, so unavailable formats remain disabled rather than delegated to a server.
- PDF operations remain disabled until a bundled offline adapter is proven.

## Security and privacy

Files remain local. No conversion may upload contents, invoke a network service, or rely on a developer-machine executable. Temporary browser data is bounded and cleared after completion or cancellation.

## Verification

Source inspection confirmed the visible category catalog, adapter selection, single-file read, progress control, preview, cancellation, and browser download in `site/index.template.html` and `site/app.js`. Byte-signature detection, a complete adapter registry, per-category searches, isolated execution, unlimited resumable queue behavior, PDF tools, full output validation, focused tests, offline evidence, accessibility evidence, and real interactions are pending.

## Suggested articles

- [Local file converter limits](../security/file-converter-boundaries.md)
- [Search and regex workbench](search-and-regex-workbench.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
