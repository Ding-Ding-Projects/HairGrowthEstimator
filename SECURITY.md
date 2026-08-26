# Security policy

## Supported versions

No public installer has been verified or released yet. Security support begins with the first published release and its immutable manifest.

## Reporting a vulnerability

Please use GitHub's private vulnerability-reporting feature for this repository when it is available. Do not open a public issue containing an exploit, credential, secret, private host address, or another person's data.

Include:

- the affected version or commit;
- the exact behavior;
- the smallest safe reproduction;
- expected and observed results;
- potential impact;
- any suggested mitigation that does not require disclosing sensitive data.

## Security boundaries

- Hair-growth estimates are informational and non-medical.
- The optional service binds to loopback by default. Private-LAN access requires explicit configuration and authentication.
- SSH host verification must remain enabled. A changed recorded key is a stop condition.
- Browser-local locks, authentication demonstrations, and storage are user-experience features, not an operating-system credential vault or a security boundary.
- Website state remains in local browser storage. Clearing the website's storage resets it.
- No analytics, trackers, remote fonts, or CDN scripts are used.
- Installer links remain disabled until an immutable release manifest verifies the version, asset URL, and digest.
- Released installers are intentionally unsigned and may show an unknown-publisher warning. This warning must never be described as proof of compromise.

## Disclosure

Please allow a reasonable period for investigation and remediation before public disclosure. The maintainers will acknowledge a valid private report, keep the reporter informed when possible, and publish a factual advisory when a fix is available.
