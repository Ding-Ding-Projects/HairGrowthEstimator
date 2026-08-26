# Command palette

## Behavior

The template declares a command palette at `#command-palette`, an index field at `#palette-search`, a result list at `#palette-results`, and card or full-window size choices at `#palette-size`. `Ctrl+Shift+F` and the front-screen command button must open the same palette.

The complete palette indexes every destination, article, command, setting, appearance control, and relevant list action. The current personal-vocabulary entries include separate upload, replace, clear, and `vocabulary-status` destinations, all of which are removed from results while School mode is active. A setting result renders the real live control. Activating a destination selects the owning tab and group, reveals the exact element, scrolls it into view, focuses it, and briefly highlights it.

## Configuration

Palette size persists per visitor, with the bounded card as the default. Search is plain text by default and owns an independent adjacent regex workbench. Each result carries a stable target ID, panel ID, optional group ID, accessible context, and the action or setting binding it uses.

## Failure modes

- A stale target must remain a visible unavailable result instead of navigating to a nearby element.
- A setting result must never keep a second value that can drift from the settings surface.
- A shortcut conflict or browser refusal must leave the visible command button usable.
- Closing returns focus to the element that opened the palette.

## Security and privacy

The palette does not index lock credentials, authenticator secrets, personal-vocabulary mappings, custom-image bytes, or private service keys. Locked results remain labeled and open the correct authentication prompt rather than bypassing the lock.

## Verification

Source inspection confirmed `Ctrl+Shift+F`, the front-screen button, a fixed command list, plain and regex search, card or full-window persistence, destination navigation, tool-subtab routing, scroll, focus, temporary highlight, and the four School-sensitive personal-vocabulary destinations. A focused source fixture for the personal-vocabulary palette and status anchors was red 1, then passed 1 after restoration. The current fixed list is not a complete index, result rows are label-and-open buttons rather than live rich settings controls, and locked-target navigation still requires direct proof. Complete indexing, rich controls, complete localization, focused accessibility behavior, and built-artifact evidence are pending.

## Suggested articles

- [Tabbed navigation](tabbed-navigation.md)
- [Search and regex workbench](search-and-regex-workbench.md)
- [Settings and appearance](settings-and-appearance.md)
