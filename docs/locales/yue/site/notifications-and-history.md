# 通知與本地歷史

## 行為

Informational、success、progress 同 non-decision failures 會以唔阻塞嘅 corner notifications 顯示。Errors 同 warnings 會一直保留，直至使用者 dismiss。Notification center 會保存已 dismiss items，方便之後再睇，亦支援 filtering、selection、bulk dismissal、經 destructive confirmation 嘅 bulk deletion，同 filtered export。

訪客擁有嘅 settings、lists 同 records 需要 append-only local history。History 包括 factual action labels、date-range and action filters、text search、以 new revision 形式 restore、labels、retention controls 同 redacted export。

已實作網站會將每一個 accepted state snapshot 儲存喺 monotonic browser envelope。同來源嘅 `storage` events 會載入較新 revision。Stale transaction 會產生 persistent warning，清楚講出 revision，亦會講明較舊變更無保存。呢套 browser-revision mechanism 唔會將 bounded history array 變成 Git、full snapshot diff 或 cross-device synchronization，唔會因為換咗個威風名就突然多咗超能力。

## 設定

網站將 notification 同 history state 儲存喺 versioned browser-local envelope，內含 revision、writer identity、write time 同 payload。Web Locks 或 IndexedDB read-write transaction 會序列化 same-origin writes。Filters 喺 inactive 時預設 collapsed，會保存 collapsed state，而且 active filter 就算 collapsed 都要披露。

## 失敗情況

- Browser storage exhaustion 或 corruption 必須回報，唔可以聲稱 new revision 已經記錄。
- Failed history write 唔可以靜靜阻止使用者原本要求嘅 primary action。
- Bulk actions 必須回報 partial results 同每一個 excluded item。
- Restoring history 必須建立 new entry，唔可以 rewrite prior history。
- Later storage event 會取代 older local generation 嘅 queued snapshots。嗰啲 snapshots 會被拒絕，永遠唔會重播並蓋過 newer revision。

## 安全與私隱

Secrets、personal vocabulary contents、custom logo bytes、authentication material 同 private paths，都唔會進入 notification bodies、history snapshots、exports 或 captures。

## 驗證

原始碼檢查已確認 corner snackbars、persistent errors and warnings、timed informational messages、searchable notification list、select-every-match、confirmed bulk deletion、bounded append-only history array、date and text filtering、redacted history export、monotonic state revisions、stale-write warnings 同 same-origin storage-event reconciliation。Low stimulation mode 會抑制 informational snackbar interruptions 同相關 narration，但 records 仍然可以喺 notification center 睇到；warnings 同 errors 會繼續顯示。`tests/site/correctness.test.mjs` 覆蓋 exclusive monotonic writes 同 stale refusal。目前 history surface 未有 action filter、diff、restore、labels 或 retention editor。Notification bulk dismissal、filtered export、storage-quota recovery、localization 同 built-site evidence 仍然未完成。

## 建議文章

- [更新紀錄檢視器](changelog-viewer.md)
- [破壞性操作確認](destructive-confirmation.md)
- [設定與外觀](settings-and-appearance.md)
- [本地鎖與驗證器](locks-and-authenticator.md)
- [瀏覽器儲存限制](../security/browser-storage-limitations.md)
