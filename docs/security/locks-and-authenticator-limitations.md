# Locks and authenticator limitations

## Behavior

Website element locks are deliberate convenience barriers. They disable the chosen action and require the selected local credential policy before re-enabling it. They do not encrypt content or protect it from another person with access to the same browser profile.

The website authenticator is a local TOTP utility. It can generate codes only from stored reusable secrets and the device clock. Those secrets are highly sensitive even though the website is static.

## Configuration

Each lock has its own target identifier, policy, credential set, duration, attempt budget, and recovery disclosure. TOTP entries include issuer, account, algorithm, digits, and period. Ordinary exports omit secrets and say so.

## Failure modes

- Clearing the website's storage resets all locks and authenticator data.
- A clock that is too far from the service clock produces rejected codes.
- Losing a credential requires the documented storage-reset route.
- A lock must not be bypassed through keyboard shortcuts, command-palette navigation, stale handles, or programmatic activation.
- Storing a factor inside the same surface it unlocks makes that lock ornamental and must be stated.

## Security and privacy

Browser storage is weaker than an operating-system credential vault. The registration QR and manual secret must never be sent to a third-party QR service, network, disk, log, export, capture, telemetry, or history. Pairing completes only after a current code is confirmed.

## Verification

Source inspection confirmed all six policy choices, per-target salts and hashes for PIN and password, plaintext browser-local TOTP factors, manual and keypad PIN entry, bounded exponential retry waits, three unlock durations, click interception for locked elements, TOTP generation, searchable entries, and general-export omission in `site/app.js`. QR registration, pairing confirmation, the unlock ladder, standards-vector tests, clock-skew detection, full shortcut and command-palette activation blocking, independent secret export, and built-artifact evidence are pending.

## Suggested articles

- [Local locks and authenticator](../site/locks-and-authenticator.md)
- [Browser storage limitations](browser-storage-limitations.md)
- [Privacy and data boundaries](privacy-and-data-boundaries.md)
