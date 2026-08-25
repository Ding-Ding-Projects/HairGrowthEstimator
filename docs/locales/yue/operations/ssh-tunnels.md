# SSH 通道

## 行為

桌面主程序可以啟動隱藏嘅 `ssh.exe` 程序，將揀選嘅本機 loopback 連接埠轉送到私人主機上服務嘅 loopback 連接埠。程序使用批次模式、拒絕互動式密碼提示、檢查持久使用者 `known_hosts` 檔案、要求轉送設定成功，並向 renderer 發送有界限嘅連線狀態事件。

## 設定

SSH 設定包含主機、連接埠、使用者名稱、遠端 API 連接埠、本機轉送連接埠，同埋可選金鑰檔案路徑。預設 SSH 連接埠係 22、遠端 API 連接埠係 4782，而本機轉送連接埠係 14782。主機、使用者名稱同所有連接埠都會喺程序啟動之前驗證。

目前精確選項包括：

```text
BatchMode=yes
StrictHostKeyChecking=yes
UpdateHostKeys=no
UserKnownHostsFile=<user home>/.ssh/known_hosts
ExitOnForwardFailure=yes
ServerAliveInterval=30
ServerAliveCountMax=3
```

## 失敗情況

- 目前實作會拒絕 `known_hosts` 入面冇記錄嘅主機。
- 已記錄金鑰有變亦會被拒絕。
- 缺少 `ssh.exe` 會產生特定錯誤狀態。
- 目前就緒檢查只要程序喺 900 ms 後仍然運行，就當作已連接。佢冇獨立探測已轉送 HTTP 服務，仍然需要修正。
- 通道喺就緒後退出，狀態會變成已中斷連接。
- 金鑰檔案選擇器接受幾種副檔名，但唔會證明金鑰格式或檔案權限。

## 安全同私隱

唔接受密碼。主機金鑰驗證永遠唔會停用。API 喺轉送兩端都保持綁定 loopback。SSH 診斷會截取最後 2,000 個字元，再轉成單行使用者訊息，但往後嘅日誌記錄仍然必須避免包含金鑰材料同私人路徑。

## 驗證

原始碼檢查確認咗嚴格已知主機驗證、冇密碼提示、連接埠範圍、安全程序啟動同關閉清理。針對已知、未知同已變更主機金鑰嘅測試、獨立服務就緒狀態、程序清理，以及建置成品互動仍然待辦。

## 建議文章

- [私人 LAN 託管](private-lan.md)
- [本機服務操作](local-service.md)
- [私隱同資料邊界](../security/privacy-and-data-boundaries.md)
