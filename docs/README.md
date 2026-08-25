# Hair Growth Estimator documentation

This documentation describes the desktop product, its optional HTTP service, and its public documentation and download website. It separates implemented behavior from requirements that still need code or verification.

## Documentation map

- [Product features](features/README.md)
- [Public website](site/README.md)
- [HTTP API](api/README.md)
- [Operations](operations/README.md)
- [Security and privacy](security/README.md)
- [Completeness inventories](inventory/README.md)

## Evidence language

The following terms are used consistently throughout these articles:

- **Implemented** means a source boundary is present in the inspected revision.
- **Locally verified** means a named local check has completed successfully against the stated revision.
- **Built-artifact verified** means the packaged desktop product or composed website was exercised directly.
- **Pending** means the requirement has no accepted proof yet. A planned selector, test identifier, interaction path, or capture filename is not evidence by itself.

The current documentation baseline was prepared from revision `f7cf721809bb44047340e7893ed59b9268875871`. Source may continue changing until the release candidate is pinned.

## Product boundary

The website is a documentation, download, status, settings, and link surface. It is not the installed desktop product and does not replace it. Website controls affect only the website and visitor-owned browser state unless an article explicitly describes a supported local connection.
