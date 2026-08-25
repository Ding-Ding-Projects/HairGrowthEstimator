# Animated hair-length visualization

## Behavior

The visualization maps a projected male hair length to eight photographic reference stages. The stage lengths are approximately 0.3, 1.5, 3, 5, 9, 14, 20, and 28 centimetres. They are visual references, not medical predictions and not a claim that every person's hair will look the same at a measured length.

The website template declares `#hero-hair-stage`, `#timeline-progress`, `#hero-stage-caption`, and the pause action `[data-action="toggle-animation"]`. The runtime `startHairAnimation` consumes only the composed `#bundled-hair-assets` records, advances through the available stages every 2.6 seconds, supports pause and resume, and stops non-essential animation for reduced-motion preferences. Until the canonical files under `assets/hair-growth/` are present, it shows an honest text placeholder. The numeric estimate remains usable even if every image fails.

The canonical calculation is `365.2425 / 12 = 30.436875 days per estimate month`. The current-length calculation uses that value to convert elapsed days into estimate months. The projected-target calculation uses the same value to convert the remaining target interval into a projected date. The shipped planning default remains an adjustable 1.0 cm per month estimate, not a medical fact. Hair growth varies meaningfully between people and over time. The clinical boundary is documented through [Hair Growth Disorders, StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK499948/).

## Configuration

The visualization must read canonical centimetre values, display the selected unit, expose the stage's approximate measured length, and provide a non-animated reduced-motion state. Images must be bundled locally with the product and have meaningful alt text.

The exact conversion is `inches = centimetres / 2.54`. The stage mapping and display values are:

| Stage | Approximate centimetres | Exact inches | Display inches |
| --- | ---: | ---: | ---: |
| 1 | 0.3 cm | 15/127 in | 0.12 in |
| 2 | 1.5 cm | 75/127 in | 0.59 in |
| 3 | 3 cm | 150/127 in | 1.18 in |
| 4 | 5 cm | 250/127 in | 1.97 in |
| 5 | 9 cm | 450/127 in | 3.54 in |
| 6 | 14 cm | 700/127 in | 5.51 in |
| 7 | 20 cm | 1000/127 in | 7.87 in |
| 8 | 28 cm | 1400/127 in | 11.02 in |

The root `assets/hair-growth/stages.json` file is the single mapping authority for approximate centimetres, filenames, and SHA-256 digests. Its referenced files remain under the same root directory. Before parsing the mapping, the composer rejects a manifest larger than `MAX_HAIR_MANIFEST_BYTES`, or 65,536 bytes, and rejects invalid UTF-8 through fatal decoding. Website composition then verifies and copies the stage-owned files into its output `assets/hair-growth/` directory and injects their records into `#bundled-hair-assets`. The composer derives factual English alt text from each exact stage length. Desktop packaging may likewise copy the source only as generated build output with byte-identity verification. Documentation, renderer code, and release packaging must not maintain a second stage-to-file mapping or a second set of source photographs.

`inspectPng` is the media-validation boundary. Before a manifest entry is accepted, the composer inspects the actual bytes rather than trusting the `.png` extension. It validates the PNG signature, ordered and unique header, chunk lengths and CRC-32 values, required image-data and ending chunks, exact 1254 by 1254 dimensions, non-interlaced 8-bit grayscale, RGB, grayscale-alpha, or RGBA layout, bounded decompression to the exact expected scanline length, valid row filters, and no bytes after the ending chunk before digest verification and copying.

## Failure modes

- Missing image assets must produce an honest text-only state.
- A length outside the photographed range must clamp or extrapolate explicitly instead of silently selecting an unrelated image.
- A value between stages must identify whether it uses nearest-stage selection or visual interpolation. It must not imply that an interpolated picture is a measurement.
- Reduced-motion settings must stop non-essential animation.
- Image decode failure must retain the numeric estimate.
- Current-length and projected-target calculations that use different month lengths, or a month length other than 30.436875 days, must fail verification.
- A file that matches a manifest digest but is not a structurally valid bounded PNG must remain unavailable.
- A file with zero, excessive, truncated, or inconsistent declared dimensions must remain unavailable.

## Security and privacy

Reference images must not require runtime tracking or third-party requests. User measurements must never be embedded into image URLs, telemetry, or public captures.

## Verification

The website runtime reads only the composed `#bundled-hair-assets` array and falls back to a numeric text state when that array is empty. The inspected composer applies `MAX_HAIR_MANIFEST_BYTES` and fatal UTF-8 decoding before it validates the exact eight centimetre stages and canonical order, safe manifest basenames, unique stages, filenames, and SHA-256 values, per-file source presence, a 1 KiB through 12 MiB file-size range, byte-level PNG structure through `inspectPng`, manifest SHA-256 digests, an exact source-directory file set, and exact inch values before copying the canonical directory. The eight root source assets are not present in this checkout, so composition execution against the real manifest, real decoder results, post-copy identity, and built-artifact evidence remain pending. Required evidence includes all eight decodable canonical files, one-to-one manifest records, consistent adult subject and lighting, accessible alt text, numeric labels in both units, reduced-motion behavior, missing-file fallback, byte-identity proof for composed copies, and built-artifact captures. The asset inventory is recorded in [Hair reference asset authority](../inventory/hair-reference-assets.md).

## Suggested articles

- [Centimetres and inches](measurements.md)
- [Hair growth estimation](hair-growth-estimation.md)
- [Accessibility and responsive layout](../site/accessibility-and-responsive-layout.md)
