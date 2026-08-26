# 剪髮紀錄同重設行為

## 行為

伺服器會儲存有日期嘅剪髮紀錄，每項包含 identifier、剪後厘米長度、備註同更新 timestamp。建立紀錄時，如果已有相同 identifier，會取代舊紀錄，之後按日期由新至舊排序。紀錄可以用 identifier 刪除。

瀏覽器原始碼會建立或編輯有日期嘅剪髮紀錄，以正式厘米值儲存剪後長度，再將較新日期排喺前面。每次建立、編輯或批量刪除之後，`reconcileBaseline` 都會選擇最新而有效嘅剩餘剪髮紀錄，作為目前估算基準。日期相同時，會先按更新時間，再按 identifier，用確定性規則決定次序。將目前有效紀錄改成較早日期，可以令另一項紀錄成為有效基準。刪除所有有效剪髮紀錄之後，程式會還原獨立保留嘅手動後備值，而唔會偷偷翻用已刪除紀錄。網站之後會重新呈現紀錄清單、有效來源解釋同估算。桌面 renderer transition 仍然有待完成，因為最近一次檢查時 renderer 並唔存在。

## 設定

- 日期使用 `YYYY-MM-DD`。
- 瀏覽器剪髮日期必須係訪客本地時區嘅今日或之前。
- 剪後長度限制為 0 至 300 厘米。
- 備註會移除頭尾空白，並限制為 500 個字元。
- Client 提供嘅 identifier 必須由 8 至 64 個英文字母、數字或連字號組成，否則伺服器會建立 UUID。

## 失敗情況

- 無效日期、長度、備註同 object 會收到 HTTP 400。
- 刪除不存在嘅紀錄會收到 HTTP 404。
- 同時發生嘅服務寫入會經 store transaction queue 串行處理。
- 同源瀏覽器分頁會透過 Web Locks 或 IndexedDB transaction 串行處理訪客狀態寫入，附加單調遞增修訂同全新 per-document writer identity，並拒絕過期寫入，而唔係覆蓋較新修訂。
- 冇專用嘅 edit HTTP route。Client 目前會再次提交相同 identifier 來編輯。
- 舊有未來日期瀏覽器紀錄仍然會連同 inline warning 顯示，但只要日期仲喺未來，就會被有效基準排除。改返今日或之前之後，佢會即時符合資格。
- 瀏覽器批量刪除會經已宣告嘅 destructive-action confirmation，但 undo 同 built interaction proof 仍然有待完成。
- 已檢查 renderer snapshot 未有桌面刪除確認同 undo 行為。

## 安全同私隱

剪髮日期同備註可能屬於個人資料。服務會將資料寫入設定嘅 data file，並喺支援嘅情況下使用限制性 file mode。Network mode 需要 API key。Logs 唔會列印紀錄內容。

## 驗證

原始碼檢查確認 `site/app.js` 入面嘅建立、編輯、確定性排序、基準重新協調、已篩選匯出同批量刪除，`site/state-contract.js` 入面嘅選擇規則，以及 `server/index.js` 入面嘅建立、按 identifier 取代、排序同刪除行為。`tests/site/correctness.test.mjs` 證明建立、編輯同刪除後嘅有效選擇、保留後備值行為，同排除未來紀錄。聚焦 API 測試、destructive confirmation 互動、歷史匯出互動、桌面重設測試，同成品證據仍然有待完成。

## 建議文章

- [頭髮生長估算](hair-growth-estimation.md)
- [匯出行為](export.md)
- [HTTP API](../api/README.md)
