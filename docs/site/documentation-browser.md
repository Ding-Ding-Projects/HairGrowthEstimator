# Offline documentation browser

## Behavior

The website template declares a documentation panel at `#panel-docs`, a title-and-body search at `#docs-search`, an article list at `#docs-list`, and a rendered article region at `#docs-article`. Build composition is expected to place the categorized Markdown articles into `#bundled-docs` so reading and searching do not require a runtime network fetch.

Article links must resolve inside the website and keep focus and tab context. Provider-authored Markdown must pass through one shared, isolated renderer that supports headings, lists, links, and fenced code while removing executable or unsafe markup.

## Configuration

The composition step needs a hand-written article inventory plus an exact comparison against the files under `docs/`. The bundle records article IDs, titles, categories, source paths, and sanitized rendered content. Plain-text search is the default, with the adjacent full regex workbench available explicitly.

## Failure modes

- An article on disk that is missing from the bundle must fail the completeness check.
- A link to an unknown article must show an unavailable state instead of opening a dead route.
- Invalid Markdown or sanitizer refusal must preserve the article title and show a bounded error.
- A failed offline load must not silently fetch a network copy.

## Security and privacy

Bundled articles are treated as data, not script. The renderer must not execute HTML event handlers, scripts, embedded remote content, or privileged application actions. Relative links are resolved only against known bundled articles. Search queries and sample text remain local.

## Verification

Source inspection confirmed bundle parsing, title-and-body filtering, article selection, an escaping-first Markdown renderer, headings, lists, fenced code, inline code, emphasis, and allowlisted link shapes in `site/app.js`. Build composition, exact article-count comparison, in-site interception of relative article links, focused tests, built interaction, and capture evidence are pending. Verification must cover every article, cross-article links, plain and regex search, unsafe markup, keyboard navigation, screen-reader labels, and offline reload.

## Suggested articles

- [Search and regex workbench](search-and-regex-workbench.md)
- [Status and build provenance](status-and-provenance.md)
- [Website universal-feature inventory](../inventory/site-universal-features.md)
