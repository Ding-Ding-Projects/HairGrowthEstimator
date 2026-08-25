# Settings and appearance

## Behavior

The website settings surface must provide English, playful Hong Kong-style Cantonese, and bilingual presentation; independent English and Cantonese funny-level controls; emoji decoration control; theme, density, accent, fonts, motion, and display-name settings; app-logo presets and local custom-image processing; scheduled settings; personal-vocabulary upload; accessibility modes; and per-element appearance editing.

Appearance editing must be non-destructive, reversible, local, and target-specific. Every rendered element must expose an Edit appearance command from its context menu and an accessible equivalent. Unsupported properties must remain visible with exact capability explanations.

## Configuration

Settings persist in browser-local state, with versioned schemas and reset actions. A custom logo must be decoded and converted locally under bounded byte, pixel, frame, time, and memory limits. Theme colors use a continuous picker and show multiple color-space representations, gamut warnings, alpha, and contrast.

## Failure modes

- Invalid or unsupported local files must not partially apply.
- Missing or corrupt cached settings must fall back to shipped defaults and report the fallback.
- A chosen font or voice that is unavailable must remain selected but show the active fallback.
- Clearing browser storage removes website preferences and locks.

## Security and privacy

Personal vocabulary and custom images remain local. They are excluded from logs, exports, history snapshots, captures, analytics, prompts, and network requests. Website locks are convenience controls, not security boundaries.

## Verification

Source inspection confirmed versioned browser persistence, three declared language modes, both funny-level settings, the emoji switch, School mode with a browser-local PIN, theme, density, accent, rainbow speed, font, docking, display rename, logo selection, narrator controls, reduced motion, personal-vocabulary loading, schedules, attention modes, and a target-specific appearance editor. Localization currently changes tab labels and selected notifications rather than every visible string. The appearance editor exposes a browser-safe subset and labels several unavailable capabilities, but it does not provide the full required editor depth or independent regex builders for every internal picker. Focused property-consumer checks, malformed-input cases, keyboard and screen-reader paths, and real captures are pending.

## Suggested articles

- [Logo customization](logo-customization.md)
- [Scheduled and external settings](scheduled-settings.md)
- [Narrator and voice selection](narrator-and-voices.md)
- [Attention modes](attention-modes.md)
- [Local locks and authenticator](locks-and-authenticator.md)
- [Search and regex workbench](search-and-regex-workbench.md)
- [Browser storage limitations](../security/browser-storage-limitations.md)
