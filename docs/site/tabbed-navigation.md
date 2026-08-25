# Tabbed navigation

## Behavior

Every website section must be reachable through browser-style tabs. The tab strip docks to the left by default and may move to the right, top, or bottom. Tabs support overflow, reorder, pinning, groups, persisted order and membership, and four independent discovery searches: current strip, each group, group names, and all open tabs.

## Configuration

Visitor choices are stored in browser-local state. Vertical strips expose vertical orientation and use up and down navigation. Narrow layouts collapse the strip without rotating labels or hiding the current destination.

## Failure modes

- Overflow must provide an operable list rather than clipping tabs.
- A search result inside a collapsed group must reveal the result without changing the saved collapsed preference.
- Pinned and locked tabs are excluded from bulk close by default.
- Browser storage clearing resets visitor tab preferences.

## Security and privacy

Tab state is local to the browser profile and is not authentication or synchronization. Search text stays local and must not be logged or transmitted.

## Verification

Source inspection confirmed primary tabs, persisted order, a pinned-home region, drag reordering, axis-aware arrow keys, four dock positions, overflow, close-containing and close-not-containing preview, pinned exclusion by default, and restore-all behavior. There is no pin or unpin control, no group-management or move picker, and the declared group and master search inputs do not yet render their own result surfaces. Focused keyboard interactions, persistence checks, narrow-layout tests, and built-site captures are pending.

## Suggested articles

- [Search and regex workbench](search-and-regex-workbench.md)
- [Settings and appearance](settings-and-appearance.md)
- [Browser storage limitations](../security/browser-storage-limitations.md)
