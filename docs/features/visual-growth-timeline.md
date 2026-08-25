# Animated hair-length visualization

## Behavior

The visualization maps a projected male hair length to eight photographic reference stages. The stage lengths are approximately 0.3, 1.5, 3, 5, 9, 14, 20, and 28 centimetres. They are visual references, not medical predictions and not a claim that every person's hair will look the same at a measured length.

The website template declares `#hero-hair-stage`, `#timeline-progress`, `#hero-stage-caption`, and the pause action `[data-action="toggle-animation"]`. The runtime `startHairAnimation` consumes only the composed `#bundled-hair-assets` records, advances through the available stages every 2.6 seconds, supports pause and resume, and stops non-essential animation for reduced-motion preferences. Until the canonical files under `assets/hair-growth/` are present, it shows an honest text placeholder. The numeric estimate remains usable even if every image fails.

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

The root `assets/hair-growth/stages.json` file is the single mapping authority for approximate centimetres, filenames, and SHA-256 digests. Its referenced files remain under the same root directory. Website composition verifies and copies those stage-owned files into its output `assets/hair-growth/` directory and injects their records into `#bundled-hair-assets`. The composer derives factual English alt text from each exact stage length. Desktop packaging may likewise copy the source only as generated build output with byte-identity verification. Documentation, renderer code, and release packaging must not maintain a second stage-to-file mapping or a second set of source photographs.

## Failure modes

- Missing image assets must produce an honest text-only state.
- A length outside the photographed range must clamp or extrapolate explicitly instead of silently selecting an unrelated image.
- A value between stages must identify whether it uses nearest-stage selection or visual interpolation. It must not imply that an interpolated picture is a measurement.
- Reduced-motion settings must stop non-essential animation.
- Image decode failure must retain the numeric estimate.

## Security and privacy

Reference images must not require runtime tracking or third-party requests. User measurements must never be embedded into image URLs, telemetry, or public captures.

## Verification

The website runtime reads only the composed `#bundled-hair-assets` array and falls back to a numeric text state when that array is empty. The composer validates the exact eight centimetre stages, safe relative manifest paths, duplicate stage rejection, per-file source presence, a 1 KiB through 12 MiB file-size range, and injects exact inch values before copying the canonical directory. Source assets, file decoding, digest validation, composition execution, and built-artifact evidence are pending. Required evidence includes all eight decodable canonical files, one-to-one manifest records, consistent adult subject and lighting, accessible alt text, numeric labels in both units, reduced-motion behavior, missing-file fallback, byte-identity proof for composed copies, and built-artifact captures. The asset inventory is recorded in [Hair reference asset authority](../inventory/hair-reference-assets.md).

## Suggested articles

- [Centimetres and inches](measurements.md)
- [Hair growth estimation](hair-growth-estimation.md)
- [Accessibility and responsive layout](../site/accessibility-and-responsive-layout.md)
