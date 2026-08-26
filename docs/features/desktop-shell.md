# Desktop shell and window controls

## Behavior

The main process creates a frameless 1280 by 820 desktop window with a dark background. It exposes isolated minimize, maximize or restore, and close operations through the preload bridge. Node integration is disabled, context isolation is enabled, and renderer sandboxing is enabled.

The window loads `app/renderer/index.html`, but that path was absent from the inspected revision. The custom title bar and its control anatomy therefore remain pending.

## Configuration

The current minimum size is 900 by 650. The window starts hidden and is shown after `ready-to-show`. The product closes when all windows close on Windows and can recreate the main window on activation.

## Failure modes

- A missing renderer path prevents a usable window.
- The hard-coded minimum size still requires verification against small displays and high display scaling.
- A custom close control must preserve unsaved work and record any user-authorized discard before closing. That behavior is not present in the inspected source.

## Security and privacy

Privileged capabilities are exposed through named preload methods rather than raw IPC. The renderer has no direct Node integration. Every new bridge method still requires input bounds and explicit allowlisting.

## Verification

Source inspection confirmed the BrowserWindow security settings and named IPC handlers. Packaged launch, custom title-bar controls, focus return, small-display sizing, high-scale layout, keyboard operation, and built-artifact captures are pending.

## Suggested articles

- [Release, installation, and updates](../operations/release-install-and-updates.md)
- [Version and build provenance](../operations/version-provenance.md)
- [Accessibility and responsive layout](../site/accessibility-and-responsive-layout.md)
