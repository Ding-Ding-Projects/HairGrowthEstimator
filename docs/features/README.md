# Product features

These articles describe product behavior visible in the inspected source and identify unfinished user-facing boundaries honestly.

## Feature articles

- [Hair growth estimation](hair-growth-estimation.md)
- [Haircut history and reset behavior](haircut-history.md)
- [Centimetres and inches](measurements.md)
- [Animated hair-length visualization](visual-growth-timeline.md)
- [Local storage and optional synchronization](data-storage-and-sync.md)
- [Export behavior](export.md)
- [Desktop shell and window controls](desktop-shell.md)

## Current implementation summary

The inspected source contains a desktop main process, an isolated preload bridge, a local JSON state store, an HTTP service, Docker deployment files, strict SSH tunnel process management, and website template, stylesheet, and browser runtime files. The browser runtime includes a 1.0 cm per month adjustable default, centimetre and inch conversion, haircut baseline resets, localStorage persistence, redacted exports, and local utilities. The desktop renderer, canonical hair-reference files, tests, interaction ledgers, and built-artifact captures were not present at the latest documentation inspection. Source presence is not treated as built-artifact verification.

## Suggested reading

- [HTTP API](../api/README.md)
- [Local service operation](../operations/local-service.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
