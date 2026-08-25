# Browser storage limitations

## Behavior

The public website uses browser-local storage for visitor-owned settings and demonstrations. That storage belongs to one browser profile and origin. It is not shared with the installed desktop product unless a separately documented local mediator is active.

## Configuration

The browser runtime uses the stable key `hairGrowthEstimator.websiteState.v1` and schema version 1. It merges recognized nested settings with compiled defaults and provides a destructive-confirmation route to clear the key. The key is independent of the visitor-facing display name.

## Failure modes

- Private or incognito sessions may discard data when closed.
- Browser clearing, origin changes, storage eviction, quota exhaustion, or corruption can remove data.
- Browser storage does not provide an operating-system credential vault.
- Static hosting cannot open a local application-data folder or launch arbitrary programs.

## Security and privacy

Website locks and local history are convenience features, not protection against someone with access to the browser profile. Authenticator secrets in browser storage require an explicit limitation disclosure. No visitor-owned state should be sent to the hosting provider beyond ordinary static-file requests.

The current browser runtime stores TOTP secrets and lock TOTP factors in the same localStorage record. General exports redact them, but localStorage itself is plaintext to code running under the origin. This is a known weaker boundary than an operating-system credential vault.

## Verification

Source inspection confirmed the versioned key, default merge, write-failure notification, clear-data action, redacted general export, and display-name independence in `site/app.js`. Corrupt JSON currently falls back to defaults without preserving the corrupt bytes or showing a recovery notification. Schema-boundary tests, quota handling, reload persistence, private-mode behavior, no-network assertions, and built-artifact evidence are pending.

## Suggested articles

- [Local locks and authenticator](../site/locks-and-authenticator.md)
- [Settings and appearance](../site/settings-and-appearance.md)
- [Privacy and data boundaries](privacy-and-data-boundaries.md)
