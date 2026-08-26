# 變更記錄檢視器

## 行為

變更記錄面板會宣告日期輸入、文字搜尋、篩選後匯出同文章清單。項目必須涵蓋每個已發佈版本，並包含版本、發佈日期、分類事實，以及完成變更嘅完整 commit SHA。畫面顯示嘅短 SHA 會連去嗰個精確 commit。

日期同文字篩選會一齊運作。輸入本機日期同 ISO 日期時，即使內容未完整或者無效，文字仍然會保留，等使用者可以修正。匯出會反映畫面可見嘅篩選範圍，亦會保留 commit SHA。

## 設定

建置組合預期會將有版本嘅變更記錄 array 嵌入 `#bundled-changelog`。日期選擇器需要月份同年份導覽、範圍選擇、具名預設，以及地區格式輸入。搜尋預設保持純文字，直至使用者透過旁邊工作台明確啟用 regex。

## 失敗情況

- 未知 commit 會清楚顯示為不可用，絕對唔會攞附近另一個 commit 嚟估。
- 無效日期會報告問題，但唔會清除已輸入文字。
- 如果某個版本冇已記錄變更，介面會明確講明。
- 遺失或者格式錯誤嘅內嵌 catalog 會顯示誠實空白狀態，唔會用空畫面扮神秘。

## 安全同私隱

變更記錄內容來自原始碼庫記錄，並透過共用安全 markup renderer 顯示。內容唔可以包含秘密或者訪客本機歷史。外部 commit 連結使用專案公開 forge URL，而且唔會帶有訪客 identifier。

## 驗證

原始碼檢查確認咗內嵌 array 解析、日期範圍同文字篩選、建立連結前精確 40-character commit 驗證、commit 不可用文案、空白結果同 Markdown 匯出。目前匯出會寫入整個內嵌 catalog，而唔係有效篩選檢視，日期控制亦只係原生輸入，未有必需嘅進階日曆行為。英文同廣東話 source copy 已經透過 validated changelog mirror 存在。Runtime composition、commit existence validation、focused interaction、keyboard flow 同 built-artifact evidence 仍然待辦。

## 建議文章

- [離線文件瀏覽器](documentation-browser.md)
- [通知同本機歷史記錄](notifications-and-history.md)
- [狀態同建置來源資料](status-and-provenance.md)
