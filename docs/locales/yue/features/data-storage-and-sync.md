# 本機儲存同選用同步

## 行為

桌面主程序會將 version 1 狀態儲存到產品私人 user-data 目錄下面嘅 `hair-growth.json`。寫入時會先建立獨一無二嘅臨時檔案，再用有次數上限嘅重試 rename。選用 HTTP 服務會將 profiles 同剪髮歷史儲存到佢設定嘅 JSON data file，並將 mutation 串行處理，唔會等幾個寫入一齊衝門口。

預設使用本機儲存。產品可以設定直接 HTTP 或 HTTPS service URL，亦可以用受管理 SSH tunnel 連接本機 port。已檢查原始碼會透過隔離 preload bridge 提供所需 privileged operations。

公開網站使用一份獨立、只屬於瀏覽器嘅 transaction contract。穩定 localStorage key 而家儲存一個 envelope，包含 `storageEnvelopeSchema`、單調遞增嘅 `revision`、每份 document 全新嘅 `writerId`、`writtenAt`，同 version 1 visitor state。Web Locks 可用時，寫入會進入 exclusive critical section。否則，瀏覽器會回退到 read-write IndexedDB transaction，將相同來源嘅 localStorage read、revision comparison、write 同 verification 串行處理。如果兩條受支援路線都唔存在，系統會清楚拒絕寫入，而唔會用唔安全嘅 best-effort write 碰運氣。

每次寫入都會喺持有 exclusive transaction 時，將 expected revision 同最新 stored revision 比較。唔一致時會回傳較新狀態，並拒絕過期 mutation。該分頁會採用較新狀態，解釋較舊變更未有儲存，並請訪客喺仍然需要時再做一次。`storage` event 會採用其他同源分頁寫入嘅較後修訂。呢個機制唔會將瀏覽器狀態傳送去另一部裝置、選用服務或任何網絡同步供應商。

## 設定

- `settings.storageMode` 預設為 `local`。
- `settings.serverUrl` 預設為 `http://127.0.0.1:4782`。
- 連線 timeout 預設為 8,000 ms，request helper 會將佢限制喺 1,000 至 30,000 ms。
- 服務 data path 由 `HAIR_DATA_FILE` 控制。
- 服務喺每條 API path 接受獨立 profile identifier。
- 網站 state key 維持 `hairGrowthEstimator.websiteState.v1`，envelope revisioning 唔會改變產品 identity 或 import schema。
- 每次載入瀏覽器 document 都會建立全新 writer identifier，將佢鏡像到該分頁嘅 sessionStorage 供本機狀態使用，並隨每次提交嘅瀏覽器修訂一齊記錄。因此，duplicate tab 喺 document 載入時會得到新 identity。

## 失敗情況

- 本機資料缺失時會建立預設狀態。
- 無效本機 JSON 目前同樣會建立預設狀態，而且唔會保留或顯示無效 bytes。
- Code 為 `EPERM`、`EACCES` 或 `EBUSY` 嘅短暫 rename failure，會用遞增 delay 重試七次。
- 其他寫入 failure 會傳返 caller。
- Network timeout 會中止 request，而 server response 入面嘅無效 JSON 會以 error 形式傳返。
- 如果同源瀏覽器寫入所基於嘅 revision 已經過期，寫入會被拒絕。程式會載入較新 stored revision，並向訪客顯示 non-blocking warning。
- 如果瀏覽器同時冇 Web Locks 同 IndexedDB，就無法安全串行處理寫入，因此 persistence 會被拒絕，並顯示精確復原訊息。
- 手動清除 origin storage 會重設只屬瀏覽器嘅狀態，並開始新嘅本機 revision lifecycle。呢個操作唔會刪除桌面或服務資料。

## 安全同私隱

API key 會喺可用時透過 operating system storage facility 加密，並同設定分開儲存。如果加密唔可用，主程序會拒絕儲存新 key。內嵌 credential 嘅 URL 會被拒絕。服務使用 network mode 時，必須設定最少 24 個字元嘅 API key。

## 驗證

原始碼檢查確認獨一無二臨時檔案、有次數上限嘅 rename retries、串行服務 mutations、有上限 request timeouts、分開儲存 API key，同 URL validation。網站方面，檢查確認 `site/state-contract.js` 同 `site/app.js` 入面嘅 envelope、Web Locks route、IndexedDB transaction fallback、revision comparison、寫入後 verification、storage-event reconciliation，同 stale-write warning。`tests/site/correctness.test.mjs` 證明兩個 revision zero concurrent writers 會產生一個 revision-one commit 同一個明確 stale refusal，之後再產生 revision-two commit。真實瀏覽器入面嘅 IndexedDB 行為、storage quota failures、corrupt-value recovery、完整 client synchronization，同成品證據仍然有待完成。

## 建議文章

- [本機服務運作](../operations/local-service.md)
- [私人 LAN 託管](../operations/private-lan.md)
- [SSH tunnels](../operations/ssh-tunnels.md)
