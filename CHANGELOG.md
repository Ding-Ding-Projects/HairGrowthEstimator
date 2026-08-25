# Changelog

All notable changes are documented here. Dates and commit links are added only when they can be verified.

## Unreleased

Commit link: unavailable in this entry because a commit cannot truthfully reference its own future SHA before it exists. The immutable release record will bind the entry to its exact commit.

### Added

- A public documentation website with build-bound provenance shown before navigation.
- Hair-growth estimation, haircut history, unit conversion, visual-stage, service, privacy, export, download-status, and update-status surfaces.
- Per-visitor language, playfulness, appearance, narration, schedule, attention, navigation, search, notification, history, and export controls.
- Browser-local equivalents for advanced regular expressions, contextual appearance, toy locks, authentication codes, file conversion, and local Ollama mediation, each with explicit browser limitations.
- Detailed categorized documentation and hand-written completeness inventories.
- Deterministic generation of a genuine product-logo social preview.
- Source-level verification with deliberate red-then-green negative regressions.
- Documentation for the accepted website hardening contract, including strict local JSON validation, positive export allowlisting, internal documentation links, bounded installer manifests, byte-level PNG inspection, Worker-isolated regular expressions, Content Security Policy, and accessibility findings 18 through 24.

### Fixed

- The browser estimator now derives its active baseline from the newest valid remaining haircut after create, edit, and delete while retaining the visitor's independent manual fallback.
- Manual baseline and haircut forms now reject future dates with guided inline errors. Legacy future haircut records remain visible but do not become active while their dates remain in the future.
- Same-origin tabs now store monotonic browser revisions with a fresh writer identity for each loaded document, serialize writes through Web Locks or an IndexedDB transaction, reconcile storage events, verify each write, and refuse stale mutations visibly.
- CSV and TSV state exports now contain normalized JSON Pointer rows for the complete redacted record instead of only aggregate counts. Every row carries typed JSON values plus explicit representation and privacy metadata.
- Accessibility documentation now requires explicit setting-control names, complete nested tab relationships and roving navigation, stable focus during tab filtering, full context-menu keyboard traversal and focus return, deliberate documentation-result activation, and 44 by 44 CSS pixel standalone selection targets.
- Website setting controls now receive explicit accessible names, and Tools and Settings sections expose complete tab and tabpanel relationships with shared roving keyboard behavior.
- Website regular-expression workbench and search evaluation now run through bounded disposable Workers instead of constructing user patterns on the interface thread.
- Worker construction and message-send failures now reject cleanly, terminate any created Worker, release queue capacity, and continue queued work.
- Activating School mode now closes an active School-sensitive regular-expression dialog and any related context, appearance, or lock overlay whose target becomes unavailable.
- Filtered tab-strip rebuilds now restore focus through the rebuilt `focusTarget`, falling back to the selected or first visible tab without changing selection.
- JSONL haircut convenience rows now come only from the positive export allowlist at `record.state.haircuts`, never from live state.
- Personal-vocabulary file loading now enforces the 256 KiB limit before reading, rejects a changed byte count, and decodes with fatal UTF-8. Its localized status, choose or replace, clear, live-region, palette, and School-filtering anchors are source checked.
- Personal-vocabulary replacement now marks user-authored and factual display names, notes, local labels, authenticator codes, model names, and the release code name as exempt while continuing to replace website-owned visible and accessible copy.
- The external personal-vocabulary scanner now fatal-decodes the selected file, requires the exact version 1 root fields and nonzero expected entry count, checks nonempty text replacements without printing values, and proves that its private replacement scan is nonempty.
- Documentation results now move focus to the explicitly focusable article region only after deliberate activation.
- Installer manifest input now has a 65,536-byte limit and fatal UTF-8 decoding before JSON parsing.
- Runtime provenance handling now revalidates the complete installer contract, including exact version-tag matching, a 160-character filename bound, publication field types, positive IDs, and the immutable asset URL.
- Hair-reference manifest input now has a 65,536-byte limit and fatal UTF-8 decoding before JSON parsing.
- Local Ollama configuration now accepts only `http://127.0.0.1:11434` or `http://localhost:11434`, persists the normalized origin, and uses the same boundary in runtime validation and Content Security Policy.

### Security and privacy

- No analytics, trackers, remote fonts, or CDN assets.
- The website template now declares a static Content Security Policy that limits scripts and Workers to same-origin files, limits local model connections to the documented loopback endpoints, blocks objects and frames, and constrains image, base, and form destinations.
- No verified installer link is exposed before an immutable release manifest exists.
- The composer is the only source consumer configured for canonical hair-reference images from the root asset authority. The source images are not present in this checkout, and no duplicate authority was added.
- Private visitor settings remain in local browser storage and can be cleared by the visitor.
- Same-origin coordination stays local to the browser profile. It does not synchronize data to another device, service, or network provider.
- Normalized CSV and TSV exports preserve the already redacted record and repeat the omission statement on every row.
- The strict security contract and active browser consumers now implement duplicate-key-aware JSON parsing, bounded personal-vocabulary validation, complete browser-state and appearance validation, sanitized import construction, bounded stored-envelope parsing, and a positive export allowlist. The complete focused hardening suite reports 11 passed, 0 failed, and 0 skipped after restoration. Its latest six-boundary adversarial fixture reported 5 passed and 6 failed before restoration. Separate personal-vocabulary size-order, status-and-action, owned-copy exemption, and external-scanner fixtures each reported one failure before restoration and one pass afterward. These focused results are partial negative-regression evidence, not complete inventory proof.

### Known evidence gaps

- Built-artifact interaction evidence, real captures, and the screen recording are pending.
- Deployed Open Graph and anonymous image-fetch verification are pending.
- Installer and automatic-update verification are pending.
- The final three-check repair subset was red 3 of 3 when its exact article-focus, bounded manifest-reader, and runtime installer-validation boundaries were removed, then passed 3 with 0 failed and 0 skipped after restoration. The full focused hardening suite and integrated service-counterpart audit now pass, but complete negative-regression coverage for every inventory, localization, interaction, and capture boundary remains pending. The counterpart audit deliberately breaks only the server health-route boundary, while the other accepted fixtures cover only their named source boundaries.
- Cross-surface verification of the 1.0 cm per month default and elapsed-month calculation remains pending.
- The final README capture update remains pending and is not part of this documentation-only lane.
