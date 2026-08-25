# Completeness inventories

These hand-written inventories name the surfaces and records that must exist even when discovery code, implementation files, or evidence disappear. They are evidence maps, not claims that a declared control works.

## Inventories

- [Website universal-feature inventory](site-universal-features.md)
- [Regex-builder ownership](regex-builders.md)
- [Hair reference asset authority](hair-reference-assets.md)

## Status vocabulary

- **Source present** means the named source file or selector exists in the linked checkout.
- **Declared** means a template contains the control, but runtime behavior has not been verified.
- **Pending** means the required implementation or evidence does not exist or has not been inspected.
- **Verified** is reserved for evidence tied to an exact built artifact. No row in the current inventory has that status yet.

Negative-regression evidence is recorded boundary by boundary. A deliberate break of one provenance selector, one regex-builder registration, or one source module proves only that named check. It does not prove that the entire hand-written inventory, every localization entry, every focused test, every interaction record, and every capture record will turn red when removed.

## Evidence boundary

The focused test identifiers and evidence paths below are stable required identifiers. A path marked pending is a placeholder for a future real artifact, not a link to evidence that already exists.

The accepted hardening suite is source present at `tests/site/hardening.test.mjs`. Earlier focused proof covered the article target and bounded installer publication checks. The latest adversarial fixture removed or weakened the six exact source boundaries recorded in the universal inventory: School-sensitive overlay closure, rebuilt-tab focus restoration, JSONL positive-allowlist use, Worker queue recovery after construction or message-send refusal, bounded fatal-UTF-8 hair-manifest input, and exact Ollama origin alignment. That run reported 11 total tests, 5 passed and 6 failed. Restoring the boundaries reported 11 passed, 0 failed, and 0 skipped. Separate pre-read personal-vocabulary size, localized status-and-action, and owned-copy exemption proofs were each red 1 before restoration and passed 1 afterward. The external vocabulary scanner's exact-count fixture was red 1 with `PRIVATE_VOCABULARY_EXPECTED_COUNT` set to 0, then passed 1 with the expected count restored to 100. The restored suite includes the integrated service-counterpart audit and its deliberate health-route assertion. None of these focused results is complete inventory proof.

## Suggested reading

- [Documentation index](../README.md)
- [Website status and build provenance](../site/status-and-provenance.md)
- [Privacy and data boundaries](../security/privacy-and-data-boundaries.md)
