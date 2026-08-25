# Logo customization

## Behavior

The appearance settings declare three shipped logo presets and a local custom-image picker. A valid custom image changes the website mark only. It does not change package identity, installer identity, update feed, data keys, service identity, or diagnostics.

The complete editor needs crop controls, contain and fill modes, focal point, safe-area preview, transparent or selected background, continuous color selection, and previews at every rendered logo size. The previous valid logo remains active until the replacement fully validates.

## Configuration

The template declares `#logo-preset`, `#custom-logo`, `#logo-fit`, `#logo-background`, `#brand-mark`, and `#reset-logo`. The isolated decoder must validate actual bytes and bound encoded bytes, decoded pixels, dimensions, frames, CPU time, memory, and output count. Derived variants are generated only for formats and sizes the website consumes.

## Failure modes

- Extension or MIME mismatch, malformed input, animation, excessive pixels, decompression risk, or unsupported format rejects the whole change.
- Failed conversion leaves the prior valid mark visible.
- Color-profile flattening, crop, transparency loss, or rasterization is disclosed before activation.
- A corrupt cache falls back to a shipped preset and reports the recovery.

## Security and privacy

Custom bytes remain local and do not enter network requests, analytics, telemetry, logs, exports, history snapshots, prompts, captures, or public records. Reset purges the source and every derived cache entry.

## Verification

Source inspection confirmed three local preset references, PNG, JPEG, and WebP selection, a 1 MiB source limit, browser decode, a 4,194,304-pixel bound, data-URL persistence, fit and background controls, live use, export and history omission, and reset. The current implementation trusts the browser MIME value before decoding and does not bound animation frames, decoder CPU, color profiles, generated variants, crop, focal point, or safe areas. Focused cache validation, no-network proof, keyboard and screen-reader behavior, localization, and real rendered-size captures are pending.

## Suggested articles

- [Settings and appearance](settings-and-appearance.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
- [Local file converter limits](../security/file-converter-boundaries.md)
