# Hair reference asset authority

## Purpose

The product uses eight generated photographs of the same adult male subject as approximate visual hair-length references. This inventory prevents a website copy, desktop copy, or documentation copy from becoming a competing source.

## Canonical source

The root `assets/hair-growth/stages.json` file is the only stage-to-file mapping authority. Its schema version 1 records centimetres as `length`, the source `file`, and the expected `sha256`. The referenced files live beside it under `assets/hair-growth/`. A separate image-generation audit manifest may record dimensions and generation metadata, but it does not replace the stage mapping. `scripts/compose-site.mjs` is the only current website consumer: it validates the exact stage set, rejects unsafe manifest paths, checks that each file is 1 KiB through 12 MiB, verifies every source SHA-256 digest, copies the canonical directory to output `assets/hair-growth/`, and injects records into `#bundled-hair-assets`. Image decoding, dimension verification, media-signature verification, consistent-subject review, and post-copy byte-identity proof remain pending until integration.

| Stable stage ID | Approximate length | Exact inch conversion | Display value | Canonical file | Decode proof | Website use | Desktop use |
| --- | ---: | ---: | ---: | --- | --- | --- | --- |
| `hair-stage-003` | 0.3 cm | 15/127 in | 0.12 in | Pending under `assets/hair-growth/` | Pending | Pending | Pending |
| `hair-stage-015` | 1.5 cm | 75/127 in | 0.59 in | Pending under `assets/hair-growth/` | Pending | Pending | Pending |
| `hair-stage-030` | 3 cm | 150/127 in | 1.18 in | Pending under `assets/hair-growth/` | Pending | Pending | Pending |
| `hair-stage-050` | 5 cm | 250/127 in | 1.97 in | Pending under `assets/hair-growth/` | Pending | Pending | Pending |
| `hair-stage-090` | 9 cm | 450/127 in | 3.54 in | Pending under `assets/hair-growth/` | Pending | Pending | Pending |
| `hair-stage-140` | 14 cm | 700/127 in | 5.51 in | Pending under `assets/hair-growth/` | Pending | Pending | Pending |
| `hair-stage-200` | 20 cm | 1000/127 in | 7.87 in | Pending under `assets/hair-growth/` | Pending | Pending | Pending |
| `hair-stage-280` | 28 cm | 1400/127 in | 11.02 in | Pending under `assets/hair-growth/` | Pending | Pending | Pending |

## Behavior

The stage resolver selects from these stable IDs using a canonical centimetre value. Unit switching changes labels only. It never changes the selected physical stage. A missing or unreadable image produces a text fallback with the numeric estimate.

## Configuration

Stage metadata belongs only in the root manifest, with one record per row above. Runtime code consumes the injected build record and must not restate a second stage-to-filename table. The registry must point back to manifest-owned files and must not embed duplicate image bytes. Rounding is for display only. Conversion uses exactly 2.54 centimetres per inch.

## Failure modes

- A missing stage leaves an explicit inventory gap and must not be replaced by the nearest filename silently.
- Duplicate files in another source directory are drift and block release verification.
- A file that does not decode, has unexpected dimensions, or lacks a digest remains unavailable.
- A stage label that uses a rounded inch value as the canonical input can select the wrong boundary.

## Security and privacy

The photographs are product assets and must not contain user measurements, personal metadata, location data, credentials, or analytics identifiers. Runtime loading is local. No image request may include a user's estimate or profile identifier.

## Verification

Source inspection confirmed the composer-owned stage and path validation described above. Pending verification must record the exact manifest-owned filename, media type, dimensions, SHA-256 digest, decoder result, adult-subject consistency review, alt text, root manifest record, injected `#bundled-hair-assets` record, website package reference, desktop package reference, and byte-identity proof for each row. Interaction and capture evidence remain pending.

## Suggested articles

- [Animated hair-length visualization](../features/visual-growth-timeline.md)
- [Centimetres and inches](../features/measurements.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
