# Ollama 中介邊界

## 運作方式

公開 HTTPS 網站唔可以安全假設自己能夠直接存取訪客嘅本機 Ollama 服務。目前瀏覽器介面只會喺使用者明確要求時，對 loopback 發出 `/api/tags` probe，並如實回報 mixed-content 或 cross-origin refusal。完整套件需要一個明確安裝、只綁定 loopback，而且 protocol 經過有界限 allowlist 嘅中介。佢永遠唔可以經公開 host 代理 model traffic，否則本機就變咗唔本機，個名都會尷尬。

## 設定

目前瀏覽器 probe 只接受 `http://127.0.0.1:11434` 或者 `http://localhost:11434`，而且唔可以帶 credential、額外 path、query 或 fragment。佢會儲存 `url.origin`，saved-state validator 就容許同樣兩個 origin 加一個可選根目錄斜線。Template Content Security Policy 嘅 `connect-src` 亦使用同樣兩個 entry。未來中介必須識別自己嘅 version、allowed website origin、local runtime status、supported operation 同 payload limit。佢只接受已有文件記錄嘅本機 Ollama HTTP API operation 同 registered harness profile。Model catalog state 會記錄 completeness、pages、timestamp、source identity 同 staleness。

## 失效情況

- Mixed-content 同 cross-origin restriction 可能會阻擋公開 HTTPS page 直接向本機 HTTP 發出 request。
- 中介停止或者缺少時，網站相關功能會不可用，但仍然可以顯示本機文件。
- 過時 catalog 會繼續標示為 stale，絕對唔會扮成 current。
- Hardware-fit evidence 只要缺少任何必要 fact，就會產生 Unknown 或者更保守嘅結果。

## 保安同私隱

Prompt、response、attachment、本機 model state 同 private path 全部留喺訪客電腦。中介會拒絕 public bind address、arbitrary URL、redirect、arbitrary shell、unregistered executable、oversized payload，同埋將 secret 寫入 log 或 preview。

## 驗證

原始碼檢查確認瀏覽器只接受完全相同嘅 HTTP origin `http://127.0.0.1:11434` 同 `http://localhost:11434`，會儲存正規化 origin，只會呼叫 `/api/tags`，設有 5-second timeout，拒絕 malformed 或大過 1 MiB 嘅 JSON result，亦會將已儲存清單限制喺最多 2,000 個 tag。`validateOllama` 同靜態 Content Security Policy 使用相同 origin boundary。還原後嘅聚焦 hardening test 涵蓋呢個 source alignment。目前未有已安裝中介、exhaustive catalog、hardware evidence、pull queue、chat 或 harness。Mediator binding、未來中介入面更廣泛嘅 route allowlisting、catalog completeness、secret redaction、harness rollback 同 end-to-end local evidence 仍然待辦。

## 建議文章

- [本機 Ollama 中介](../site/ollama-mediation.md)
- [本機服務操作](../operations/local-service.md)
- [私隱同資料邊界](privacy-and-data-boundaries.md)
