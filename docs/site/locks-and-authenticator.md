# Local locks and authenticator

## Behavior

Every rendered website element must expose a local convenience-lock wizard with an anchored prompt. Each element has its own policy and credential set. Supported policies are PIN, password, PIN plus password, password plus TOTP, PIN plus TOTP, and password plus PIN plus TOTP. A locked element blocks its action while remaining an operable unlock target.

The website authenticator is a local TOTP utility. The current source accepts standard `otpauth://` input and manual base32, shows the current code, seconds remaining, and next-code preview, and manages searchable local entries. QR image, clipboard, and camera routes are shown as unavailable because no verified local QR decoder is bundled.

## Configuration

Lock duration is per surface, a chosen number of minutes, or until the browser page closes. PIN entry offers both keypad and manual input through one validator. TOTP supports SHA-1, SHA-256, and SHA-512, 6 through 8 digits, and configurable periods.

## Failure modes

- Browser storage clearing resets website locks and authenticator entries.
- Browser-only storage cannot provide operating-system credential-vault guarantees.
- Camera, clipboard, or QR decoding may be unavailable and must remain visible with an exact reason.
- A wrong credential never deletes content.
- Support Tickets is local theater only and must state that no request is sent or read by a person.

## Security and privacy

These locks are not encryption or access security. A website authenticator storing reusable secrets in browser storage has a weaker boundary than an operating-system credential vault. The implementation must disclose this before accepting a secret and must make deliberate secret export a separately named destructive action.

## Verification

Source inspection confirmed all six policies, per-target lock records, salted PIN and password hashes, browser-local TOTP factors, keypad and manual PIN input, bounded retry waits, selected unlock durations, click interception, TOTP code and next-code generation, search, deletion confirmation, and ordinary-export omission. The keypad lacks its own Submit and Cancel controls, TOTP pairing is not confirmed before registration, QR support and clock-skew detection are absent, and the unlock ladder is absent. Alternate shortcuts and command-palette activation still need direct proof. Standards vectors, security review, and real interactions are pending.

## Suggested articles

- [Support Tickets](support-tickets.md)
- [Destructive-action confirmation](destructive-confirmation.md)
- [Locks and authenticator limitations](../security/locks-and-authenticator-limitations.md)
- [Browser storage limitations](../security/browser-storage-limitations.md)
- [Settings and appearance](settings-and-appearance.md)
