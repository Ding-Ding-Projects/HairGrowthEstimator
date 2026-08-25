# 本機 Ollama 中介

## 運作方式

網站而家嘅 Ollama 介面，係一個由瀏覽器中介嘅本機整合。佢只會喺使用者明確要求時，向 loopback 發出 `/api/tags` 請求，絕對唔可以呼叫雲端模型服務、作大話話有啲模型已安裝，或者聲稱 Ollama 可以啟動任意程式。

目前介面只涵蓋有界限嘅連線結果同已安裝 tag 清單。完整 catalog 重新整理、執行中狀態詳情、批次 pull、本機 chat、硬件適配度，同埋 allowlist harness profile，仍然要清楚顯示為未提供或者尚未加入，唔可以收埋扮冇事。每個未提供狀態都要靠本機說明同已儲存狀態保持有用。

## 設定

瀏覽器只接受完全相同嘅 origin `http://127.0.0.1:11434` 同 `http://localhost:11434`。`connectOllama` 會拒絕 HTTPS、IPv6 寫法、其他 port、credential、`/` 以外嘅 path、query 同 fragment，之後只儲存已正規化嘅 `url.origin`。靜態 Content Security Policy 亦只喺 `connect-src` 列出同樣兩個 origin。`validateOllama` 會將已儲存嘅瀏覽器狀態限制喺同樣 origin，只容許可選嘅根目錄斜線，並限制模型清單同檢查時間戳。明確請求有 5 秒 timeout、會驗證唔超過 1 MiB 嘅 JSON response，亦最多只儲存 2,000 個回報嘅模型 tag。完整中介仲要識別自己嘅確實版本、為每條受支援 route 設定 allowlist，並負責所有 privileged operation。模型選擇、tag、variant、quantization、context 同 parameter 都必須來自已驗證資料。硬件適配標籤亦要展示證據同不確定性，唔可以靠估。

## 失效情況

- 靜態 HTTPS 網站受 mixed-content 同 cross-origin 邊界限制，無法可靠呼叫任意本機 HTTP 服務。
- 任何唔係兩個已記錄 loopback origin 嘅 origin，都會喺發出請求或者改動狀態之前被拒絕。
- 冇經批准嘅中介時，介面必須顯示未提供狀態，唔可以模擬資料扮有料到。
- Catalog、pull 同 chat timeout 必須保持有界限，並保留最後一次已驗證嘅本機狀態。
- Harness 啟動只接受已註冊 executable profile，永遠唔接受 raw shell text。

## 保安同私隱

Prompt、chat history、attachment、模型狀態同本機 path 全部留喺本機。瀏覽器永遠唔會收到中介 credential。Harness environment value 必須經 allowlist，secret 亦要喺 preview 同 log 入面遮走。

## 驗證

原始碼檢查確認 `connectOllama` 只包含兩個完全相同嘅 HTTP loopback origin、已正規化 origin persistence、相符嘅 Content Security Policy `connect-src`、經 `validateOllama` 執行嘅 saved-state enforcement、有界限嘅 `/api/tags` request、status copy、tag list、本機狀態，同誠實交代瀏覽器限制嘅文字。針對性 hardening test 涵蓋 runtime origin set、policy 同 saved-state validator 之間嘅一致性。中介目前仍然未有。Health depth、catalog completeness、offline cache behavior、batch pull、chat streaming、harness preview、rollback、secret exclusion 同 built-site evidence 仍然有待完成。

## 建議文章

- [Ollama 中介邊界](../security/ollama-local-mediation.md)
- [本機服務操作](../operations/local-service.md)
- [私隱同資料邊界](../security/privacy-and-data-boundaries.md)
