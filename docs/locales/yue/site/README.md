# 公開網站

公開網站係產品嘅文件、下載、狀態、設定同連結介面。佢唔係已安裝嘅桌面產品，亦唔會取代桌面執行環境。

## 網站文章

- [首頁同已驗證下載](home-and-download.md)
- [分頁導覽](tabbed-navigation.md)
- [設定同外觀](settings-and-appearance.md)
- [標誌自訂](logo-customization.md)
- [搜尋同 regex 工作台](search-and-regex-workbench.md)
- [指令面板](command-palette.md)
- [離線文件瀏覽器](documentation-browser.md)
- [變更記錄檢視器](changelog-viewer.md)
- [通知同本機歷史記錄](notifications-and-history.md)
- [語言、玩味程度、School 模式同啟動驚喜](language-and-school-mode.md)
- [排程同外部設定](scheduled-settings.md)
- [旁白同聲音選擇](narrator-and-voices.md)
- [專注輔助模式](attention-modes.md)
- [本機鎖定同驗證器](locks-and-authenticator.md)
- [支援工單](support-tickets.md)
- [破壞性操作確認](destructive-confirmation.md)
- [本機檔案轉換器](local-file-converter.md)
- [本機 Ollama 中介](ollama-mediation.md)
- [無障礙同響應式版面](accessibility-and-responsive-layout.md)
- [狀態同建置來源資料](status-and-provenance.md)

## 目前狀態

已檢查嘅原始碼包含 `site/index.template.html`、`site/styles.css`、`site/state-contract.js`、`site/security-contract.js`、`site/regex-client.js`、`site/regex-worker.js`、`site/app.js` 同 `scripts/compose-site.mjs`。目前已實作瀏覽器本機估算、以最新剪髮日期為基準嘅對齊處理並保留手動後備、拒絕未來日期、同源狀態修訂只增不減、拒絕過時寫入、厘米同英寸顯示、主要分頁、設定、本機工具、狀態顯示、歷史記錄、正面匯出允許清單同正規化表格匯出、嚴格匯入同已儲存狀態驗證、精確嘅上一版本 presentation migration、由 Worker 隔離嘅 regular expression、內容操作、鎖定、確認，以及其他有界限嘅訪客控制。聚焦原始碼測試涵蓋四項已修正嘅資料行為。完整聚焦加固測試套件喺還原後結果係 12 項通過、0 項失敗、0 項略過。已接受嘅對抗性 fixture 只證明各自點名嘅邊界，唔代表完整清單已獲證明，唔好俾綠燈呃到太開心。

已接受嘅加固批次加入嚴格個人詞彙、瀏覽器狀態同外觀驗證；正面匯出允許清單；內部文件連結路由；受管理巢狀分頁同內容選單鍵盤操作；不可變安裝程式 manifest 驗證；位元組層級 PNG 檢查；靜態 Content Security Policy；以及由 Worker 隔離嘅 regular-expression 評估。嚴格合約同有效消費端、靜態政策、內部文章路由函式、可聚焦文章目標、完整 Tools 同 Settings 分頁關係、明確設定控制名稱、篩選後分頁焦點修復、內容選單鍵盤處理同焦點返回、窄版面探索入口、Worker 支援工作台同搜尋路徑、有界限 fatal-UTF-8 安裝程式同頭髮 manifest 輸入、完整執行階段安裝程式再驗證、composer 端 terminal-transfer 驗證、精確 Ollama origin 對齊、School 敏感覆疊層關閉、已本地化個人詞彙狀態同操作錨點，以及 PNG 結構檢查，而家都已經喺原始碼出現。標準原始圖片同完整負面回歸證明仍然待辦。其他幾項通用深度要求仍然只係部分完成或未有實作，詳情已記錄喺完整性清單。公開文件將 `365.2425 / 12 = 30.436875 days` 定義為目前長度同預測目標計算共用嘅唯一月份長度合約，同時保留可調整、非醫療用途嘅每月 1.0 cm 預設值同個人差異說明。網站原始碼一致性透過共用計算器同確定性向量實作。250-entry、274-entry 同 686-entry Cantonese catalogs，加埋 50 個 article mirrors，已完成點名 source-localization inventory。建置後互動證據、畫面擷取、部署、安裝程式發佈、桌面同核心消費、整合跨介面證明，以及公開 URL 驗證仍然待辦。原始碼存在唔會當成建置成品驗證，見到檔案唔等於見到成品郁得。

L06 顯示合約同執行階段消費端已喺原始碼出現。主要 `tests/site/language-attention.test.mjs` 原始碼邊界結果係 5 passed，而精確刻意破壞狀態係 0-of-5 red。`tests/site/presentation-contract.test.mjs` 回報 12 passed，而 `tests/site/localization.test.mjs` 喺精確 catalog-entry deletion 同 article-locale omission checks 轉紅之後回報 5 passed。聚焦文章定義咗精確語言、玩味程度、School 模式、旁白、排程來源、啟動驚喜同專注輔助模式行為，亦記錄瀏覽器對跨產品 School 模式共享、自動螢幕閱讀器偵測、只限工作階段嘅 Home Assistant 認證資料，以及跨 origin 請求嘅限制。Composed localization interaction 同畫面擷取證據仍然待辦。

## 建議閱讀

- [網站通用功能清單](../inventory/site-universal-features.md)
- [Regex builder 擁有權清單](../inventory/regex-builders.md)
- [瀏覽器儲存限制](../security/browser-storage-limitations.md)
