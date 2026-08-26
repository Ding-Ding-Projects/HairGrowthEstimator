# 離線文件瀏覽器

## 行為

網站範本喺 `#panel-docs` 宣告文件面板、喺 `#docs-search` 宣告標題同正文搜尋、喺 `#docs-list` 宣告文章清單，並喺 `#docs-article` 宣告已顯示文章區域。建置組合預期會將已分類 Markdown 文章放入 `#bundled-docs`，令閱讀同搜尋毋須喺執行階段提出網絡請求。

文章連結必須喺網站內解析，並保留焦點同分頁內容。相對 Markdown 連結會由目前文章嘅來源路徑解析，只映射到已知內嵌文章，啟用文件目的地、選取已連結結果，並只喺讀者啟用連結之後先移動焦點。只有 fragment 嘅連結會留喺目前文章，但前提係目標標題存在。`resolveDocumentationPath` 同 `navigateDocumentationLink` 而家已經喺 `site/app.js` 實作分類相對路徑正規化、已知 bundle 選擇同標題捲動。範本為 `#docs-article` 提供 `tabindex="-1"`，而 `openDoc` 只會喺刻意 pointer、Enter、Space 或內部連結啟用時要求文章焦點。未知或者逃離路徑嘅完整不可用狀態，以及聚焦內部路由證明仍然待辦。由供應者撰寫嘅 Markdown 必須經過同一個共用、隔離 renderer，支援標題、清單、連結同 fenced code，同時移除可執行或者唔安全 markup。

結果清單係單選 listbox。每個文章結果都係帶有一個已選狀態嘅 option。搜尋同首次顯示可以更新清單同已選標記，但唔可以將焦點移入文章。Enter、Space、pointer 啟用或者內部連結路徑，先係會開啟文章嘅刻意操作。

## 設定

組合步驟需要一份手寫文章清單，並同 `docs/` 之下檔案做精確比較。Bundle 會記錄 article ID、標題、分類、來源路徑同經消毒嘅顯示內容。純文字搜尋係預設，旁邊完整 regex 工作台可以由使用者明確啟用。

## 失敗情況

- 磁碟上有文章但 bundle 遺漏咗，必須令完整性檢查失敗。
- 指向未知文章嘅連結必須顯示不可用狀態，唔可以開啟一條死路。
- 如果 Markdown 來源位於分類目錄，相對連結唔可以由網站根目錄解析。
- 顯示或者篩選結果唔可以將焦點移離搜尋欄，亦唔可以打斷讀者正在使用嘅文章。
- 無效 Markdown 或 sanitizer 拒絕時，必須保留文章標題並顯示有界限錯誤。
- 離線載入失敗唔可以暗中去網絡攞副本，離線就係離線，唔好偷偷出門。

## 安全同私隱

內嵌文章會當成資料，而唔係 script。Renderer 唔可以執行 HTML event handlers、scripts、內嵌遠端內容或者具權限產品操作。相對連結只會對已知內嵌文章解析。搜尋查詢同範例文字只會留喺本機。

## 驗證

原始碼檢查確認咗 bundle 解析、標題同正文篩選、文章選擇、escape-first Markdown renderer、標題、清單、fenced code、inline code、強調、允許清單連結格式、`resolveDocumentationPath`、`navigateDocumentationLink`、標題 anchors、分類相對內嵌文章路由、listbox 同 option roles、已選狀態、游走 option 焦點、`#docs-article[tabindex="-1"]`，以及 `site/app.js` 同範本內刻意 Enter、Space、pointer 或內部連結啟用。聚焦無障礙原始碼檢查喺文章目標缺少 `tabindex="-1"` 時曾經刻意變紅，還原後就通過，屬於三項檢查結果之一，總計 0 項失敗、0 項略過。未知或者被拒內部路徑目前會直接跌出，而唔會顯示必需嘅不可用狀態。精確文章數量比較、路徑穿越同不可用狀態檢查、聚焦內部路由測試、建置後互動同畫面擷取證據仍然待辦。驗證必須涵蓋每篇文章、分類相對同 fragment 連結、拒絕路徑穿越、純文字同 regex 搜尋、不安全 markup、鍵盤導覽、螢幕閱讀器標籤、焦點穩定性同離線重新載入。

## 建議文章

- [搜尋同 regex 工作台](search-and-regex-workbench.md)
- [狀態同建置來源資料](status-and-provenance.md)
- [網站通用功能清單](../inventory/site-universal-features.md)
