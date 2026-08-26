# Evidence-only data isolation

## Launch contract

The headless evidence harness launches the application with exactly these switches:

```text
--evidence-mode
--evidence-app-data=<absolute-empty-task-root>
--evidence-user-data=<absolute-empty-task-root>
```

Each switch must appear exactly once. Both paths must be absolute, distinct, non-overlapping, empty or missing, below an exact `.hair-growth-evidence-task` path segment beneath the operating-system temporary root, and free of symbolic-link or reparse components. Filesystem roots, relative paths, outside-temporary marker paths, marker lookalikes, nonempty directories, files, overlap, and duplicates stop startup.

Normal mode is selected only when no `--evidence-*` argument is present. The two reserved data switches are never accepted by themselves. If either one appears without the exact `--evidence-mode` switch, startup stops instead of treating the launch as normal mode. The mode switch is exact and takes no value, so spellings such as `--evidence-mode=true`, `--evidence-mode=false`, `--evidence-mode=`, and `--evidence-modee` also stop startup. Unknown `--evidence-*` switches are rejected even when all three required switches are present.

The validator creates missing validated roots, rechecks every path component, and activates both Electron paths before readiness or any ordinary application-data read. Normal launches do not call `app.setPath` and do not create a receipt.

## Physical path identity

Textual path comparison is not enough because one physical directory may have more than one spelling. The validator resolves each root with `fs.realpathSync.native`. When the final root does not exist yet, it walks upward to the deepest existing ancestor, resolves that ancestor natively, and then appends the still-missing suffix. This preserves safe support for missing empty roots while making long-name, 8.3-name, case, and link aliases compare by physical identity. Physical equality, ancestry, or descendant overlap stops startup.

Symbolic-link and reparse checks remain separate and still inspect every existing component. Filesystem inspection failures stop startup and report only an allowlisted stable error code. Unknown or malformed adapter codes become the fixed `filesystem_error` value. Supplied raw paths and underlying filesystem error messages are not included in validation errors.

## Hash-only receipts

The isolated user-data root receives `evidence-isolation.json`. The isolated application-data root receives `evidence-app-data-active.json`. Receipts contain schema version 1, booleans describing the active isolation state, and SHA-256 values only. They never contain raw paths.

Canonical hashing uses the normalized absolute path as UTF-8 after Unicode NFC normalization, changes backslashes to `/`, and lowercases on Windows.

## Failure and privacy behavior

A refused launch stops before application state, shared records, credentials, or history can be read. Receipt creation uses exclusive file creation, so an unexpected repeat cannot overwrite prior evidence. The receipts stay inside disposable harness storage and are not exposed through the preload bridge or renderer. Physical-identity validation never logs a supplied path.

## Verification

Run `node --test tests/core/evidence-paths.test.js tests/core/presentation-wave-integration.test.js`.

## 香港粵語

普通模式只會喺完全冇 `--evidence-*` 參數時先啟動。證據模式只接受三個指定開關，每個一次。任何資料開關如果冇配合精確 `--evidence-mode`，程式都會停止啟動，唔會當普通模式繼續。`--evidence-mode` 唔接受任何值，所以 `--evidence-mode=true`、`--evidence-mode=false`、`--evidence-mode=` 同 `--evidence-modee` 都會被拒絕。就算三個必要開關齊晒，任何未知 `--evidence-*` 開關一樣會被拒絕。

兩個資料位置一定要係絕對路徑、互不重疊、空白或者未建立，並且放喺作業系統臨時目錄之下嘅精確 `.hair-growth-evidence-task` 路徑段。驗證器會用 `fs.realpathSync.native` 比較實體路徑。如果最終位置未建立，程式會向上搵到最深而已存在嘅祖先，先做原生解析，再加返未建立嘅尾段。咁樣可以安全保留未建立位置，同時令長名稱、8.3 短名稱、大小寫同連結別名無法扮成兩個唔同位置。實體相同、祖先或者後代重疊全部會停止啟動。

程式會再逐個檢查連結同重解析點，之後先交畀 Electron 使用，全程早過正常資料讀取。檔案系統檢查如果失敗，只會回報許可清單內嘅穩定錯誤代碼。未知或者格式錯誤嘅代碼會變成固定 `filesystem_error`，唔會記錄用戶提供嘅原始路徑或者底層錯誤訊息。

兩份收據只放版本、布林狀態同路徑 SHA-256，唔會寫原始路徑，亦唔會送去畫面或者預載橋接。

## Suggested articles

- [Shared School mode](../features/shared-school-mode.md)
- [Scheduled settings](../features/scheduled-settings.md)
- [Narrator voices and pacing](../features/narrator.md)
