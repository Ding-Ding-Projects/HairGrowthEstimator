# Hair Growth Estimator

Estimate hair length, record haircut resets, and keep dated haircut history with exact centimetre and inch conversion. The Windows desktop application can use local-only storage or connect to its optional local service through loopback, a private LAN, or an SSH tunnel.

Installer: **pending verification and publication**. No download button or installer URL is published until an immutable release manifest confirms the exact asset.

- [Documentation index](docs/README.md)
- [Website source](site/)
- [Feature inventory](docs/inventory/site-universal-features.md)
- [Hair reference asset inventory](docs/inventory/hair-reference-assets.md)
- [Security and privacy](docs/security/README.md)
- [Operations](docs/operations/README.md)
- [Roadmap](ROADMAP.md)
- [Handoff](HANDOFF.md)

## What it covers

- Adjustable hair-growth estimates with a default of 1.0 cm per month.
- Haircut create, edit, deletion, and dated history with the newest valid remaining haircut as the active baseline and an independently retained manual fallback.
- Exact centimetre and inch display using 1 inch = 2.54 centimetres.
- Animated male hair-stage references at approximately 0.3, 1.5, 3, 5, 9, 14, 20, and 28 cm.
- Local service operation, private-LAN access, and SSH tunnel guidance.
- Local-first browser settings with monotonic same-origin revisions, exclusive Web Locks or IndexedDB transactions, visible stale-write refusal, notifications, history, accessibility controls, and offline documentation.
- Faithful normalized CSV and TSV exports of the complete redacted browser record, with explicit representation and privacy metadata on every row.
- Release, installer, and update status that stays disabled until evidence exists.

The 1.0 cm monthly value is an adjustable estimate, not a promise or medical assessment. Individual growth varies. See [NCBI Bookshelf, Hair Growth and Disorders](https://www.ncbi.nlm.nih.gov/books/NBK499948/).

The first planned release code name is [Classic Har Gow · 蝦餃](https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png), catalog record `hk-dish-0001`.

> [!IMPORTANT]
> The documentation website is a landing, documentation, download-status, settings, and link surface. It is not the primary application and is not an embedded substitute for the installed application.

<details>
<summary>Build the documentation website locally</summary>

The composer uses only Node.js built-in modules.

```powershell
npm run compose-site
```

The output is written to `_site/` by default. Set `SITE_OUTPUT_DIR` to use another output folder. In an integrated release build, set `REQUIRE_HAIR_ASSETS=1` so composition stops when the canonical root hair-reference manifest or any required image is absent.

The visible version comes from `package.json`. The visible updated-at value comes from `SOURCE_DATE_EPOCH` or the current commit time, and never from page-launch time or a file modification time.

</details>

<details>
<summary>Run the local service and desktop application</summary>

```powershell
npm install
npm run start:server
npm start
```

Review [local service](docs/operations/local-service.md), [private LAN](docs/operations/private-lan.md), [SSH tunnels](docs/operations/ssh-tunnels.md), and [privacy boundaries](docs/security/privacy-and-data-boundaries.md) before enabling anything beyond loopback.

</details>

<details>
<summary>Real application captures</summary>

Real captures are pending until the built application artifact is verified through the approved headless capture route. No mock interface image is used as evidence. The checked-in social preview is an original product logo card and must later be replaced or supplemented with genuine built-product captures when those captures exist.

</details>

<details>
<summary>Screen recording</summary>

A real built-artifact screen recording is pending. It will be added only after a verified packaged application can be driven off-screen through the approved capture route. No assembled animation or source preview will be presented as a recording of the application.

</details>

<details>
<summary>Line count and human-effort estimate</summary>

The release line-count table and the corresponding human-effort estimate are pending a committed repository counter and a verified release run. No hand-counted or invented number is published here.

</details>

## Privacy

The website bundles its scripts, styles, icons, and documentation locally. It uses no analytics, trackers, remote fonts, or CDN assets. The only runtime external links are factual public release, evidence, research, and catalog links selected by the visitor. Browser demonstration state stays in that visitor's browser profile. Same-origin tabs reconcile revisioned writes locally and refuse stale mutations, but nothing synchronizes to another device or service. Clearing the website's storage resets it.

The optional dim-sum startup surprise links to the public catalog asset and does not vendor or duplicate the image in this repository.

## License

Hair Growth Estimator is available under the [MIT License](LICENSE).
