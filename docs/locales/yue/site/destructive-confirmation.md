# 破壞性操作確認

## 行為

有重大後果嘅刪除、清除、覆寫、秘密匯出同不可逆批次操作，會使用同一個網站內確認介面。對話框會點名精確操作同受影響資料，要求兩個獨立操作嘅 key 控制，並只喺兩個 key 都啟用之後先開放全範圍 slider。只有 slider 到達完成位置之後，破壞性操作先會執行。

Emergency exit、Escape 同取消由頭到尾都可用。取消或者完成之後，焦點會返去原本控制。減少動態效果會保留真確狀態變更同進度，但唔會播放非必要動畫。

## 設定

範本宣告 `#super-confirm-dialog`、`#confirm-action-name`、`#confirm-impact`、`#confirm-key-a`、`#confirm-key-b`、`#confirm-slider`、`#confirm-progress`、`#complete-confirm` 同 emergency-exit 操作。執行階段呼叫端必須傳入有界限 action ID、受影響項目預覽、execute callback 同焦點返回目標。

## 失敗情況

- 只有一個 key、未完成 slider、合成啟用、過時 callbacks 或隱藏快捷鍵，都唔可以執行操作。
- 選擇一有改變，就會令待處理確認失效，並要求新預覽。
- 執行失敗會報告精確部分結果，並保留可以復原嘅資料。
- 操作執行期間會拒絕再次進入，唔會俾同一件事重複衝入嚟。

## 安全同私隱

對話框絕對唔會顯示或者記錄認證資料值。確認只證明使用者有刻意互動，唔係身份證明。介面唔可以將佢描述成 authentication，亦唔可以聲稱可以防止另一個有瀏覽器存取權嘅人。

## 驗證

原始碼檢查確認咗兩個獨立 keys、準備好之前停用嘅 slider、精確 100 percent 要求、進度元素、延遲完成狀態、減少動態效果縮短、emergency-exit 按鈕，以及剪髮、通知、排程、外觀、驗證器同網站資料刪除呼叫端。目前實作會喺記憶體儲存 callback，但底層選擇改變時唔會令佢失效，而且一般破壞性呼叫端未有明確焦點返回。聚焦鍵盤、觸控、輔助技術、Escape、本地化、部分結果復原同建置成品證據仍然待辦。

## 建議文章

- [本機鎖定同驗證器](locks-and-authenticator.md)
- [通知同本機歷史記錄](notifications-and-history.md)
- [本機檔案轉換器](local-file-converter.md)
