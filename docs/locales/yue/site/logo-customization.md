# Logo 自訂

## 行為

外觀設定宣告三個 shipped logo presets 同一個 local custom-image picker。有效 custom image 只會改變網站 mark，唔會改動 package identity、installer identity、update feed、data keys、service identity 或 diagnostics。

完整 editor 需要 crop controls、contain and fill modes、focal point、safe-area preview、transparent 或 selected background、continuous color selection，以及每一個已呈現 logo size 嘅 preview。Previous valid logo 會一直保持 active，直至 replacement 完整通過驗證，唔會一半轉緊就突然換樣。

## 設定

Template 宣告 `#logo-preset`、`#custom-logo`、`#logo-fit`、`#logo-background`、`#brand-mark` 同 `#reset-logo`。Isolated decoder 必須驗證 actual bytes，並限制 encoded bytes、decoded pixels、dimensions、frames、CPU time、memory 同 output count。Derived variants 只會為網站真正使用嘅 formats 同 sizes 產生。

## 失敗情況

- Extension 或 MIME mismatch、malformed input、animation、excessive pixels、decompression risk 或 unsupported format，會令成個變更被拒絕。
- Conversion failed 會保留上一個 valid mark 繼續顯示。
- Color-profile flattening、crop、transparency loss 或 rasterization，必須喺啟用之前披露。
- Corrupt cache 會退回 shipped preset，並報告復原情況。

## 安全與私隱

Custom bytes 只會留喺本地，唔會進入 network requests、analytics、telemetry、logs、exports、history snapshots、prompts、captures 或 public records。Reset 會清除 source 同每一個 derived cache entry。

## 驗證

原始碼檢查已確認三個 local preset references、PNG、JPEG 同 WebP selection、1 MiB source limit、browser decode、4,194,304-pixel bound、data-URL persistence、fit and background controls、live use、export and history omission，以及 reset。目前實作喺 decode 前信任 browser MIME value，亦未有約束 animation frames、decoder CPU、color profiles、generated variants、crop、focal point 或 safe areas。Focused cache validation、no-network proof、keyboard and screen-reader behavior、localization 同 real rendered-size captures 都仲待完成。

## 建議文章

- [設定與外觀](settings-and-appearance.md)
- [私隱與資料界線](../security/privacy-and-data-boundaries.md)
- [本地檔案轉換器限制](../security/file-converter-boundaries.md)
