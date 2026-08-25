# Accessibility and responsive layout

## Behavior

The website must work from approximately 320 CSS pixels upward without horizontal body scrolling. Keyboard users receive visible focus, semantic names and states, and complete interaction paths. Touch targets meet platform minimum sizes. Motion respects reduced-motion preferences. Screen readers receive meaningful headings, regions, live status, tab orientation, result counts, and progress text.

Every settings control needs an explicit accessible name. A surrounding card title or nearby paragraph is not a substitute for a programmatic label on its input, select, range, color control, or file picker.

The primary, Tools, and Settings navigation sets each use complete tab and tabpanel relationships. Each tab references its panel, each panel references its tab, and each tab list uses one roving `tabindex="0"` target. Arrow keys follow the list orientation, while Home and End move to the first and last enabled tab. If filtering removes the current roving-focus target, focus moves to the first remaining tab without changing the selected destination. Selection changes only after deliberate activation.

The element context menu supports Arrow, Home, End, Enter, Space, and Escape. Closing the menu returns focus to the element that opened it unless the chosen action opened another surface that now owns focus. Documentation search results use a single-select listbox with option semantics. Filtering or initial rendering does not move article focus. Focus moves to the article only after a reader deliberately activates a result.

## Configuration

The viewport meta tag must be present. Wide tables, code blocks, diagrams, and workbench samples scroll inside their own containers. Overlays remain bounded, paint an opaque surface, and scroll internally. Floating panels support bounded resize, drag where applicable, keyboard movement, and reset.

Every standalone selection target is at least 44 by 44 CSS pixels, including checkboxes, radio buttons, ranges, color inputs, and visible file inputs. A smaller native control is acceptable only when it is contained by a larger labeled target that provides the complete hit area and preserves the same accessible name.

## Failure modes

- Bilingual labels are commonly the longest and may reveal clipping missed in English.
- A narrowed desktop browser does not prove touch behavior.
- Hover-only actions need a tap and keyboard equivalent.
- A vertical tab strip must use vertical orientation and up or down navigation.
- Filtering a tab list must not leave roving focus on an unavailable tab or silently change the selected panel.
- A context menu that closes without restoring focus can strand keyboard users at the document root.
- Automatically focusing the first documentation article after every search interrupts reading and is not deliberate activation.
- A visually large card does not enlarge an unwrapped checkbox, radio button, range, color input, or file input hit target.
- Reduced motion must stop continuous rainbow and non-essential timeline animation.

## Security and privacy

Accessibility behavior must not expose secrets through accessible names, live regions, or copied diagnostic text. Local file paths are shown only when required for a user-selected operation.

## Verification

Source includes responsive breakpoints, visible focus, reduced-motion handling, a `forced-colors` media boundary, `SETTING_CONTROL_NAMES` and `applyExplicitSettingNames`, complete Tools and Settings tab and tabpanel relationships, shared `activateManagedTab` and `handleManagedTabKeydown` paths, safe filtered-tab roving focus without changing selection, documentation listbox and option semantics, deliberate result activation handlers, `#docs-article[tabindex="-1"]`, and `closeContextMenu` with Arrow, Home, End, Enter, Space, Escape, and opener-focus return. General inputs are at least 3 rem tall, checkbox, radio, and range targets are at least 2.75 rem tall, and narrow layouts keep discovery searches and rail actions present and operable instead of visually hiding them. The focused source check `accessibility repair boundaries are explicit and responsive controls remain operable` was deliberately red when the article focus target lacked `tabindex="-1"`, then passed after restoration as part of the three-check run with 0 failed and 0 skipped. Real phone and tablet widths, both orientations, large text, 100, 125, 150, and 200 percent scaling, keyboard-only use, screen-reader semantics, measured contrast, forced-colors interaction, touch, behavioral checks, and built-site captures remain pending.

Partial negative-regression coverage includes deliberate removal of the front-screen provenance identifier, one current-strip regex-builder registration, and the documentation article's `tabindex="-1"` focus boundary. It does not yet prove the complete accessibility inventory, every setting label, nested tab semantics, filtered roving focus, context-menu traversal, documentation listbox behavior, or every touch-target boundary by deliberate removal.

## Suggested articles

- [Tabbed navigation](tabbed-navigation.md)
- [Settings and appearance](settings-and-appearance.md)
- [Animated hair-length visualization](../features/visual-growth-timeline.md)
