# 支援單

## 運作方式

支援單係一個虛構、只存在於瀏覽器本機嘅復原服務台，可以由 lock prompt、lock setting 同 Help 進入。本機支援單包括 category、description、自動產生嘅 number、純裝飾用嘅 severity、status progression 同 canned response。佢真正有用嘅解決方法，係解釋點樣打開瀏覽器設定，等使用者自己刪除呢個網站嘅本機資料。

介面必須永遠清楚講明，任何內容都冇傳送出去、外部根本冇建立支援單、冇收集資料，亦冇人喺度閱讀。靜態網頁無法打開 operating-system application-data folder，所以網站永遠唔可以聲稱自己已經做咗呢件事。

## 設定

Template 宣告 `#support-dialog`、`#ticket-category`、`#ticket-description`、`#create-ticket`、`#ticket-search` 同 `#ticket-list`。Ticket record 需要 versioned local schema、stable local ID、bounded text、searchable status、bulk export，同埋經 destructive confirmation 先可以做嘅 bulk deletion。

## 失效情況

- Storage 拒絕寫入時，唔可以聲稱支援單已經建立。
- 無法打開瀏覽器 site-data setting 時，必須保留準確嘅手動操作指示。
- 清除網站 storage 亦會刪除本機支援單。
- 介面永遠唔會虛構真實公司、人物、回覆時間或者外部 delivery state，個服務台識演戲，但唔可以講大話。

## 保安同私隱

支援單文字會留喺 browser storage。佢唔會被傳送、同步、記錄落 log，亦唔會由真實使用者 profile 擷取。永久 disclosure 喺任何 language 同 funny-level setting 下都必須維持事實不變。

## 驗證

原始碼檢查確認本機編號、有界限 description、category choice、created、manual-reset-explained 同 locally-closed 狀態、search、persistence，同埋由 lock prompt、unlock prompt 同 settings 進入嘅路徑。Help navigation、ticket export、bulk management、storage-refusal handling、no-network proof、localization、accessibility 同 built-artifact evidence 仍然 pending。

## 建議文章

- [本機鎖同 authenticator](locks-and-authenticator.md)
- [瀏覽器儲存限制](../security/browser-storage-limitations.md)
- [破壞性操作確認](destructive-confirmation.md)
