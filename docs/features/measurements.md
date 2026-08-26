# Centimetres and inches

## Behavior

Centimetres are the canonical stored unit. The profile records a display preference of either `cm` or `in`. The exact conversion contract is 1 inch equals 2.54 centimetres.

The HTTP service always validates lengths and rates as centimetres. It normalizes any display-unit value other than `in` to `cm`. The browser source converts inches to centimetres by multiplying by exactly 2.54 and converts centimetres to inches by multiplying by `1 / 2.54`. It stores canonical centimetre values and rounds only displayed form and result values to two decimal places.

## Configuration

The preferred unit is stored in `profile.displayUnit`. A complete client must convert only at the presentation and input boundaries, retain canonical centimetre values for storage, and avoid cumulative conversion drift.

## Failure modes

- Invalid numeric values receive HTTP 400 from the service.
- Values above 300 centimetres are rejected.
- A client that repeatedly converts rounded display values back into canonical storage can drift. The planned client must always retain the canonical value.
- Locale-aware numeric entry and display formatting remain pending. The current browser source uses fixed two-decimal strings for values.

## Security and privacy

Unit conversion is local arithmetic and does not need a network request. Measurement values follow the same privacy boundary as the profile record.

## Verification

Source inspection confirmed canonical centimetre storage, exact 2.54 conversion in the browser source, and the `cm` or `in` preference. Tests for round-trip stability, both display modes, boundary values, repeated unit switching, and localized number formatting are pending.

## Suggested articles

- [Hair growth estimation](hair-growth-estimation.md)
- [Animated hair-length visualization](visual-growth-timeline.md)
- [Local storage and optional synchronization](data-storage-and-sync.md)
