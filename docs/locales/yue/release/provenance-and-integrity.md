# Provenance、完整性與 line-count 證據

Release 證據會綁定真正 build 出嚟嘅 artifact。Metadata file 話自己來自某個 commit，單靠呢句自我介紹唔算證明，紙牌唔可以自己頒畀自己。

## Candidate source 綁定

Packaging 之前，`scripts/release/assert-clean-candidate.mjs` 會要求 porcelain status 為空，並喺 resolved context 已經存在時記錄準確 commit、commit epoch 同 release-identity digest。同一 commit 嘅 continuation 亦要求 status 為空。Release 專用嘅 `package.json`、`app/release-metadata.json` 同 `app/provenance.json` bytes 只會喺 `dist/package-input` 下面產生。Staged lockfile 係 build input，唔會 map 入 `app.asar`。`scripts/release/assert-source-preserved.mjs` 會喺 packaging 前 hash 每個 tracked file，完成之後要求每條 path 同每粒 byte 完全相同。任何 staged、untracked、renamed、deleted、changed 或 tampered source entry 都會停止 packaging，唔畀 source 偷偷換衫混入場。

Generated electron-builder configuration 會由 resolved release context 設定 `extraMetadata.version`，所以 packaged root metadata 同 staged provenance 會有相同 version，而唔需要修改 tracked `package.json`。Packaging 之前，`npm run verify:icons` 會檢查 committed master、generated PNG 與 ICO outputs、manifest hashes、dimensions 同 multiresolution icon inventory。Packaging 唔會重新生成 tracked icon files。Resource editing 只會接觸 generated executable output，之後 `scripts/release/assert-source-preserved.mjs` 會證明 tracked source 每粒 byte 都冇變。

對於 `app.asar`，預期 inventory 包括：

- 每個 packaged `app/` file；
- 每個 packaged、非 generated asset；
- 由 `assets/icons/` map 去 runtime asset paths 嘅 canonical icon outputs；
- 只套用 release version transformation 嘅 `package.json`；
- 由 candidate commit 產生嘅 `app/provenance.json`；
- 只套用 documented release-context transformation 嘅 `app/release-metadata.json`。

Validator 會列舉 actual archive 入面每個 regular file，包括 expected `app/`、`assets/` 同 root package record 以外嘅 paths。完整 actual set 必須等於 hand-written expected set。少一個 file、多一個意外 framework 或 package file、混入 extra uncommitted file，或者相差一粒 byte，驗證都會失敗。

Server 會檢查兩次，一次係 Windows package 嘅 `resources/server/` tree，另一次係由 OCI layers 重建出嚟嘅 final `/opt/hair-growth/server/` files。兩邊都必須等於 candidate Git blobs，唔可以一邊梳晒頭、另一邊戴假髮。

每份 `sourceBinding.appAsar` 同 `sourceBinding.server` receipt 都使用同一 closed schema。內容有 `fileCount`、`bytes`、`inventorySha256` 同完整 `files` array。每個 file record 只可以有 `path`、`source`、`bytes` 同 `sha256`，並按 packaged-path 排序。Validator 要求 `fileCount === files.length`，aggregate byte count 要等於每個 record 嘅總和，亦會拒絕空 inventory。佢會用以下準確格式，對每個 sorted record 嘅 UTF-8 concatenation 重新計算 `inventorySha256` 嘅 SHA-256：

```text
<path>\0<bytes>\0<sha256>\n
```

描述用嘅 `source` value 仍然會喺每個 record 顯示，但唔屬於 aggregate hash。咁 independent consumer 就可以重新計出相同 inventory digest，唔需要盲信 claimed summary。

## Windows manifest

`release-manifest.json` 會記錄：

- schema 同 installer family；
- version、source commit、platform 同 architecture；
- setup filename、bytes、SHA-256、unsigned state 同 embedded icon identity；
- setup bootstrap payload 入面準確 embedded full-package filename、bytes 同 SHA-256；
- `RELEASES` filename、bytes 同 SHA-256；
- 每個 package filename、type、bytes、SHA-1 同 SHA-256；
- embedded application executable 同 `app.asar` hashes；
- release code name 同 catalog record；
- 準確 source-binding file counts、byte totals、per-file hashes 同 aggregate inventory hashes。
- 完整 logical-run release identity，包括 catalog status、pinned catalog commit 同 blob、candidate commit、version 同 container transport filename。

SHA-1 仍然保留，因為 Squirrel `RELEASES` format 需要佢。SHA-256 會另外記錄，用嚟驗證 release 完整性，兩位 hash 同事各有自己張枱。

## OCI manifest

`container-manifest.json` 會記錄：

- version、source commit、creation time 同 source epoch；
- immutable base name、multi-platform index digest 同選定嘅 `linux/amd64` manifest digest；
- platform、image digest、config digest 同 layer count；
- non-root 同 read-only runtime requirements；
- archive filename、format、bytes 同 SHA-256；
- declared build input hashes；
- actual OCI server source-binding evidence。
- descriptor media-type、digest、byte-length validation 同 two-build reproducibility result。

## Line counting

執行：

```text
npm run count-lines
```

針對 release commit：

```text
node scripts/core/count-lines.mjs --commit <full-commit> --markdown line-count.md --json line-count.json
```

Committed counter 會讀取指定 Git commit，而唔係 working directory。佢會報告 project source、tests、styles 與 markup、scripts 與 configuration、documentation、generated text、generated image binaries、lockfiles 同其他 binaries。Hand-written extensionless inventory 包括 `.gitignore` 同 `Dockerfile`，所以 suffix-based discovery pass 唔可以令佢哋憑空消失。Project、excluded 同 grand totals 會一齊顯示，數字唔可以匿喺梳化底。

Total text lines 同 non-blank text lines 會分開計。Binary files 只貢獻 bytes 同 file counts，text lines 係零。Generated files、dependencies、lockfiles 同 binary assets 唔會灌大 project-code total。

Surviving-line authorship 來自 `git blame`。如果某行嘅 commit author 係 `Claude Fable 5`、commit author 以 `[bot]` 結尾，或者 commit 有準確 `Claude Fable 5` co-author trailer，就會分類為 agent-authored。其他 surviving line 一律分類為 human-authored。每個 aggregate 嘅 attribution totals 必須等於 line totals，否則 counter 會失敗，唔接受數學耍花槍。

## Release timing

Active workflow 會記錄 normalized earliest server job start 同準確 server publication time。佢會發佈 `Workflow completed: pending terminal run verification` 同 `Workflow duration: pending terminal run verification`，因為仲運行緊嘅 finalizer 唔可能知道自己嘅 terminal timestamp，未落堂唔可以先寫放學時間。

Workflow 成功完成之後，terminal helper 會經 attempt-specific job endpoint 讀取每次 GitHub Actions run attempt。佢會驗證準確 run ID、source commit、run number、version、四個 job names、job IDs 同 attempt lineage。Failed 或 skipped historical jobs 可以提供 retry history，但永遠唔可以成為 selected successful timing bounds。Helper 只會 patch 兩行 pending completion lines，計算穩定 `HH:mm:ss`，再準確 read back 同一個 release。準確而較早嘅 terminal notes 會保留，唔會再 patch 第二次。Foreign、ambiguous 或 unbound timing text 都會失敗。

只有 terminal mode 會寫入 `installer-manifest.json`。呢個 file 會準確符合 website composer 嚴格嘅 owner、repository、tag、target、version、platform、filename、bytes、SHA-256、unsigned 同 nested publication schema。Active workflow verification 只會寫 pending readback evidence，所以 website build 唔會喺 terminal release currentness 證明之前意外公開 download。

## First-release delta boundary

First release 冇 prior full package，可以用嚟產生有意義嘅 update delta。佢必須準確發佈一個 full package，而且唔可以有 delta package。Release metadata 會記錄呢個情況為 `first-release-no-previous-package`，並標示第一個 release 之後必須提供 feed。

之後每個 release，packaging path 必須由 configured earlier non-draft release 取得準確一個 prior full package。Delta generation 之前，佢必須驗證 prior release identity、tag 與 target binding、預期 full-package filename、downloaded byte count 與 digest、NuGet package identity，同埋已驗證嘅 `RELEASES` row。跟住必須對照新 release manifest，驗證每個 generated delta row 同 package。Release 遺失、搵唔到 matching full package、出現多個 candidates、stale target、download 失敗，或者任何 size、hash、name、version 或 feed 不一致，都會 fail closed。之後嘅 release 永遠唔會靜靜 fallback 去 full-only feed。

## 建議閱讀

- [GitHub Actions release 自動化](automation.md)
- [Windows application 與 Squirrel.Windows packaging](windows-packaging.md)
