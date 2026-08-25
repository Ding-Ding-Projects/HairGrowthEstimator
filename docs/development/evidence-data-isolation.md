# Evidence-only data isolation

## Launch contract

The headless evidence harness launches the application with exactly these switches:

```text
--evidence-mode
--evidence-app-data=<absolute-empty-task-root>
--evidence-user-data=<absolute-empty-task-root>
```

Each switch must appear exactly once. Both paths must be absolute, distinct, non-overlapping, empty or missing, below an exact `.hair-growth-evidence-task` path segment beneath the operating-system temporary root, and free of symbolic-link or reparse components. Filesystem roots, relative paths, outside-temporary marker paths, marker lookalikes, nonempty directories, files, overlap, and duplicates stop startup.

The validator creates missing validated roots, rechecks every path component, and activates both Electron paths before readiness or any ordinary application-data read. Normal launches do not call `app.setPath` and do not create a receipt.

## Hash-only receipts

The isolated user-data root receives `evidence-isolation.json`. The isolated application-data root receives `evidence-app-data-active.json`. Receipts contain schema version 1, booleans describing the active isolation state, and SHA-256 values only. They never contain raw paths.

Canonical hashing uses the normalized absolute path as UTF-8 after Unicode NFC normalization, changes backslashes to `/`, and lowercases on Windows.

## Failure and privacy behavior

A refused launch stops before application state, shared records, credentials, or history can be read. Receipt creation uses exclusive file creation, so an unexpected repeat cannot overwrite prior evidence. The receipts stay inside disposable harness storage and are not exposed through the preload bridge or renderer.

## Verification

Run `node --test tests/core/evidence-paths.test.js tests/core/presentation-wave-integration.test.js`.

## 香港粵語

證據模式只接受三個指定開關，每個一次。兩個資料位置一定要係絕對路徑、互不重疊、空白或者未建立，並且放喺作業系統臨時目錄之下嘅精確 `.hair-growth-evidence-task` 路徑段。程式先建立已驗證位置，再檢查一次連結同重解析點，之後先交畀 Electron 使用，全程早過正常資料讀取。

兩份收據只放版本、布林狀態同路徑 SHA-256，唔會寫原始路徑，亦唔會送去畫面或者預載橋接。

## Suggested articles

- [Shared School mode](../features/shared-school-mode.md)
- [Scheduled settings](../features/scheduled-settings.md)
- [Narrator voices and pacing](../features/narrator.md)
