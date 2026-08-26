# 排程設定

## 行為

每條規則會保存穩定識別碼、標籤、開關狀態、優先次序、可選包含在內日期範圍、開始同結束時間、日期模式、星期、IANA 時區同一個來源。開始同結束時間相同會涵蓋完整本機日期。跨午夜時段歸入開始嗰個本機日期，結束邊界唔包括在內。

相符規則由低至高優先次序套用。優先次序相同時，文件內較後規則勝出。規則完結或者失敗之後，未改動基本設定會再次生效。編輯器同來源回應使用同一套有界限結構。

## 設定

規則使用結構版本 1，包括有界限識別碼、標籤、開關狀態、優先次序、可選日期、本機時間、星期選擇、IANA 時區、一個設定物件同一個來源描述。外部重新整理間隔、回應上限、請求期限同批准紀錄都會喺使用前限制並驗證。

## 來源

- 本機來源直接帶住已驗證設定。
- API 來源要求 HTTPS，只有精確迴環 HTTP 例外，並回傳 `{"schemaVersion":1,"settings":{...}}`。
- Home Assistant 來源使用已驗證 `binary_sensor` 或者 `input_boolean`。`on` 會啟動規則本機設定，`off` 就保留基本設定或者另一條相符規則。

外部請求會拒絕重新導向、網址內嵌憑證、不支援通訊協定、未知設定、格式錯誤 JSON、超過設定上限嘅回應同超過期限請求。Home Assistant 存取值會用精確標準來源範圍保存喺作業系統保護儲存，永遠唔會放入排程文件或者畫面狀態。

每條外部規則嘅有界限重新整理間隔會參與即時重新整理計時器。世代檢查會阻止較舊回應覆寫較新評估。被拒絕重新整理會保留上一個有效範圍結果或者基本設定。

## 網絡目的地政策

`app/core/network-policy.js` 定義純政策，特權請求邊界要喺解析排程來源之後、開啟連線之前套用。解析會使用作業系統解析器，要求以原始次序回傳所有答案。政策會驗證完整答案集合，再產生不可變 lookup 同連線計劃。呼叫者一定要經固定 lookup 連線，唔可以再次解析主機名，避免第二次 DNS 答案喺驗證同連線之間偷偷改目的地。

公開 HTTPS 係預設範圍。每個解析地址都要全域可達。任何一個答案係迴環、RFC 1918 私人用途、IPv6 unique-local、link-local、已知 metadata 服務地址、未指定、多播、保留、文件、benchmarking、IPv4-mapped IPv6、格式錯誤、重複或者地址系列唔相符，完整解析都會被拒絕。非標準數字主機形式，例如單一整數、十六進制 IPv4、八進制組件或者縮短 IPv4，會喺網址正規化重新解讀之前被拒絕。

公開預設以外只支援兩種窄批准：

- 迴環批准會綁定一個精確標準排程來源範圍、一個精確 origin 同一個精確迴環地址集合，亦只有呢種批准可以容許 HTTP。
- 私人 LAN 批准綁定同樣三個邊界，只容許 RFC 1918 IPv4 或者 IPv6 unique-local 地址經 HTTPS。

只有當已保存精確迴環來源嘅每個解析答案都確認為迴環，先可以產生迴環批准。私人 LAN 批准同排程文件及畫面狀態分開。用戶為私人目的地保存 Home Assistant 存取值時，主程序會顯示本機決定對話框，列出精確 origin 同完整地址集合。批准會以原子方式保存喺私人程式資料目錄嘅 `scheduled-network-approvals.json`。檔案使用結構版本 1，最多 64 份紀錄，每份最多 16 個地址，每次讀取都會完整重新驗證。檔案只保存批准資料，永遠唔保存 Home Assistant 存取值。

之後解析答案一定要同已批准地址集合完全相同。新增、移除或者改變地址會停止連線並要求另一個本機決定。拒絕決定唔會保存批准或者存取值。替換批准會先移除舊精確綁定，所以替換失敗會令來源變成未批准，唔會偷偷保留用戶啱啱想替換嘅地址權限。

批准唔可以靠複製可見欄位重建、重用喺相鄰路徑或者來源、畀另一個 DNS 答案擴闊，亦唔可以用喺 link-local、metadata、多播、mapped、未指定或者保留地址。特權邊界只會喺用戶刻意揀選有界限本機目的地之後建立批准。

每個 HTTPS 計劃都會保持憑證驗證，對原本標準主機名驗證憑證，並用嗰個 DNS 主機名做 Server Name Indication。IP literal 網址會固定到精確 literal，並以 IP 身分驗證。每個計劃用 `redirect: "error"` 同零次重新導向上限拒絕重新導向。

對 Home Assistant，計劃會由正規化 base URL 同 entity identifier 產生請求網址。憑證綁定只包含保護儲存參照、精確標準來源範圍、精確請求 origin 同精確請求網址。政策輸入唔接受憑證值，計劃或者錯誤亦唔會回傳憑證值。

## 失敗情況

解析結果空白或者超過 16 個答案、任何地址唔安全、批准欠缺或者唔相符、IP literal 解析去另一個地址、網址唔標準、TLS 要求被削弱，或者固定 lookup 被要求解析另一個主機名，政策都會 fail closed。被拒絕請求會保留上一個有效排程結果或者未改動基本設定。政策錯誤使用穩定代碼同固定訊息，唔會重複網址憑證或者存取值。

純模組本身唔會解析 DNS 或者開 socket。特權請求邊界負責呢啲效果，把解析器完整 `{ address, family }` 結果傳入 `createScheduledSourceNetworkPlan()`，用 `createPinnedLookup()` 連線，對計劃驗證已連接 socket 地址，保留原本主機名做憑證驗證，並拒絕所有重新導向回應。

## 安全同私隱

畫面永遠收唔到存取值或者網絡權限。受保護值以精確來源範圍留喺作業系統儲存。批准紀錄只含資料。錯誤使用穩定非秘密代碼，失敗重新整理會保留上一個有效範圍結果或者未改動基本設定。

## 驗證

執行 `node --test tests/core/network-policy.test.js tests/core/network-approvals.test.js tests/core/scheduled-settings.test.js tests/core/vault-service-credentials.test.js tests/core/release-blockers-integration.test.js tests/core/presentation-wave-integration.test.js`。

聚焦網絡政策套件會喺模組存在之前故意由紅色開始，之後涵蓋每種地址分類、混合安全同不安全 DNS 答案、空白同過大解析、精確迴環同私人 LAN 批准、偽造同擴闊批准、數字別名、TLS 身分要求、零重新導向、Home Assistant 憑證綁定、秘密唔反射同不可變固定 lookup。

主要參考：

- [Node.js DNS lookup 選項同完整答案行為](https://nodejs.org/api/dns.html#dnslookuphostname-options-callback)
- [Node.js TLS 主機名驗證](https://nodejs.org/api/tls.html#tlscheckserveridentityhostname-cert)
- [IANA IPv4 Special-Purpose Address Space](https://www.iana.org/assignments/iana-ipv4-special-registry)
- [IANA IPv6 Special-Purpose Address Space](https://www.iana.org/assignments/iana-ipv6-special-registry)
- [RFC 1918 私人 IPv4 地址空間](https://www.rfc-editor.org/rfc/rfc1918.html)
- [RFC 3927 IPv4 link-local 地址空間](https://www.rfc-editor.org/rfc/rfc3927.html)

## 香港粵語

每條規則有固定識別碼、名稱、開關、優先次序、日期、時間、星期、IANA 時區同資料來源。開始同結束時間一樣就代表全日，跨午夜會歸入開始嗰日，結束嗰一刻唔包括在內。優先次序高嘅後套用，同分就由文件入面較後嗰條勝出。規則完咗或者來源出事，原本設定會重新出場，唔會俾臨時值霸住張櫈。

外部來源有限時、限大小、唔跟重新導向、唔收網址內憑證。Home Assistant 存取值只會放喺作業系統保護儲存，唔會塞入排程文件或者畫面狀態。

預設網絡規則只放行公開 HTTPS。主機名完成解析之後，每一個地址都要獨立過檢查。只要清單內有迴環、私人網段、link-local、metadata、未指定、多播、保留、IPv4-mapped IPv6，或者可疑數字別名，整批結果就唔合格。即使其中一個地址正常，都唔代表可以忽略其餘地址。

連接迴環或者私人 LAN 之前，必須另行保存精確批准，並鎖定來源範圍、origin 同完整地址清單。只有迴環批准可以使用 HTTP，私人 LAN 依然只可以使用 HTTPS。link-local 同 metadata 永遠唔屬於可批准地址。真正連線會沿用已驗證嘅固定 lookup 結果，開 socket 嗰刻唔會再查 DNS。HTTPS 證書仍然用原本主機名核對，而且任何重新導向都會被拒絕。

私人 LAN 嘅批准資料同排程文件及 renderer 狀態完全分開。保存私人 Home Assistant 存取值之前，主程序會先顯示本機確認畫面，清楚列出精確 origin 同成套地址。批准紀錄會以原子方式另存喺私人應用資料，而實際存取值只會留喺作業系統保護儲存。DNS 地址集合一有新增、移除或者替換，連線便會停止並要求再次確認。用戶取消時，批准同存取值都唔會保存。

Home Assistant 憑證只會綁定保護儲存參照、精確來源範圍、request origin 同 request URL。真正存取值唔會流入 policy input，亦唔會出現喺結果或者錯誤訊息。純 policy 模組本身唔負責 DNS 查詢或者開 socket。主程序邊界必須完整接上解析、固定 lookup、TLS 核對同零重新導向，整條路線先至成立。

## 建議文章

- [語言模式同搞笑程度](language-and-funny-levels.md)
- [旁白聲線同速度](narrator.md)
- [注意力介面輔助](attention-accommodations.md)
