# 首頁與已驗證下載

## 行為

首頁必須講清楚桌面產品做到甚麼、列出完整功能、連到詳細文件、顯示目前狀態，並且只可以喺不可變更嘅發行資產通過驗證之後，先提供直接下載 Windows 安裝程式嘅按鈕。頁面亦必須清楚講明，呢個網站唔係已安裝嘅產品。

首頁嘅估算說明，用一個平均公曆月 `365.2425 / 12 = 30.436875 days` 去計算已經過時間嘅目前長度，同埋到達目標仲要幾耐。每月 1.0 cm 係可以調整、非醫療用途嘅規劃預設值，而且個人差異可以相當明顯。相關臨床概覽仍然係 [Hair Growth Disorders, StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK499948/)。

## 設定

安裝程式連結只會來自固定 `dist/terminal-transfer` 交接。嗰個目錄必須啱啱好包含 `installer-manifest.json`、`release-context.json`、`trusted-product-validation.json` 同 `terminal-transfer-receipt.json`。Installer、context 同 receipt 輸入各自最多 65,536 bytes。完整 trusted-product record 因為攜帶已排序 source-binding file arrays，所以最多 16,777,216 bytes。每個輸入都要先經 fatal UTF-8 decoding、closed object fields、精確 byte count 同 SHA-256 驗證，先可以接納任何 release identity。環境指定輸入或者舊有 `release/installer-manifest.json` 一律唔會採用，費事有兩份真相互相扯頭髮。

`validateInstallerManifest` 只接受 `schemaVersion`、`owner`、`repository`、`tag`、`target`、`version`、`platform`、`filename`、`bytes`、`sha256`、`unsigned` 同 `publication`。Release context、trusted validation 同 terminal receipt 會獨立綁定 owner 同 repository、精確 composed commit、logical run 同 attempt、release version 同 tag、已複製 file bytes、完整 source bindings，以及 terminal publication identity。Release version 可以同 tracked `package.json` 唔同，所以真正 `1.0.<run number>` release 唔會畀靜態 `1.0.0` source version 擋住。Composer 會由已驗證 terminal installer manifest 衍生可見版本，並由佢嘅 canonical `publication.publishedAt` 衍生 updated-at。完全冇 terminal-transfer directory 時，就會保留坦白嘅 package-and-commit provenance record，而且唔會有 installer URL。

Composition 成功之前，composer 會獨立讀取精確 tagged GitHub release，驗證 target、IDs、state、publication time 同 Setup asset metadata，下載嗰份 Setup asset，再重新計算 byte count 同 SHA-256。之後瀏覽器會再次檢查 embedded provenance 同 installer。只有 release-bound provenance source、精確 version tag、160-character filename limit、canonical publication time、positive IDs、exact immutable URL 同 installer record 全部一致，`renderProvenance` 先會啟用控制項。

送出嘅 HTML 必須直接包含 Open Graph metadata，包括絕對 HTTPS 圖片 URL、尺寸、替代文字、大圖 social card 同 theme color。靜態 Content Security Policy 必須將 scripts、styles、images、workers、connections、frames、objects、forms 同 base URLs 限制喺文件所述網站功能真正需要嘅最少來源。

## 失敗情況

- 未有已驗證發行版本之前，安裝程式控制項會保持停用，而且唔會帶 URL，唔可以靠估開工。
- 如果發行資訊清單無法驗證，頁面必須保留上一個已驗證嘅事實狀態，並顯示坦白嘅暫時不可用訊息。
- 資訊清單就算有一個睇落有效嘅雜湊，只要下載 URL 可以變更或者未獲批准，都唔可以啟用安裝程式控制項。
- 資訊清單解析失敗、資產大小溢位、出現未知欄位或者 schema 唔支援，都必須令下載保持停用，亦唔可以留下任何只驗證咗一半嘅欄位。
- 相對 social image URL 或者由 JavaScript 注入嘅 metadata，唔符合連結預覽爬蟲嘅要求。
- 如果未有可用擷取畫面，必須標示為待完成，唔可以用模擬產品圖片頂替。

## 安全與私隱

頁面唔可以包含 analytics、第三方 scripts、remote fonts、秘密資料、私人主機細節，或者 metadata 入面嘅訪客專屬資料。下載連結必須使用公開而不可變更嘅發行資產。

## 驗證

原始碼檢查已確認可見網站專用界線、完整導覽外殼、靜態 Open Graph tags、絕對 HTTPS `og:image`、尺寸、替代文字、大圖 card、theme color、本地 logo assets、composer 管理嘅 social-preview 產生流程、靜態 Content Security Policy、有界限 fatal-UTF-8 terminal inputs、closed transfer schemas、完整 source-binding validation、copied-file hashes、精確 release identity、GitHub release readback、Setup-byte download verification、runtime `isValidProvenance`，以及 runtime `isValidInstallerManifest`。Focused terminal-transfer suite 喺實作之前，針對 static-version contradiction、target mismatch、stale or incomplete receipt 同 missing manifest，刻意錄得 red 4 of 4。還原完整合約之後，結果係 4 passed、0 failed、0 skipped。來自真實 release 嘅 terminal transfer、公開部署、served-response inspection 同真實產品擷取仍然待辦。

## 建議文章

- [離線文件瀏覽器](documentation-browser.md)
- [更新紀錄檢視器](changelog-viewer.md)
- [發行、安裝與更新](../operations/release-install-and-updates.md)
- [狀態與建置來源證明](status-and-provenance.md)
- [私隱與資料界線](../security/privacy-and-data-boundaries.md)
