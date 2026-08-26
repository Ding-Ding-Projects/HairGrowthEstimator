# 本機檔案轉換器限制

## 運作方式

網站檔案轉換器只可以喺已綑綁並證明有一個經驗證嘅離線瀏覽器 adapter 時，先啟用相關格式。已知唔支援嘅格式仍然會顯示，但會停用。轉換器必須由有界限嘅 bytes 偵測來源類型，亦要先驗證每份輸出，先可以交俾使用者。

目前瀏覽器原始碼提供六個有界限嘅文字 adapter：formatted JSON、CSV to TSV、TSV to CSV、text to Base64、Base64 to UTF-8 text，同 Markdown to escaped HTML。Documents and PDF、Images、Audio、Video 同 Archives 會顯示但停用。呢個只係有限度嘅瀏覽器工具，唔係完整通用轉換器，唔好見到六款就當成六十款。

## 設定

每個 adapter 都會宣告 byte、pixel、page、frame、item、recursion、time、memory 同 temporary-storage bounds。Queue 使用 bounded concurrency、persistent per-file state、pause、resume、cancel 同 constant-memory backpressure。只要瀏覽器有提供相關資料，系統就會喺開始之前檢查 destination capacity。

## 失效情況

- 瀏覽器 sandbox 無法綑綁或者安全公開每一種 native media 同 document converter。
- PDF inspection 同 editing 會保持停用，直至有完整離線 adapter 經過 packaging 同驗證。
- Encrypted input 需要使用者自己提供存取資料，而且唔可以洩露嗰份輸入。
- Lossy conversion 可能會略去 metadata、color profile、transparency、animation、precision、font 或 encoding，必須事先準確披露會損失乜嘢。

## 保安同私隱

轉換器永遠唔會上載檔案、呼叫遠端 conversion service、經 `PATH` 發現 executable，或者執行任意 shell input。來源檔案會保持不變。失敗或者取消之後，temporary output 會被清除。

## 驗證

原始碼檢查確認 `site/app.js` 有每檔案 1 MiB 限制、本機 `File` read、progress value、下載前 cancellation、preview、object-URL download，同埋六個 adapter。目前程式碼會將所選檔案完整讀入 memory，檔案選擇器亦會接受瀏覽器回報嘅 MIME type。佢未有提供 signature detection、isolated worker、unlimited paged queue、crash recovery、storage-capacity preflight、完整 output-type validation 或 PDF tool。聚焦 test、offline proof、accessibility 同 built-artifact evidence 仍然待辦。

## 建議文章

- [本機檔案轉換器](../site/local-file-converter.md)
- [私隱同資料邊界](privacy-and-data-boundaries.md)
- [搜尋同 regex 工作台](../site/search-and-regex-workbench.md)
