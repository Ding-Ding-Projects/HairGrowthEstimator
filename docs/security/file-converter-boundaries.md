# Local file converter limits

## Behavior

The website file converter may enable a format only when a verified offline browser adapter is bundled and proven. Known unsupported formats remain visible but disabled. The converter must detect source types from bounded bytes and validate every output before offering it.

The current browser source provides six bounded text adapters: formatted JSON, CSV to TSV, TSV to CSV, text to Base64, Base64 to UTF-8 text, and Markdown to escaped HTML. Documents and PDF, Images, Audio, Video, and Archives are visible but disabled. This is a limited browser utility, not the complete universal converter.

## Configuration

Each adapter declares byte, pixel, page, frame, item, recursion, time, memory, and temporary-storage bounds. The queue uses bounded concurrency, persistent per-file state, pause, resume, cancel, and constant-memory backpressure. Destination capacity is checked before work begins where the browser exposes the information.

## Failure modes

- Browser sandboxes cannot bundle or safely expose every native media and document converter.
- PDF inspection and editing stay disabled until a complete offline adapter is packaged and verified.
- Encrypted input requires user-supplied access and must not leak that input.
- Lossy conversion can omit metadata, color profiles, transparency, animation, precision, fonts, or encoding and must disclose the exact loss first.

## Security and privacy

The converter never uploads a file, calls a remote conversion service, discovers executables through `PATH`, or runs arbitrary shell input. Source files remain unchanged. Temporary output is cleared after failure or cancellation.

## Verification

Source inspection confirmed a 1 MiB per-file limit, local `File` reads, progress values, cancellation before download, preview, object-URL download, and the six adapters in `site/app.js`. The current code reads the selected file fully into memory, accepts the browser-reported MIME type for the file picker, and does not provide signature detection, isolated workers, an unlimited paged queue, crash recovery, storage-capacity preflight, complete output-type validation, or PDF tools. Focused tests, offline proof, accessibility, and built-artifact evidence are pending.

## Suggested articles

- [Local file converter](../site/local-file-converter.md)
- [Privacy and data boundaries](privacy-and-data-boundaries.md)
- [Search and regex workbench](../site/search-and-regex-workbench.md)
