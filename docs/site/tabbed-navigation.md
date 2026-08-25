# Tabbed navigation

## Behavior

Every website section must be reachable through browser-style tabs. The tab strip docks to the left by default and may move to the right, top, or bottom. Tabs support overflow, reorder, pinning, groups, persisted order and membership, and four independent discovery searches: current strip, each group, group names, and all open tabs.

## Configuration

Visitor choices are stored in browser-local state. Vertical strips expose vertical orientation and use up and down navigation. Narrow layouts collapse the strip without rotating labels or hiding the current destination.

Primary, Tools, and Settings tabs use complete tab and tabpanel relationships, roving focus, orientation-aware Arrow keys, and Home and End. The template supplies exact Tools and Settings tab IDs, panel IDs, `aria-controls`, `aria-labelledby`, selected states, and roving tab indexes. `activateManagedTab` and `handleManagedTabKeydown` provide the shared nested-tab path. Before rebuilding the primary strip, `renderTabs` records the focused tab identifier. `focusFilteredTabFallback` then resolves a new `focusTarget` from the rebuilt buttons: it restores focus to the same visible tab when possible, otherwise focuses the selected visible tab or the first remaining tab, without falsely changing selection. If filtering leaves no visible tab, it moves focus to the current-strip search. The focused accessibility source test covers these exact anchors, while behavioral proof in the composed website remains pending.

## Failure modes

- Overflow must provide an operable list rather than clipping tabs.
- A search result inside a collapsed group must reveal the result without changing the saved collapsed preference.
- Pinned and locked tabs are excluded from bulk close by default.
- Browser storage clearing resets visitor tab preferences.
- Filtering must not leave every visible tab at `tabindex="-1"` or falsely mark a new tab selected.
- A narrow icon-only strip must keep the full accessible tab name and a visible focus indicator.

## Security and privacy

Tab state is local to the browser profile and is not authentication or synchronization. Search text stays local and must not be logged or transmitted.

## Verification

Source inspection confirmed primary tabs, persisted order, a pinned-home region, drag reordering, axis-aware primary-tab arrow keys, four dock positions, overflow, close-containing and close-not-containing preview, pinned exclusion by default, restore-all behavior, complete Tools and Settings tab and tabpanel relationships, shared nested Arrow, Home, and End handling through `activateManagedTab` and `handleManagedTabKeydown`, rebuilt-button focus restoration through `focusFilteredTabFallback` and its `focusTarget`, and narrow-layout access to discovery searches and rail actions. Pin and unpin controls, group management, move picker, complete discovery results, built keyboard interaction, narrow-layout behavior, and built-site captures remain pending.

## Suggested articles

- [Search and regex workbench](search-and-regex-workbench.md)
- [Settings and appearance](settings-and-appearance.md)
- [Browser storage limitations](../security/browser-storage-limitations.md)
