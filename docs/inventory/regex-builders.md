# Regex-builder ownership inventory

## Contract

Every website search field, dropdown, picker, menu, and context menu owns an independent plain-text filter and an adjacent anchored entry to the complete regex workbench. Opening one owner must not reuse or overwrite another owner's query, flags, validation, samples, replacement preview, or regex-enabled state.

This is a hand-written list. It includes missing owners deliberately so that removing a control or never adding its builder cannot make the inventory look complete. The template declares builder buttons with `data-open-regex-for`. The runtime implements independent `state.regexOwners` records, adjacent builder registration, bounded input sizes, result limits, dropdown enhancement, and source consumers for the rows identified below. Anchored popover positioning, isolated evaluation timeouts, complete keyboard behavior, focused tests, built interactions, and captures remain pending.

## Collection and navigation searches

| Owner ID | Surface and target | Source selector | Required independent state | Focused test ID | Status and evidence |
| --- | --- | --- | --- | --- | --- |
| `current-strip` | Current primary tab strip | `#strip-search` plus `[data-open-regex-for="strip-search"]` in [template](../../site/index.template.html) | Query, pattern, flags, validation, mode, current-strip scope | `site.regex.owner.current-strip` | Source consumer: `renderTabs`; built interaction and capture pending |
| `group-tabs` | Tabs in the selected group | `#group-tab-search` plus its adjacent button | Query, pattern, flags, validation, mode, selected-group ID | `site.regex.owner.group-tabs` | Independent owner persists, but no selected-group result consumer exists |
| `group-names` | Visible group names and labels | `#group-name-search` plus its adjacent button | Query, pattern, flags, validation, mode | `site.regex.owner.group-names` | Independent owner persists, but no group-result consumer exists |
| `master-tabs` | Every tab owned by the website | `#master-tab-search` plus its adjacent button | Query, pattern, flags, validation, mode, result context | `site.regex.owner.master-tabs` | Independent owner persists, but no master result consumer exists |
| `tab-overflow` | Overflowed tabs | `#overflow-search` plus its adjacent button | Query, pattern, flags, validation, mode | `site.regex.owner.tab-overflow` | Source consumer: `renderOverflow`; built interaction and capture pending |
| `bulk-tab-query` | Close containing or not containing text | `#bulk-tab-query` plus its adjacent button | One predicate shared by positive and inverse actions, flags, include-pinned choice, preview | `site.regex.owner.tab-bulk-close` | Source consumer: `updateBulkTabPreview`; the input lacks a declarative `data-search-owner`, so ownership is assigned by ID |
| `haircuts` | Haircut records | `#haircut-search` plus its adjacent button | Query, pattern, flags, validation, mode, current filter scope | `site.regex.owner.haircuts` | Source consumer: `renderHaircuts`; built interaction and capture pending |
| `documentation` | Bundled article titles and bodies | `#docs-search` plus its adjacent button | Query, pattern, flags, validation, mode, title/body matches | `site.regex.owner.documentation` | Source consumer: `renderDocs`; composed bundle and built evidence pending |
| `history` | Local history | `#history-search` plus its adjacent button | Query, pattern, flags, validation, mode, date and action filters | `site.regex.owner.history` | Source consumer: `renderHistory`; date range works, action filter is absent |
| `notifications` | Notification center | `#notification-search` plus its adjacent button | Query, pattern, flags, validation, mode, current selection | `site.regex.owner.notifications` | Source consumer: `renderNotifications`; built interaction and capture pending |
| `changelog` | Changelog entries | `#changelog-search` plus its adjacent button | Query, pattern, flags, validation, mode, date range | `site.regex.owner.changelog` | Source consumer: `renderChangelog`; built interaction and capture pending |
| `settings` | Settings labels, descriptions, and current values | `#settings-search` plus its adjacent button | Query, pattern, flags, validation, mode, owning settings tab and focus target | `site.regex.owner.settings` | Source consumer: `filterSettings`; it filters only currently rendered cards and does not navigate across tabs |
| `command-palette` | Commands, destinations, articles, settings, and appearance controls | `#palette-search` plus its adjacent button | Query, pattern, flags, validation, mode, rich result context | `site.regex.owner.command-palette` | Source consumer: `renderCommandPalette`; fixed index and teleport exist, full index and rich rows are incomplete |
| `support-tickets` | Local fictional tickets | `#ticket-search` plus its adjacent button | Query, pattern, flags, validation, mode, ticket status filter | `site.regex.owner.support-tickets` | Source consumer: `renderTickets`; built interaction and capture pending |
| `authenticator` | Local authenticator entries | `#totp-search` plus its adjacent button | Query, pattern, flags, validation, mode; secrets never become sample text | `site.regex.owner.authenticator` | Source consumer: `renderTotpEntries`; labels and issuers only, built evidence pending |
| `ollama-models` | Installed local model tags | `#ollama-search` plus its adjacent button | Query, pattern, flags, validation, mode, installed-state filter | `site.regex.owner.ollama-models` | Source consumer: `renderOllamaModels`; installed tags only, built evidence pending |
| `converter-results` | Converter queue and result history | No search field present | Query, pattern, flags, validation, mode, queue/result scope | `site.regex.owner.converter-results` | Missing; no interaction or capture evidence |
| `locks` | Managed element-lock list | No lock-list search present | Query, pattern, flags, validation, mode, target and policy filters | `site.regex.owner.locks` | Missing; no interaction or capture evidence |
| `schedules` | Scheduled-setting rule list | No schedule-list search present | Query, pattern, flags, validation, mode, enabled and source filters | `site.regex.owner.schedules` | Missing; no interaction or capture evidence |
| `appearance-presets` | Named appearance presets | No preset-list search present | Query, pattern, flags, validation, mode | `site.regex.owner.appearance-presets` | Missing; no interaction or capture evidence |
| `logo-presets` | Shipped and user logo choices | `#logo-preset` is a dropdown owner, but no separate preset-list search | Query, pattern, flags, validation, mode | `site.regex.owner.logo-presets` | Partly declared through dropdown; list evidence pending |
| `export-history` | Previous generated exports | No export-history list or search present | Query, pattern, flags, validation, mode | `site.regex.owner.export-history` | Missing; no interaction or capture evidence |

## Dropdowns and pickers

The runtime `enhanceDropdowns` adds an adjacent search input, independent `:dropdown-filter` owner, polite result count, and builder to every current `select`, including dynamically mounted workbench and appearance selects. It filters native option visibility in source. This is not an opened custom popup, so built keyboard behavior, focus return, screen-reader behavior, and consistent option hiding remain unproven.

| Owner ID | Dropdown or picker | Source selector | Builder declaration | Focused test ID | Status and evidence |
| --- | --- | --- | --- | --- | --- |
| `converter-category` | Converter category | `#converter-category` | Declarative builder plus generated `converter-category:dropdown-filter` | `site.regex.dropdown.converter-category` | Source filter implemented; custom popup interaction and capture pending |
| `converter-adapter` | Converter adapter | `#converter-adapter` | Declarative builder plus generated `converter-adapter:dropdown-filter` | `site.regex.dropdown.converter-adapter` | Source filter implemented; custom popup interaction and capture pending |
| `export-format` | Export format | `#export-format` | Declarative builder plus generated `export-format:dropdown-filter` | `site.regex.dropdown.export-format` | Source filter implemented; built evidence pending |
| `language-mode` | Language mode | `#language-mode` | Declarative builder plus generated `language-mode:dropdown-filter` | `site.regex.dropdown.language-mode` | Source filter implemented; built evidence pending |
| `theme` | Theme | `#theme-select` | Declarative builder plus generated `theme:dropdown-filter` | `site.regex.dropdown.theme` | Source filter implemented; built evidence pending |
| `density` | Density | `#density-select` | Declarative builder plus generated `density:dropdown-filter` | `site.regex.dropdown.density` | Source filter implemented; built evidence pending |
| `font-family` | Interface font family | `#font-family` | Declarative builder plus generated `font-family:dropdown-filter` | `site.regex.dropdown.font-family` | Source filter implemented; installed-font enumeration and typeface previews are absent |
| `dock` | Tab-strip edge | `#dock-select` | Declarative builder plus generated `dock:dropdown-filter` | `site.regex.dropdown.dock` | Source filter implemented; built evidence pending |
| `logo-preset` | Logo preset | `#logo-preset` | Declarative builder plus generated `logo-preset:dropdown-filter` | `site.regex.dropdown.logo-preset` | Source filter implemented; built evidence pending |
| `logo-fit` | Logo fit mode | `#logo-fit` | Generated `logo-fit:dropdown-filter` and builder from `enhanceDropdowns` | `site.regex.dropdown.logo-fit` | Source filter implemented; no declarative template builder and no built evidence |
| `voice-en` | English narrator voice | `#voice-en` | Declarative builder plus generated `voice-en:dropdown-filter` | `site.regex.dropdown.voice-en` | Source filter and late stable-identity enumeration implemented; built evidence pending |
| `voice-yue` | Cantonese narrator voice | `#voice-yue` | Declarative builder plus generated `voice-yue:dropdown-filter` | `site.regex.dropdown.voice-yue` | Source filter and late stable-identity enumeration implemented; built evidence pending |
| `schedule-theme` | Scheduled theme | `#schedule-theme` | Declarative builder plus generated `schedule-theme:dropdown-filter` | `site.regex.dropdown.schedule-theme` | Source filter implemented; built evidence pending |
| `palette-size` | Command-palette size | `#palette-size` | Declarative builder plus generated `palette-size:dropdown-filter` | `site.regex.dropdown.palette-size` | Source filter implemented; built evidence pending |
| `lock-policy` | Per-element lock policy | `#lock-policy` | Declarative builder plus generated `lock-policy:dropdown-filter` | `site.regex.dropdown.lock-policy` | Source filter implemented; built evidence pending |
| `lock-duration` | Unlock duration | `#lock-duration` | Declarative builder plus generated `lock-duration:dropdown-filter` | `site.regex.dropdown.lock-duration` | Source filter implemented; built evidence pending |
| `ticket-category` | Support ticket category | `#ticket-category` | Declarative builder plus generated `ticket-category:dropdown-filter` | `site.regex.dropdown.ticket-category` | Source filter implemented; built evidence pending |
| `schedule-source` | Local, HTTPS API, or Home Assistant source | No control present | Missing | `site.regex.dropdown.schedule-source` | Gap; no builder, interaction, or capture evidence |
| `narrator-language` | English, Cantonese, or Both narration | No control present | Missing | `site.regex.dropdown.narrator-language` | Gap; no builder, interaction, or capture evidence |
| `history-actions` | One or more action filters | No control present | Missing | `site.regex.dropdown.history-actions` | Gap; no builder, interaction, or capture evidence |
| `ollama-family` | Model family filter | No control present | Missing | `site.regex.dropdown.ollama-family` | Gap; full catalog surface absent |
| `ollama-capability` | Model capability filter | No control present | Missing | `site.regex.dropdown.ollama-capability` | Gap; full catalog surface absent |
| `ollama-variant` | Model variant and tag | No control present | Missing | `site.regex.dropdown.ollama-variant` | Gap; full catalog surface absent |
| `ollama-quantization` | Quantization | No control present | Missing | `site.regex.dropdown.ollama-quantization` | Gap; full catalog surface absent |
| `ollama-fit` | Hardware-fit verdict | No control present | Missing | `site.regex.dropdown.ollama-fit` | Gap; full catalog surface absent |
| `ollama-harness` | Allowlisted harness profile | No control present | Missing | `site.regex.dropdown.ollama-harness` | Gap; harness surface absent |
| `appearance-state` | Normal, hover, focus, pressed, selected, disabled, loading, success, warning, and error states | Dynamic `[data-appearance-state]` select | Generated filter and builder with an unstable generated select ID | `site.regex.dropdown.appearance-state` | Source filter exists; missing dragged and validation states, stable owner ID, and built evidence |
| `appearance-layer` | Appearance layer and group | Layer rows use inputs rather than a dropdown | Missing layer/group picker | `site.regex.dropdown.appearance-layer` | Gap; no picker, builder, interaction, or capture evidence |
| `appearance-blend` | Layer blend mode | Dynamic `[data-style="mixBlendMode"]` select | Generated filter and builder with an unstable generated select ID | `site.regex.dropdown.appearance-blend` | Source filter exists; stable owner ID and built evidence pending |
| `appearance-font` | Per-element font family | Dynamic `[data-style="fontFamily"]` select | Generated filter and builder with an unstable generated select ID | `site.regex.dropdown.appearance-font` | Source filter exists; installed-font enumeration, preview, stable owner, and built evidence pending |
| `appearance-color-space` | Color translator representation | Translator outputs are rendered as read-only cards | Missing editable color-space picker and builder | `site.regex.dropdown.appearance-color-space` | Gap; translations exist, but no picker, interaction, or capture evidence |
| `appearance-font-style` | Per-element normal, italic, or oblique style | Dynamic `[data-style="fontStyle"]` select | Generated filter and builder with an unstable generated select ID | `site.regex.dropdown.appearance-font-style` | Source filter exists; stable owner and built evidence pending |
| `appearance-decoration` | Per-element text decoration | Dynamic `[data-style="textDecoration"]` select | Generated filter and builder with an unstable generated select ID | `site.regex.dropdown.appearance-decoration` | Source filter exists; complete decoration depth and built evidence pending |
| `appearance-alignment` | Per-element text alignment | Dynamic `[data-style="textAlign"]` select | Generated filter and builder with an unstable generated select ID | `site.regex.dropdown.appearance-alignment` | Source filter exists; stable owner and built evidence pending |
| `regex-mode:<owner>` | Plain-text or regular-expression mode in each mounted workbench | Dynamic `[data-regex-mode]` select | Generated filter and builder with an unstable generated select ID | `site.regex.dropdown.workbench-mode` | Source filter exists for standalone and owner dialogs; stable owner and built evidence pending |
| `regex-expected:<owner>` | Expected match or no-match outcome | Dynamic `[data-regex-case-expected]` select | Generated filter and builder with an unstable generated select ID | `site.regex.dropdown.expected-outcome` | Source filter exists; stable owner and built evidence pending |

## Menus and context menus

Every opened menu instance requires target-owned filter state even when a shared component renders it. Filtering may hide visible items but must never leave a hidden destructive shortcut active.

| Owner ID | Menu target | Current owner | Focused test ID | Status and evidence |
| --- | --- | --- | --- | --- |
| `element-context-menu` with session target | Every rendered element | Shared `#context-menu`, `#context-search`, `[data-open-regex-for="context-search"]`, global context-menu listener, `Shift+F10`, and touch long-press | `site.regex.menu.every-element-context` | Source search and target routing implemented; owner state is shared rather than target-specific, action specialization and focus return are incomplete, built evidence pending |
| `tab-context:<tab-id>` | Each primary and settings tab | No tab-specific owner present | `site.regex.menu.tab-context` | Missing tab management, appearance, lock, search, and evidence |
| `group-context:<group-id>` | Each tab-group header | No owner present | `site.regex.menu.group-context` | Missing group menu, search, builder, and evidence |
| `appearance-context:<property-id>` | Every appearance property, layer, state, and preview target | No owner present | `site.regex.menu.appearance-context` | Missing menu, search, builder, and evidence |
| `notification-context:<notification-id>` | Each notification | Shared element menu opens with generic activate, appearance, lock, and copy actions | `site.regex.menu.notification-context` | Generic source routing exists; notification-specific actions and independent owner are absent |
| `haircut-context:<record-id>` | Each haircut record | Shared element menu opens with generic activate, appearance, lock, and copy actions | `site.regex.menu.haircut-context` | Generic source routing exists; record-specific actions and independent owner are absent |
| `history-context:<revision-id>` | Each history revision | Shared element menu may open, but restore, label, export, and details actions are absent | `site.regex.menu.history-context` | Incomplete and unverified |
| `authenticator-context:<entry-id>` | Each authenticator entry | Shared element menu opens generically; copy and confirmed delete also exist in the row, outside the menu | `site.regex.menu.authenticator-context` | Entry-specific menu owner and complete actions are absent |
| `ollama-context:<tag>` | Each local model tag | Shared element menu may open, but installed-model actions are absent | `site.regex.menu.ollama-context` | Generic source routing exists; model-specific owner and actions are absent |
| `converter-context:<result-id>` | Each converter queue or result item | No result list or owner present | `site.regex.menu.converter-context` | Missing |
| `support-context:<ticket-id>` | Each local ticket | Shared element menu opens generically; Advance exists in the ticket row, outside the menu | `site.regex.menu.support-context` | Ticket-specific menu owner and complete actions are absent |
| `tab-overflow-menu` | Tab overflow | `#tab-overflow-dialog`, `#overflow-search`, and `renderOverflow` | `site.regex.menu.tab-overflow` | Source filtering and activation implemented; complete keyboard flow and built evidence pending |
| `application-overflow-menu` | Global application actions | `[data-action="open-overflow"]` currently opens tab overflow, not a complete global menu | `site.regex.menu.application-overflow` | Missing separate global owner and evidence |

## Regex workbench internal owners

The workbench renders several internal result surfaces, but those surfaces do not have their own independent search fields. The rows distinguish implemented workbench content from the still-missing internal-search ownership contract.

| Owner ID | Required target | Focused test ID | Status |
| --- | --- | --- | --- |
| `regex-constructs` | Guided construct catalog and engine capability matrix | `site.regex.internal.constructs` | Capability matrix is source implemented; guided builder and an internal search owner are missing |
| `regex-tree` | Parse tree and token annotation | `site.regex.internal.parse-tree` | `explainRegex` implements token annotations for selected constructs; parse tree and internal search are missing |
| `regex-matches` | Match and capture table | `site.regex.internal.matches` | Source implemented with indexes, captures, named groups, zero-width advance, and a 500-result cap; internal result search is missing |
| `regex-test-cases` | Expected match and no-match cases | `site.regex.internal.test-cases` | Source implemented with up to 100 persisted cases and pass or fail results; edit, delete, and internal search are missing |
| `regex-snippets` | Saved snippets | `site.regex.internal.snippets` | Current owner JSON import, export, and copy are implemented; named saved-snippet list and internal search are missing |
| `regex-replacements` | Replacement templates and previews | `site.regex.internal.replacements` | Source implemented for current owner; internal preview search is missing |
| `regex-trace` | Bounded trace and performance diagnostics | `site.regex.internal.trace` | Elapsed timing, size caps, result cap, and heuristic risk warning exist; isolated timeout and execution trace are missing |

## Required verification

Focused verification must prove plain-text default behavior, explicit regex opt-in, bidirectional query and flag synchronization, invalid patterns, Unicode, multiline input, captures, replacements, zero-width matches, no-match states, adversarial inputs, evaluation timeouts, anchored placement, focus return, keyboard filtering, screen-reader result counts, independent owner state, and the complete owner list above. The negative regression must remove each exact owner or builder registration in turn, turn red, restore it, and turn green.

No built-artifact interaction, capture, focused-test, or deliberate negative-regression evidence existed at the latest documentation inspection.

## Suggested articles

- [Search and regex workbench](../site/search-and-regex-workbench.md)
- [Tabbed navigation](../site/tabbed-navigation.md)
- [Settings and appearance](../site/settings-and-appearance.md)
- [Website universal-feature inventory](site-universal-features.md)
