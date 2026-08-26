# Release code name and dim-sum record

## Behavior

The first planned release code name is **Classic Har Gow · 蝦餃**. The authoritative catalog record is `hk-dish-0001`. The code name is decoration beside the version and never replaces the semantic version.

The authoritative public image is:

`https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-classic-har-gow.png`

The catalog revision used to choose the record is `736e8c1d9e40e1d146f3c3b11bb329b97c4ef515`. The consumer repository does not copy the image or the public catalog into a second source of truth.

## Configuration

Release composition records the semantic version, bilingual dish name, record ID, immutable catalog revision, and public asset URL together. Future releases select a different unused record with a published public image. The website startup surprise may reference the same public asset, but it remains separate from the eight local hair-reference photographs.

## Failure modes

- If the catalog or image cannot be resolved, the release keeps its version and reports that no code name was attached.
- A missing image must not be filled with a generated, downloaded, or repository-tracked substitute.
- Reusing `hk-dish-0001` for a later project release would make the mapping ambiguous and must be rejected.
- A public URL that does not return a decodable image remains unverified.

## Security and privacy

The public image request contains no visitor identifier, profile value, measurement, credential, or analytics parameter. The image is not copied into this repository, a release asset, an export, or a browser-local history record. The public catalog is the sole authority for the dish name and photograph.

## Verification

The composer embeds the code name, record ID, catalog revision, and public URL together in artifact provenance, and the website startup-surprise source references the same public asset without copying it. Anonymous URL fetch, image decode, release-note presentation, About presentation, composed website presentation, unused-name check, and final release evidence remain pending.

## Suggested articles

- [Release, installation, and updates](release-install-and-updates.md)
- [Home and verified download](../site/home-and-download.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
