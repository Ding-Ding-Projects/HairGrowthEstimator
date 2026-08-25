# HTTP API

HTTP API 會喺呼叫者揀選嘅 profile identifier 之下，儲存一個 profile 同佢嘅剪髮歷史。

## 端點

| 方法 | 路徑 | 用途 | 驗證 |
| --- | --- | --- | --- |
| `GET` | `/health` | 執行階段狀態、版本同綁定模式 | 無 |
| `GET` | `/version` | 服務名稱同版本 | 無 |
| `GET` | `/api/profiles/{profileId}` | 讀取 profile 記錄 | 已設定時使用 API key |
| `PUT` | `/api/profiles/{profileId}` | 建立或者取代 profile 資料值 | 已設定時使用 API key |
| `POST` | `/api/profiles/{profileId}/haircuts` | 按 identifier 建立或者取代一次剪髮記錄 | 已設定時使用 API key |
| `DELETE` | `/api/profiles/{profileId}/haircuts/{haircutId}` | 刪除一項剪髮記錄 | 已設定時使用 API key |

## 設定

環境變數同啟動指令請睇 [本機服務操作](../operations/local-service.md)。服務接受最多 64 KiB 嘅 JSON body，並回傳帶有 `cache-control: no-store` 同 `x-content-type-options: nosniff` 嘅 JSON。

## 失效情況

API 會用 HTTP 400 表示資料無效，401 表示 API key 無效，403 表示瀏覽器 origin 唔獲准許，404 表示 route 或者 record 不存在，405 表示 method 不受支援，413 表示 request body 過大，而 500 就表示服務遇到預料之外嘅失效。狀態碼各有本職，唔會一有事就全部推俾最後嗰位收爛攤子。

## 保安同私隱

預設應使用 loopback。Non-loopback mode 必須使用 API key。API key 透過 `x-api-key` 傳送，絕對唔可以出現喺 URL、原始碼、collection example、log 或者公開記錄。CORS 只會套用到已設定嘅精確 origin，並唔係 client authentication。

## 驗證

原始碼檢查已確認 route 同 validation boundary。聚焦 request test 同實際 Postman collection 執行仍然待辦。

## Postman 集合

- [Hair Growth API 集合](../../../api/hair-growth-api.postman_collection.json)
- [總 API 集合](../../../api/master.postman_collection.json)

## 建議文章

- [剪髮歷史同重設行為](../features/haircut-history.md)
- [本機服務操作](../operations/local-service.md)
- [私人 LAN 託管](../operations/private-lan.md)
