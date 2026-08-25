# Status Hub 邊界

## 運作方式

產品同公開網站都需要自己嘅狀態介面。共用 Status Hub 可以接收 project 同 release state，但唔會取代產品嘅本機狀態控制，亦唔會取代網站嘅公開事實狀態頁面。

## 設定

Status record 可以包括 public repository URL、default branch、release channel、source commit、build and packaging result、deployment URL 同 evidence link。每個 status value 都必須標明來源同最後更新時間。未執行嘅 check 仍然係 unrun，唔會因為心情好就自動變綠。

## 失效情況

- 共用 hub 無法連線或者 enrollment 唔可用時，本機介面會如實回報嗰個限制，唔會聲稱已同步。
- Hard-coded status chip 唔係 evidence。
- 如果冇真正 authenticated endpoint 接收，而且 receiving inbox 未獲確認，question 或 action control 就唔可以扮成能夠傳送。
- Private operational hub 唔可以將 private host 或 credential information 洩露落公開網站。

## 保安同私隱

公開狀態介面只會包含公開 release fact。Enrollment credential 同 private infrastructure 必須留喺 source、browser bundle、log、capture 同 public record 之外。公開網站永遠唔會收到 agent 或 bridge credential。

## 驗證

網站 template 同 runtime 包含本機 status panel、embedded-provenance validation，同共用服務明確 unavailable 嘅 card。佢哋唔會 register project、synchronize status 或 deliver reply。Shared integration、evidence link、authenticated delivery check 同 built-artifact proof 仍然待辦。

## 建議文章

- [狀態同建置來源資料](../site/status-and-provenance.md)
- [版本同建置來源資料](../operations/version-provenance.md)
- [私隱同資料邊界](privacy-and-data-boundaries.md)
