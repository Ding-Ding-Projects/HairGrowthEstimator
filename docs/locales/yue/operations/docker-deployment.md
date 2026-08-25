# Docker 部署

## 行為

隨附嘅 Dockerfile 只會用 `node:22-alpine` 封裝服務。佢以非特權 `node` 使用者身份執行，將持久資料放喺 `/data`，並公開連接埠 4782。Compose 服務再加上具名儲存卷、唯讀根檔案系統、臨時 `/tmp`、移除 Linux capabilities，以及 `no-new-privileges`。

## 設定

Compose 預設透過 `HAIR_PUBLISH_ADDRESS=127.0.0.1` 同 `HAIR_PUBLISH_PORT=4782` 發佈到主機 loopback。環境變數會傳入服務綁定位址、API 金鑰、允許來源同資料檔案路徑。

## 失敗情況

- Dockerfile 設定咗 `HAIR_HOST=127.0.0.1`。喺容器入面，除非部署時覆寫，否則經容器介面入嚟嘅流量會到唔到服務。Compose 目前亦會沿用呢個預設值，除非提供 `HAIR_HOST`。呢個部署缺陷仍未解決。
- 尚未宣告容器健康檢查。
- 除非固定摘要值，否則 `node:22-alpine` 係可變標籤，今日同聽日拉到嘅內容未必係同一位乘客。
- 唯讀模式要求所有寫入都留喺已掛載資料路徑或者臨時檔案系統之內。

## 安全同私隱

容器唔會以 root 權限執行，亦冇 Linux capabilities。API 金鑰應該放喺部署嘅秘密儲存區或者受保護嘅執行環境，唔可以放入原始碼、Compose 預設值、日誌或者命令參數。避免喺公共介面公開連接埠。

## 驗證

原始碼檢查確認咗 Compose 嘅最小權限設定。已接受嘅加固測試套件加入原始碼層級配對審計，將文件記載嘅 `docker compose up --build -d` 命令連繫到 `hair-growth-api` Compose 服務、伺服器健康狀態同個人檔案路由，以及 `CMD ["node", "server/index.js"]`。計劃中嘅刻意破壞只會改動伺服器健康狀態路由配對。呢項工作唔會修正容器綁定缺陷，亦唔係映像或執行階段證據。映像建置、loopback 同私人 LAN 可達性、持久重啟、唯讀操作、健康檢查、摘要值固定，以及已部署服務行為仍然待辦。

## 建議文章

- [本機服務操作](local-service.md)
- [私人 LAN 託管](private-lan.md)
- [Status Hub 邊界](../security/status-hub-boundaries.md)
