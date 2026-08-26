# Product features

These articles describe product behavior visible in the inspected source and identify unfinished user-facing boundaries honestly.

## Feature articles

- [Attention accommodations](attention-accommodations.md)
- [Language modes and funny levels](language-and-funny-levels.md)
- [Narrator voices and pacing](narrator.md)
- [Scheduled settings](scheduled-settings.md)
- [Shared School mode](shared-school-mode.md)
- [Startup surprise](startup-surprise.md)
- [Hair growth estimation](hair-growth-estimation.md)
- [Haircut history and reset behavior](haircut-history.md)
- [Centimetres and inches](measurements.md)
- [Animated hair-length visualization](visual-growth-timeline.md)
- [Local storage and optional synchronization](data-storage-and-sync.md)
- [Export behavior](export.md)
- [Desktop shell and window controls](desktop-shell.md)

## Current implementation summary

The inspected source contains a desktop main process, an isolated preload bridge, a local JSON state store, an HTTP service, Docker deployment files, strict SSH tunnel process management, and website template, stylesheet, state contract, security contract, Worker, Worker client, and browser runtime files. The browser runtime includes a 1.0 cm per month adjustable default, exact centimetre and inch conversion, newest-haircut baseline reconciliation with a retained manual fallback, guided future-date refusal, monotonic same-origin browser revisions, stale-write refusal, faithful normalized CSV and TSV exports, positive export allowlisting, strict browser-state and appearance import, exact preceding-version presentation migration, and local utilities. Focused source tests cover the original correctness behaviors, and the complete focused hardening suite reports 12 passed, 0 failed, and 0 skipped after restoration. Website source month parity is implemented through the shared calculator and deterministic vectors. Complete negative-regression coverage, desktop and core consumption, integrated cross-surface proof, desktop interaction ledgers, and built-artifact captures remain pending. Source presence is not treated as built-artifact verification.

## Suggested reading

- [HTTP API](../api/README.md)
- [Local service operation](../operations/local-service.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
