# 匯出行為

## 行為

桌面 preload bridge 提供儲存操作，將 caller 提供嘅 UTF-8 文字寫入使用者選擇嘅目的地。Save dialog 支援建立資料夾同 overwrite confirmation。

瀏覽器原始碼會將已刪減敏感資料嘅 visitor-state record 序列化成 JSON、JSONL、YAML、TOML、XML、CSV、TSV、Markdown、HTML、SQL、TypeScript、JavaScript、Python、Go、Rust、JSON Schema 同 Protobuf 文字。佢亦會透過瀏覽器下載匯出剪髮紀錄、歷史、changelog entries、regex snippets 同 appearance presets。一般狀態匯出會清楚標明已省略 authenticator secrets、lock credentials、personal-vocabulary mappings 同 custom-logo bytes，唔會將敏感資料扮成行李偷渡出去。

CSV 同 TSV 已經唔再將組合狀態縮成 aggregate counts。佢哋會將完整已刪減匯出入面每個 JSON scalar 或 empty container，正規化成一行 long-form row。每行包含 `schemaVersion`、`exportedAt`、`encoding`、`lineEndings`、`representation`、`privacy`、`recordType`、`recordId`、`path` 同 `valueJson`。Path 係指向已刪減紀錄嘅 RFC 6901-style JSON Pointer。`recordType` 會識別頂層 state collection，而 `recordId` 會喺有穩定 identifier 時帶住最近嗰個 identifier。`valueJson` 會保留 JSON type，包括內含逗號、引號、tab 同換行嘅字串。Empty arrays 同 objects 都會有明確 rows，所以空 collection 唔會無聲消失。

桌面 preload 已經提供隔離 save boundary，但桌面 serializers 同直接 Visual Studio Code handoff 仍然有待完成。

一般瀏覽器匯出係由 positive allowlist 組成。`buildRedactedExportState` 會喺 `site/security-contract.js` 選出文件列明可匯出嘅 visitor-state fields，而 `redactedExportRecord` 會使用呢個結果，再加入明確 omission metadata。佢唔會 deep-copy 完整 live state 之後先嘗試刪走已知 secrets，所以日後新增嘅敏感 field 會一直保持排除，直至 allowlist 同文件經刻意更新。

JSONL 會將完整已刪減紀錄寫成第一行。額外嘅 `type: "haircut"` rows 只會由 `record.state.haircuts` 產生，而 `record.state` 就係上面 positive-allowlist 產生嘅結果。`serializeExport` 唔會直接讀取 live `state.haircuts`，所以便利 rows 無法繞過匯出私隱邊界。

## 設定

Renderer 會提供建議 filename 同完整 content。完整匯出實作必須喺寫入之前講明 encoding、line endings、schema version、active filters、included sections、omitted fields，同任何有損 representation。

CSV 使用 RFC 4180-style quoted cells，內嵌引號會重複，records 使用 LF。TSV 使用 LF records，並 escape cells 入面嘅 backslash、tab、carriage return 同 line feed characters。兩種格式都會喺每一行重複明確 representation 同 privacy metadata，令拆出嚟嘅 row subset 仍然可以理解。佢哋對已刪減 JSON record 嘅 representation 係忠實嘅，但兩種格式都唔會還原被省略 secrets，因為嗰啲值喺正規化之前已經刻意排除。

## 失敗情況

- 取消 save dialog 會回傳 `{ canceled: true }`。
- File-system write failure 會令操作 reject。
- 目前 main-process handler 信任 renderer 提供嘅 content size，冇明確 byte bound，仍然需要 bounded contract。
- 未確認有直接 open-in-Visual-Studio-Code action。
- 如果 consumer 將 `valueJson` 當普通 display text 而唔係 JSON，value types 就會遺失。Representation column 會喺下載前講明呢項要求。
- CSV 同 TSV import 尚未實作。相容嘅 full-state import 目前只支援 JSON，inventory 已經講明呢個限制。
- 新增 live-state field 會刻意唔出現喺一般匯出，直至佢經過 privacy review 並加入 positive allowlist。
- 如果 JSONL serializer 直接讀取 live haircut state，可能繞過之後嘅 allowlist decision。Haircut rows 必須繼續只由 `record.state.haircuts` 產生。
- State import 必須喺改動任何 live state 之前，拒絕 unknown root fields、unsafe keys、invalid nested shapes、excessive counts，同超出宣告 bounds 嘅 values。

## 安全同私隱

匯出由使用者主動啟動，內容可能包含個人量度同備註。API keys 同其他 credentials 絕對唔可以序列化。Positive allowlist 會排除 authenticator secrets、lock credentials、personal-vocabulary content and metadata、custom-logo bytes、transient coordination data、imported unknown fields，以及任何未經明確匯出決定嘅未來 field。正規化 table rows 會重複完整 omission statement，絕對唔會用原始 secret material 取代 redacted marker。Overwrite 必須繼續由使用者明確決定。

## 驗證

原始碼檢查確認隔離桌面 save bridge、識別 overwrite 嘅 dialog、瀏覽器 serializers、正規化 CSV 同 TSV rows、明確 representation 同 privacy metadata、empty-container rows、feature-specific browser downloads、positive-allowlist `buildRedactedExportState` 由 `redactedExportRecord` 使用、JSONL haircut-row 只由 `record.state.haircuts` 產生、嚴格 root-field parsing、sanitized state import，同 allowlisted appearance import。聚焦 hardening test 涵蓋 positive-allowlist JSONL source boundary。`tests/site/correctness.test.mjs` 證明獨立剪髮紀錄、巢狀 estimator fields、empty collections、逗號、引號、換行、tabs、representation metadata 同 privacy omissions 可以通過 CSV 同 TSV serialization，之後再由正規化 rows 獨立重建完全相同嘅 input record。Tabular formats 嘅產品 import route、size-bound tests、cancel 同 overwrite interactions、其他 format round trips、archive formats、editor handoff，同成品證據仍然有待完成。

## 建議文章

- [剪髮紀錄同重設行為](haircut-history.md)
- [私隱同資料邊界](../security/privacy-and-data-boundaries.md)
- [本機檔案轉換器限制](../security/file-converter-boundaries.md)
