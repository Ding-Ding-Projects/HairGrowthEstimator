# 鎖定同驗證器限制

## 運作方式

網站元素鎖定係刻意加入嘅方便屏障。佢會停用所選操作，並要求符合已選本機 credential policy，之後先重新啟用。佢唔會加密內容，亦唔會防住另一個已經可以存取同一個瀏覽器 profile 嘅人。

網站驗證器係本機 TOTP 工具。佢只可以靠已儲存嘅 reusable secret 同裝置時鐘產生 code。就算網站係靜態，呢啲 secret 仍然極度敏感，絕對唔係普通設定值。

## 設定

每個 lock 都有自己嘅 target identifier、policy、credential set、duration、attempt budget 同 recovery disclosure。TOTP entry 包括 issuer、account、algorithm、digits 同 period。一般匯出會略去 secret，亦會清楚講明。

## 失效情況

- 清除網站儲存會重設全部 lock 同 authenticator data。
- 裝置時鐘同服務時鐘相差太遠，會產生被拒絕嘅 code。
- 遺失 credential 時，必須使用已有文件交代嘅 storage-reset route。
- Lock 唔可以經 keyboard shortcut、command-palette navigation、stale handle 或 programmatic activation 繞過。
- 將 factor 儲存喺由佢自己解鎖嘅同一個介面，會令嗰個 lock 只剩裝飾用途，必須如實講明。

## 保安同私隱

瀏覽器儲存弱過作業系統 credential vault。Registration QR 同 manual secret 絕對唔可以傳送去第三方 QR service、network、disk、log、export、capture、telemetry 或 history。只有確認一個目前有效嘅 code 之後，pairing 先算完成。

## 驗證

原始碼檢查確認 `site/app.js` 有全部六種 policy choice、PIN 同 password 各自按 target 使用嘅 salt 同 hash、plaintext browser-local TOTP factor、manual 同 keypad PIN entry、bounded exponential retry wait、三種 unlock duration、locked element click interception、TOTP generation、searchable entry 同 general-export omission。QR registration、pairing confirmation、unlock ladder、standards-vector test、clock-skew detection、完整 shortcut 同 command-palette activation blocking、independent secret export 同 built-artifact evidence 仍然待辦。

## 建議文章

- [本機鎖定同驗證器](../site/locks-and-authenticator.md)
- [瀏覽器儲存限制](browser-storage-limitations.md)
- [私隱同資料邊界](privacy-and-data-boundaries.md)
