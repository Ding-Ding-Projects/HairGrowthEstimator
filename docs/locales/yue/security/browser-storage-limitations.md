# 瀏覽器儲存限制

## 運作方式

公開網站會用瀏覽器本機儲存，保存訪客自己嘅設定同示範資料。呢份儲存只屬於同一個瀏覽器 profile 同 origin。同源分頁可以協調 revision，但除非有另一個已有文件交代嘅中介正在運作，否則資料唔會同另一個瀏覽器 profile、裝置、已安裝桌面產品或者可選服務共享。

## 設定

瀏覽器執行階段使用穩定 key `hairGrowthEstimator.websiteState.v1` 同訪客 schema version 1。數值會包喺 storage-envelope version 1 入面，當中有只增不減嘅 revision、每份已載入文件各自新建嘅 writer identifier、記錄寫入時間，同埋 state payload。執行階段會將已識別嘅巢狀設定同編譯預設值合併，亦提供破壞性確認路徑，經同一個排他 transaction 流程重設狀態。呢個 key 同訪客見到嘅顯示名稱互相獨立，改名唔會搞到資料突然走失。

匯入嘅瀏覽器狀態會同已儲存 envelope 分開解析同驗證。`parseJsonStrict`、`validateBrowserState`、`validateAppearanceMap` 同 `sanitizeImportedState` 會拒絕重複或者唔安全嘅 key，強制完整 shape 同 bounds，並建立一份新數值，排除 credential、personal vocabulary、自訂標誌 bytes、協調 metadata 同未知 field。巢狀 `validateOllama` 邊界只接受 `http://127.0.0.1:11434` 或者 `http://localhost:11434` 嘅已儲存本機模型狀態，可以有一個可選根目錄斜線，另外模型 rows 同 timestamp 都有界限。成功即時連線之後，執行階段會保存正規化嘅 `url.origin`。`validateStoredStateEnvelopeText` 會另外驗證有界限嘅已儲存 envelope 同 legacy state。執行階段會喺初始載入、storage-event 採納、persistence snapshot、state import 同 appearance import 使用呢啲邊界。

Web Locks 係首選同源 transaction 路徑，IndexedDB read-write transaction 就係受支援後備。localStorage read、expected-revision comparison、write 同 read-back verification 全部都會喺呢條排他路徑入面完成。合併訪客狀態已經冇任何未經檢查嘅 localStorage 寫入路徑，唔會俾兩個分頁鬥快撞車。

## 失效情況

- Private 或 incognito session 關閉時可能會丟棄資料。
- 清除瀏覽器資料、origin 改變、storage eviction、quota exhaustion 或 corruption 都可能移除資料。
- 瀏覽器儲存唔會提供作業系統 credential vault。
- 同源 storage coordination 唔係伺服器同步、backup 或跨裝置 conflict resolution。
- 過時寫入會被拒絕，未儲存嘅本機 mutation 亦會喺載入較新 revision 之後被丟棄。訪客要檢查改動，如果仍然需要，就要再做一次。
- 如果 Web Locks 同 IndexedDB 都唔可用，寫入會停止並顯示清楚失敗，而唔會靜雞雞冒險覆蓋資料。
- 靜態託管無法開啟本機 application-data folder，亦無法啟動任意程式。
- 被拒絕嘅匯入必須保留之前 revision，亦唔可以將無效 payload 入面已識別嘅 field 部分合併落去。

## 保安同私隱

網站鎖定同本機歷史記錄係方便功能，唔係用嚟防住已經可以存取瀏覽器 profile 嘅人。放喺瀏覽器儲存嘅 authenticator secret 必須清楚披露限制。除咗普通靜態檔案請求之外，訪客擁有嘅狀態唔應該傳送俾託管供應者。

目前瀏覽器執行階段會將 TOTP secret 同 lock TOTP factor 儲存喺同一份 localStorage record。一般匯出會遮走佢哋，但對 origin 下面執行嘅程式碼而言，localStorage 本身係 plaintext。呢個邊界明顯弱過作業系統 credential vault，唔好將兩者當孖生兄弟。

## 驗證

原始碼檢查確認 `site/app.js`、`site/state-contract.js` 同 `site/security-contract.js` 入面有穩定 key、帶 revision 嘅 envelope、default merge、每份文件新建嘅 writer identity、Web Locks 同 IndexedDB transaction 路徑、stale-write refusal、storage-event reconciliation、write-failure notification、以 transaction 執行嘅 clear-data action、正面 allowlist general export、嚴格 whole-file import、allowlisted appearance import 同 application、正規化即時 Ollama origin persistence、精確 saved Ollama origin validation、sanitized state construction、bounded stored-envelope parsing、invalid stored-state quarantine，同埋 display-name independence。聚焦 hardening test 涵蓋 saved Ollama origin source boundary。聚焦 concurrency test 透過 exclusive lock adapter 證明 monotonic revision 同 stale-writer behavior。Corrupt-state recovery、真正 IndexedDB contention、quota handling、reload persistence、private-mode behavior、no-network assertions 同 built-artifact evidence 仍然待辦。

## 建議文章

- [本機鎖定同驗證器](../site/locks-and-authenticator.md)
- [設定同外觀](../site/settings-and-appearance.md)
- [私隱同資料邊界](privacy-and-data-boundaries.md)
