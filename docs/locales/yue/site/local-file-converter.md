# 本地檔案轉換器

## 行為

網站必須提供本地檔案轉換介面，分類包括文件與 PDF、圖片、音訊、影片、封存檔、結構化資料與試算表、程式碼與文字，以及二進位編碼。每個分類都有自己嘅搜尋欄，同旁邊嘅 regex builder。未有 bundled browser adapter 嘅格式仍然要顯示，但會停用，並且清楚寫出確實原因，唔會玩失蹤。

目前原始碼啟用六個 single-file text adapters：格式化 JSON、CSV 轉 TSV、TSV 轉 CSV、文字轉 Base64、Base64 轉 UTF-8 文字，同 Markdown 轉 escaped HTML。來源上限係 1 MiB，而五個唔支援嘅媒體同文件分類仍然會清楚顯示為停用。

## 設定

Source type 由有界限嘅 bytes 偵測，唔係只睇 extension。Enabled adapters 會宣告 source signatures、target format、lossiness、metadata and encoding behavior、resource bounds、local execution boundary 同 output validation。Queue 使用 bounded chunks，而且唔可以一次過將所有 selected paths 或 bytes 放入 memory。

## 失敗情況

- 唔支援、malformed、encrypted 或 oversized input 會原封不動。
- Lossy output 必須喺轉換之前提供具體 disclosure。
- 只有通過 signature 或 parse validation 嘅 output 先可以提供下載。
- Browser APIs 無法為每個已知格式提供完整 offline adapter set，所以 unavailable formats 必須保持 disabled，唔可以暗中交畀 server。
- PDF operations 會繼續 disabled，直至有 bundled offline adapter 證明可用。

## 安全與私隱

檔案全程留喺本地。任何轉換都唔可以 upload contents、呼叫 network service，或者依賴 developer-machine executable。Temporary browser data 必須有界限，並喺完成或取消之後清除。

## 驗證

原始碼檢查已確認 `site/index.template.html` 同 `site/app.js` 入面有可見 category catalog、adapter selection、single-file read、progress control、preview、cancellation 同 browser download。仍待完成嘅項目包括 byte-signature detection、complete adapter registry、per-category searches、isolated execution、unlimited resumable queue behavior、PDF tools、full output validation、focused tests、offline evidence、accessibility evidence 同 real interactions。

## 建議文章

- [本地檔案轉換器限制](../security/file-converter-boundaries.md)
- [搜尋與 regex 工作台](search-and-regex-workbench.md)
- [私隱與資料界線](../security/privacy-and-data-boundaries.md)
