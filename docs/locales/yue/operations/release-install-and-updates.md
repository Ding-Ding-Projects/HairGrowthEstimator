# 發佈、安裝同更新

## 行為

Windows 發佈必須使用真正嘅 Squirrel.Windows 封裝，並包含 `Setup.exe`、`RELEASES`、完整 `.nupkg`，以及有提供時嘅差異套件。按照現行政策，成品會保持未簽署。產品必須講清楚 Windows 可能顯示不明發行者或 SmartScreen 警告。

已安裝嘅桌面產品必須喺啟動時同有界限嘅排程中檢查已設定 HTTPS 更新來源，驗證來源中繼資料同套件雜湊值，下載時唔打斷進行中工作，並顯示持續而非阻塞嘅就緒狀態，當中包括精確版本、發佈說明、未簽署成品警告、「重新啟動以安裝更新」同「稍後」操作。

## 設定

`package.json` 目前選用 Squirrel 目標、停用強制程式碼簽署，並將 `dist/squirrel-windows` 設為輸出目錄。發佈工作流程必須由固定來源 commit 建置同發佈、記錄工作流程計時、附加必要成品、程式碼行數證據同公開點心中繼資料，而且唔可以喺 GitHub Actions 執行測試或 lint。

網站只會由精確四檔案 `dist/terminal-transfer` 目錄接收 release。Installer、release-context 同 terminal-receipt JSON 輸入各自最多 65,536 bytes，而 trusted product validation 因為攜帶完整已排序 source-binding arrays，所以最多 16,777,216 bytes。Fatal UTF-8 decoding、closed schemas、copied-file byte counts 同 hashes、精確 logical-run identity、精確 composed commit、nested application 同 server bindings、container binding，以及 terminal publication metadata 必須全部一致。部分目錄會被拒絕；完整目錄完全唔存在時，就會產生坦白嘅 package-and-commit provenance，而且唔會有 installer URL。

Release version 來自已驗證 terminal installer，可以合理係 `1.0.<run number>`，而 tracked package metadata 仍然係 `1.0.0`。Updated-at 來自 canonical `publication.publishedAt`，唔會來自 source metadata 或 composition time。Composer 會獨立重新讀取 tagged GitHub release，再下載 Setup asset，重新檢查 byte count 同 SHA-256。之後瀏覽器會再驗證 release-bound provenance source、精確 tag、filename 同 size limits、digest、unsigned state、publication fields 同 IDs，以及 immutable URL，全部過關先畀 `renderProvenance` 啟用下載。

## 失敗情況

- `assets/app-icon.png` 已被引用，但喺檢查嘅修訂版本入面並不存在，呢點會阻擋封裝。
- 檢查嘅原始碼入面冇更新來源或更新程式實作。
- 建置設定尚未明確顯示 `signExecutable: false`。
- 得一個安裝執行檔，但冇相符嘅 `RELEASES` 同套件資產，仍然唔完整。
- 可變嘅最新發佈 URL、未批准資產主機、缺少資產大小、額外欄位，或者發佈身分不符，都會令網站下載狀態保持不可用。
- 唔可以由本機設定或未驗證工作流程狀態推斷發佈成功。

## 安全同私隱

唔使用程式碼簽署。完整性依賴 HTTPS 傳輸、不可變發佈資產、已發佈雜湊值、更新來源驗證同回復保護。更新認證資料絕對唔可以進入 renderer 程式碼、發佈資產、日誌或原始碼。

## 驗證

原始碼檢查已確認 fixed transfer path、精確 four-file inventory、每一項 byte bound、fatal UTF-8 decoding、closed schemas、source-binding record validation、receipt hashes、release/context identity、精確 composed target、獨立 GitHub release metadata，同 downloaded Setup-byte verification。Runtime `isValidProvenance` 同 `isValidInstallerManifest` 會重複 embedded release contract。Focused suite 喺實作之前，針對 static-version contradiction、target mismatch、stale or incomplete receipt 同 missing manifest，刻意錄得 red 4 of 4。還原之後回報 4 passed、0 failed、0 skipped。真實 terminal transfer、本機 `build.bat`、`build-installer.bat`、完整 Squirrel artifacts、unsigned signature inspection、updater states、public website link 同 final workflow result 仍然待辦。

## 建議文章

- [發佈代號同點心記錄](release-code-name.md)
- [版本同建置來源資料](version-provenance.md)
- [首頁同已驗證下載](../site/home-and-download.md)
- [Status Hub 邊界](../security/status-hub-boundaries.md)
