# 本機服務操作

## 行為

服務係一個 Node.js HTTP 程序，可以用 `node server/index.js` 或套件指令稿 `npm run start:server` 啟動。佢公開 `/health`、`/version`，以及位於 `/api/profiles/{profileId}` 之下嘅個人檔案或剪髮路由。預設只會綁定 loopback。

## 設定

| 變數 | 預設值 | 用途 |
| --- | --- | --- |
| `HAIR_HOST` | `127.0.0.1` | 綁定位址 |
| `HAIR_PORT` | `4782` | 監聽連接埠 |
| `HAIR_DATA_FILE` | `data/hair-growth.json` | 持久 JSON 檔案 |
| `HAIR_API_KEY` | 空白 | API 金鑰，非 loopback 綁定時必須提供 |
| `HAIR_CORS_ORIGINS` | 空白 | 以逗號分隔嘅精確允許來源 |

連接埠必須係 1 至 65535 之間嘅整數。如果 API 金鑰少過 24 個字元，服務會拒絕以非 loopback 位址啟動，唔會扮作睇唔到個風險。

## 失敗情況

- 無效設定會令啟動停止，並顯示清楚錯誤。
- 超過 64 KiB 嘅請求內容會收到 HTTP 413。
- 無效 JSON 同無效領域值會收到 HTTP 400。
- 未知路由會收到 HTTP 404，不支援嘅方法會收到 HTTP 405。
- 服務請求逾時係 15 秒，標頭逾時係 10 秒。
- 損壞嘅持久 JSON 目前會直接造成伺服器失敗，唔會自動重設。

## 安全同私隱

Loopback 係安全預設值。回應會停用快取同 MIME 嗅探。CORS 只接受精確設定嘅來源。設定 API 金鑰後，系統會用恆定時間方式比較，而且所有個人檔案路由都要求 `x-api-key` 標頭。健康狀態同版本路由對綁定網絡仍然公開。

## 驗證

原始碼檢查確認咗路由、限制、標頭、驗證邊界同預設 loopback 綁定。已接受嘅加固測試套件加入原始碼層級配對審計，將網站容器命令連繫到伺服器 `/health` 同個人檔案路由邊界、`hair-growth-api` Compose 服務，以及容器進入點。佢嘅刻意破壞會改動伺服器健康狀態路由，仍要等成套測試同所有已整合原始碼範圍一齊檢查先算完成。呢項原始碼審計唔係服務執行階段證據。程序啟動、請求矩陣、重啟持久性、損壞資料庫復原，以及容器健康證據仍然待辦。

## 建議文章

- [HTTP API](../api/README.md)
- [私人 LAN 託管](private-lan.md)
- [Docker 部署](docker-deployment.md)
