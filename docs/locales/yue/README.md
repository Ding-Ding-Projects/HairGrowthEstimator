# Hair Growth Estimator 文件

呢套文件講解桌面產品、可選用嘅 HTTP 服務，同埋公開文件及下載網站。內容會將已實作嘅行為，同仍然等緊程式碼或者驗證嘅要求分開寫清楚，唔會用「就快得」扮「已經得」。

## 文件地圖

- [產品功能](features/README.md)
- [公開網站](site/README.md)
- [HTTP API](api/README.md)
- [操作](operations/README.md)
- [保安同私隱](security/README.md)
- [完整性清單](inventory/README.md)

## 證據用語

以下用語會喺全部文章入面保持一致，免得同一盞綠燈到處變色：

- **已實作**代表喺已檢查嘅 revision 入面，相關原始碼邊界確實存在。
- **已喺本機驗證**代表指定嘅本機檢查，已經針對所述 revision 成功完成。
- **已驗證建置成品**代表已直接操作封裝後嘅桌面產品或者組合後嘅網站。
- **待辦**代表要求仲未有獲接受嘅證據。淨係有計劃中嘅 selector、測試 identifier、互動路徑或者畫面擷取檔名，本身唔算證據。

今次加固文件更新以 revision `321f81a078012f6e10a56ca2ca47245471fa548c` 為起點。清單所記錄嘅嚴格 security-contract、可棄置 Worker、實際 consumer、無障礙、policy、installer 同 PNG-inspection 原始碼 identifier 都已經存在。Manifest reader 有明確界限並使用 fatal UTF-8，瀏覽器執行階段會再次執行精確嘅 provenance 同 installer 檢查，School-sensitive overlay 會關閉，重新建置嘅分頁會恢復焦點，JSONL 會讀取正面 allowlist，Worker 拒絕後會釋放 queue 容量，Ollama origin 已喺執行階段、policy 同已儲存狀態之間對齊，精確嘅上一版本 presentation migration 會先過 current validation，而 `#docs-article` 亦係刻意設定嘅焦點目標。聚焦加固測試套件喺還原後錄得 12 項通過、0 項失敗、0 項略過。三個 Cantonese catalogs 精確包含 250、274 同 686 個 source entries，而全部 50 篇 English articles 都各有一份 validated Cantonese mirror。標準圖片資產、組合後互動、installer 發佈、畫面擷取，同更廣泛嘅完整性證據仍然待辦。文件無法喺同一個 commit 入面如實引用自己未來嘅 commit。等相關成品存在之後，build provenance 同不可變 release record 先會釘實最終 revision。

估算文章用一個平均 Gregorian month，即 `365.2425 / 12 = 30.436875 days`，同時計算已過時間所對應嘅目前長度，以及到達目標前嘅剩餘預測。每月 1.0 cm 嘅預設值仍然只係可調整、非醫療用途嘅規劃估算，而且個人差異可以好明顯，現有嘅 [Hair Growth Disorders, StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK499948/) 引用亦繼續支援呢個說明。網站原始碼一致性已實作。桌面同核心 consumption、整合跨介面證據，以及建置成品互動仍然待辦。

L06 聚焦顯示文章定義咗三種語言模式、五級事實文案一致性、共用而且可由使用者改名嘅 School mode 行為、瀏覽器旁白同聲音處理、排程本機及外部設定、精確 10 percent 啟動驚喜，同五個獨立專注輔助模式。文章清楚分開必要行為同已接受證據，亦記錄咗瀏覽器對跨產品儲存、自動 assistive-technology 偵測、可重用外部 credential，同 cross-origin request 嘅限制。原始碼整合已存在。主要原始碼邊界測試喺刻意移除原始碼嘅狀態下錄得 0 項通過、5 項失敗，還原後就錄得 5 項通過。Pure-contract run 錄得 12 passed、0 failed、0 skipped。Localization run 錄得 5 passed、0 failed、0 skipped，當中包括刻意 catalog-entry deletion 同 article-locale omission。組合後互動同畫面擷取證據仍然待辦。

負面回歸聲明刻意收窄。較早嘅證據涵蓋刻意移除 front provenance identifier、一項 current-strip regex-builder registration、core state-contract module、article focus target，同有界限嘅 installer 及 runtime publication check。最新刻意加固 fixture 精確移除或者削弱咗六個邊界：啟用中 School-sensitive regex 同相關 overlay closure、重新建置分頁嘅 `focusTarget` restoration、JSONL 使用 `record.state.haircuts`、Worker construction 同 `postMessage` queue recovery、`MAX_HAIR_MANIFEST_BYTES` 加 fatal UTF-8 decoding，以及執行階段、persistence、policy 同 saved-state validation 之間嘅精確 Ollama origin alignment。嗰個狀態共有 11 項測試，其中 5 項通過、6 項失敗。還原六個邊界之後，結果係 11 項通過、0 項失敗、0 項略過。個別 personal-vocabulary size-order、localized status-and-action，同 owned-copy exemption 證明，全部都先錄得紅燈 1，還原後再錄得通過 1。外部 vocabulary scanner 嘅 exact-count fixture 將 `PRIVATE_VOCABULARY_EXPECTED_COUNT` 設為 0 時錄得紅燈 1，回復預期數量 100 後就錄得通過 1。呢啲結果唔代表每一行完整性清單、本地化邊界、建置成品互動或者畫面擷取記錄都已經有由紅轉綠嘅覆蓋，綠燈有幾多就只講幾多。

## 產品邊界

網站只係文件、下載、狀態、設定同連結介面。佢唔係已安裝嘅桌面產品，亦唔會取代桌面產品。除非文章清楚寫明有受支援嘅本機連線，否則網站控制只會影響網站同訪客自己擁有嘅瀏覽器狀態。
