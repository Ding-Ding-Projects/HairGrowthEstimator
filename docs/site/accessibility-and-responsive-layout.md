# Accessibility and responsive layout

## Behavior

The website must work from approximately 320 CSS pixels upward without horizontal body scrolling. Keyboard users receive visible focus, semantic names and states, and complete interaction paths. Touch targets meet platform minimum sizes. Motion respects reduced-motion preferences. Screen readers receive meaningful headings, regions, live status, tab orientation, result counts, and progress text.

## Configuration

The viewport meta tag must be present. Wide tables, code blocks, diagrams, and workbench samples scroll inside their own containers. Overlays remain bounded, paint an opaque surface, and scroll internally. Floating panels support bounded resize, drag where applicable, keyboard movement, and reset.

## Failure modes

- Bilingual labels are commonly the longest and may reveal clipping missed in English.
- A narrowed desktop browser does not prove touch behavior.
- Hover-only actions need a tap and keyboard equivalent.
- A vertical tab strip must use vertical orientation and up or down navigation.
- Reduced motion must stop continuous rainbow and non-essential timeline animation.

## Security and privacy

Accessibility behavior must not expose secrets through accessible names, live regions, or copied diagnostic text. Local file paths are shown only when required for a user-selected operation.

## Verification

Source includes responsive breakpoints, visible focus, reduced-motion handling, and a `forced-colors` media boundary. Real phone and tablet widths, both orientations, large text, 100, 125, 150, and 200 percent scaling, keyboard-only use, screen-reader semantics, measured contrast, forced-colors interaction, touch, and built-site captures are pending.

## Suggested articles

- [Tabbed navigation](tabbed-navigation.md)
- [Settings and appearance](settings-and-appearance.md)
- [Animated hair-length visualization](../features/visual-growth-timeline.md)
