# 本地鎖與驗證器

## 行為

網站每一個已呈現元素都必須提供本地便利鎖精靈同 anchored prompt。每個元素都有自己嘅 policy 同 credential set。支援嘅 policies 包括 PIN、password、PIN plus password、password plus TOTP、PIN plus TOTP，以及 password plus PIN plus TOTP。Locked element 會阻止原本 action，但仍然係可以操作嘅 unlock target。

網站驗證器係一個本地 TOTP 工具。目前原始碼接受標準 `otpauth://` input 同 manual base32，顯示 current code、seconds remaining 同 next-code preview，亦會管理可搜尋嘅 local entries。QR image、clipboard 同 camera routes 會顯示為 unavailable，因為目前未有 bundled verified local QR decoder。

## 設定

Lock duration 可以係只限目前 surface、使用者揀選嘅分鐘數，或者直至 browser page 關閉。PIN entry 同時提供 keypad 同 manual input，兩條路都使用同一個 validator。TOTP 支援 SHA-1、SHA-256 同 SHA-512、6 至 8 digits，以及 configurable periods。

## 失敗情況

- 清除 browser storage 會 reset website locks 同 authenticator entries。
- Browser-only storage 無法提供 operating-system credential-vault guarantees。
- Camera、clipboard 或 QR decoding 可能 unavailable，介面必須繼續顯示相關選項同確實原因。
- Wrong credential 永遠唔會刪除內容。
- Support Tickets 只係本地戲劇效果，必須講清楚無任何 request 被送出，亦無真人會閱讀。

## 安全與私隱

呢啲鎖唔係 encryption，亦唔係 access security。網站驗證器如果將 reusable secrets 存喺 browser storage，界線會弱過 operating-system credential vault。實作必須喺接收秘密資料之前披露呢一點，而 deliberate secret export 必須係另一個清楚命名嘅 destructive action。

## 驗證

原始碼檢查已確認全部六個 policies、per-target lock records、salted PIN and password hashes、browser-local TOTP factors、keypad and manual PIN input、bounded retry waits、selected unlock durations、click interception、TOTP code and next-code generation、search、deletion confirmation 同 ordinary-export omission。目前 keypad 欠缺自己嘅 Submit 同 Cancel controls，TOTP pairing 未有喺 registration 前確認，QR support 同 clock-skew detection 亦未有，而 unlock ladder 仍然缺席。Alternate shortcuts 同 command-palette activation 仍然需要直接證明。Standards vectors、security review 同 real interactions 都仲待完成。

## 建議文章

- [Support Tickets](support-tickets.md)
- [破壞性操作確認](destructive-confirmation.md)
- [鎖與驗證器限制](../security/locks-and-authenticator-limitations.md)
- [瀏覽器儲存限制](../security/browser-storage-limitations.md)
- [設定與外觀](settings-and-appearance.md)
