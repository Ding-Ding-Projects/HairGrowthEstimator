# Offline documentation browser

## Behavior

The website template declares a documentation panel at `#panel-docs`, a title-and-body search at `#docs-search`, an article list at `#docs-list`, and a rendered article region at `#docs-article`. Build composition is expected to place the categorized Markdown articles into `#bundled-docs` so reading and searching do not require a runtime network fetch.

Article links must resolve inside the website and keep focus and tab context. A relative Markdown link resolves from the current article's source path, maps only to a known bundled article, activates the documentation destination, selects the linked result, and moves focus only after the reader activates the link. Fragment-only links stay within the current article when the target heading exists. `resolveDocumentationPath` and `navigateDocumentationLink` now implement category-relative path normalization, known-bundle selection, and heading scrolling in `site/app.js`. The template gives `#docs-article` `tabindex="-1"`, and `openDoc` requests article focus only on deliberate pointer, Enter, Space, or internal-link activation. A complete unavailable state for unknown or escaping paths and focused internal-routing proof remain pending. Provider-authored Markdown must pass through one shared, isolated renderer that supports headings, lists, links, and fenced code while removing executable or unsafe markup.

The result list is a single-select listbox. Each article result is an option with one selected state. Search and initial rendering may update the list and selected marker, but they must not move focus into the article. Enter, Space, pointer activation, or the internal-link route is the deliberate action that opens an article.

## Configuration

The composition step needs a hand-written article inventory plus an exact comparison against the files under `docs/`. The bundle records article IDs, titles, categories, source paths, and sanitized rendered content. Plain-text search is the default, with the adjacent full regex workbench available explicitly.

## Failure modes

- An article on disk that is missing from the bundle must fail the completeness check.
- A link to an unknown article must show an unavailable state instead of opening a dead route.
- A relative link must not be resolved from the website root when its Markdown source lives in a category directory.
- Rendering or filtering results must not move focus away from the search field or the article a reader is using.
- Invalid Markdown or sanitizer refusal must preserve the article title and show a bounded error.
- A failed offline load must not silently fetch a network copy.

## Security and privacy

Bundled articles are treated as data, not script. The renderer must not execute HTML event handlers, scripts, embedded remote content, or privileged application actions. Relative links are resolved only against known bundled articles. Search queries and sample text remain local.

## Verification

Source inspection confirmed bundle parsing, title-and-body filtering, article selection, an escaping-first Markdown renderer, headings, lists, fenced code, inline code, emphasis, allowlisted link shapes, `resolveDocumentationPath`, `navigateDocumentationLink`, heading anchors, category-relative bundled-article routing, listbox and option roles, selected state, roving option focus, `#docs-article[tabindex="-1"]`, and deliberate Enter, Space, pointer, or internal-link activation in `site/app.js` and the template. The focused accessibility source check was deliberately red when the article target lacked `tabindex="-1"`, then passed after restoration as part of the three-check run with 0 failed and 0 skipped. An unknown or rejected internal route currently falls through rather than rendering the required unavailable state. Exact article-count comparison, traversal and unavailable-state checks, focused internal-routing tests, built interaction, and capture evidence remain pending. Verification must cover every article, category-relative and fragment links, traversal rejection, plain and regex search, unsafe markup, keyboard navigation, screen-reader labels, focus stability, and offline reload.

## Suggested articles

- [Search and regex workbench](search-and-regex-workbench.md)
- [Status and build provenance](status-and-provenance.md)
- [Website universal-feature inventory](../inventory/site-universal-features.md)
