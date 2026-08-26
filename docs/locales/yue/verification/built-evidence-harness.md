# 已建置證據工具

呢份文件定義咗已打包 Windows 桌面應用程式嘅低成本、無頭證據路線。只有當最終已提交嘅來源候選、乾淨嘅打包建置、隔離嘅應用程式資料根目錄，同不可變嘅打包來源證明一齊齊備，呢條路線先會啟用。

呢個工具未有擷取尚未完成嘅介面。佢嘅存在只代表基礎設施已備，唔代表目前產品已完成、視覺正確、私隱安全，或者可以發佈。

## 呢個工具證明到乜

每一個已宣告互動，工具都會將以下全部資料綁入可續跑嘅紀錄簿：

- 精確來源提交；
- 已打包執行檔嘅 SHA-256；
- 已打包 `resources/app.asar` 嘅 SHA-256；
- 真正用嚟啟動、由任務擁有嘅凍結套件副本完整清單雜湊；
- 打包收據 SHA-256；
- CSS 視口、顯示比例、主題、語言，同推導出嚟嘅擷取像素尺寸；
- 輸入之前嘅語意狀態；
- 一個唯一目標選擇器，同佢精確嘅無障礙名稱；
- 精確針對 HWND 嘅輸入方法，同受限輸入參數；
- 預期轉換，同輸入之後觀察到嘅語意狀態；
- 原始輸入前後 PNG 路徑、雜湊、尺寸，同媒體身份；
- 自動私隱檢查；
- 獨立嘅人工像素同敏感資料檢查；
- 決定性完成標記。

錄影輔助程式會將同一來源、套件、渲染器組合、程序樹、動態 HWND、私隱檢查、輸入目標、耐久輸入階段，同逐幀 PNG 雜湊綁入一份短篇動畫 WebP 收據。之後仲要有獨立人工檢查，同重新驗證已完成收據，先可以將錄影標示為完成。

## 呢個工具證明唔到乜

呢個工具唔會由最終圖片、來源預覽、模型、設計檔、檔名清單，或者只注入渲染器嘅結果推斷產品已完成。佢唔會自動批准敏感像素，亦唔會證明互動清單已包含每個可到達功能。嗰份清單一定要另外撰寫同審核。

輔助程式亦唔會建置應用程式。建置同擷取係兩個獨立信任邊界。套件必須一早存在，並帶有下文所述嘅版本 2 打包收據。

## 必須通過嘅預先檢查

每個條件都係必須。少一項就會停止執行。

1. 來源簽出必須位於精確規劃提交，而且冇任何已追蹤或未追蹤變更。
2. 套件必須由嗰個提交喺可棄置套件目錄中產生。
3. 套件建置唔可以修改已追蹤來源位元組。
4. `dist/package/packaged-app-manifest.json` 必須存在於可棄置套件目錄之下，並符合版本 2 收據合約。
5. 執行檔、`resources/app.asar`、已暫存來源證明檔，同打包收據雜湊必須同計劃一致。
6. 執行檔必須回報 `NotSigned`，同專案簽署規則一致。
7. 應用程式必須喺正常啟動讀取之前支援全部三個證據開關：
   - `--evidence-mode`
   - `--evidence-app-data=<absolute path>`
   - `--evidence-user-data=<absolute path>`
8. 應用程式必須喺正常啟動讀取之前寫入兩份證據隔離紀錄：
   - `<userData>/evidence-isolation.json`
   - `<appData>/evidence-app-data-active.json`
9. 便宜 Lowlevel MCP 伺服器必須喺精確、毋須憑證嘅 `http://127.0.0.1:<port>/mcp` 路線可用，並公開完整必需工具清單。
10. 規劃 CDP 連接埠必須喺啟動前未被使用，啟動後只由擷取程序樹內唯一一個程序擁有，而且只監聽迴環介面。
11. 已打包應用程式必須只公開一個頁面目標，URL 要同計劃完全一致，而且 WebSocket 端點喺每個擷取邊界都唔可以改變。
12. 執行必須使用全新 `%TEMP%\<run-id>\.hair-growth-evidence-task` 目錄。目錄同所有上層目錄都唔可以含符號連結或 junction。

## 擁有嘅檔案

| 路徑 | 用途 |
| --- | --- |
| `scripts/evidence/common.mjs` | 受限 JSON、來源同套件雜湊、擁有嘅凍結目錄清單、路徑包含檢查、原子收據、嚴格 PNG 區塊驗證，同嚴格 WebP 結構驗證。 |
| `scripts/evidence/mcp-client.mjs` | 可串流 HTTP MCP 用戶端、便宜無頭工具預先檢查、動態擁有視窗探索、只擷取視窗，同針對 HWND 輸入。 |
| `scripts/evidence/cdp-client.mjs` | 精確 CDP 目標隔離、宣告式唯讀語意探查、無障礙證明、輸入目標證明、即時組合證明、受限渲染器私隱掃描，同受限網絡計數。 |
| `scripts/evidence/process-identity.mjs` | Windows 程序樹身份、建立時間證明、執行檔綁定、遲到子程序重建、精確啟動前 PID 候選復原、CDP 監聽者擁有權、重新驗證、先子後父清理次序，同安全命令列引用。 |
| `scripts/evidence/plan.mjs` | 嚴格計劃結構、執行根目錄擁有權、雙資料根目錄參數同收據，以及打包收據驗證。 |
| `scripts/evidence/ledger.mjs` | 耐久嘅擷取前、輸入意圖、輸入已套用、擷取後同完成階段；受限重試；拒絕過時綁定；擷取檢查；決定性完成標記；以及續跑決定。 |
| `scripts/evidence/run-lock.mjs` | 原子獨佔任務執行命令擁有權、精確程序身份、釋放證明、拒絕重疊，同過時擁有者復原。 |
| `scripts/evidence/evidence-run.mjs` | 準備、互動、檢查、狀態、受限啟動復原、安全輸入前重設，同擁有範圍清理命令。 |
| `scripts/evidence/record-window.mjs` | 只擷取視窗幀、耐久逐動作復原階段、固定 ffmpeg 編碼、WebP 驗證、解碼器往返、建立收據、錄影檢查，同已完成收據驗證。 |

唔需要根目錄套件命令。咁樣可以避免純粹為咗登記開發者專用輔助程式而修改共用套件清單。

## 證據計劃

計劃要存放喺任務擁有嘅暫存目錄，唔好放入來源控制。計劃包含絕對本機路徑，唔係公開收據。

```json
{
  "schemaVersion": 1,
  "runId": "release-1.0.123-main-dark-en",
  "route": "cheap-lowlevel-headless",
  "captureKind": "window",
  "repoRoot": "C:\\path\\to\\clean-source-checkout",
  "sourceSha": "0123456789abcdef0123456789abcdef01234567",
  "runRoot": "C:\\path\\to\\system-temp\\release-1.0.123-main-dark-en\\.hair-growth-evidence-task",
  "artifact": {
    "primary": {
      "id": "executable",
      "sha256": "<64 lowercase hexadecimal characters>"
    },
    "components": [
      {
        "id": "app-asar",
        "sha256": "<64 lowercase hexadecimal characters>"
      },
      {
        "id": "build-receipt",
        "sha256": "<64 lowercase hexadecimal characters>"
      }
    ]
  },
  "artifactPaths": {
    "executable": "C:\\disposable-package-root\\dist\\win-unpacked\\Hair Growth Estimator.exe",
    "app-asar": "C:\\disposable-package-root\\dist\\win-unpacked\\resources\\app.asar",
    "build-receipt": "C:\\disposable-package-root\\dist\\package\\packaged-app-manifest.json"
  },
  "application": {
    "executableArtifactId": "executable",
    "arguments": []
  },
  "isolation": {
    "appDataDirectory": "app-data",
    "userDataDirectory": "user-data",
    "receiptFile": "evidence-isolation.json",
    "appDataMarkerFile": "evidence-app-data-active.json"
  },
  "cdp": {
    "port": 45678,
    "expectedUrl": "file:///C:/disposable-package-root/dist/win-unpacked/resources/app.asar/app/renderer/index.html",
    "timeoutMs": 10000
  },
  "mcp": {
    "endpoint": "http://127.0.0.1:8765/mcp",
    "timeoutMs": 10000
  },
  "window": {
    "titlePattern": "^Hair Growth Estimator$",
    "classPattern": "^Chrome_WidgetWin_1$",
    "timeoutMs": 10000
  },
  "tuple": {
    "viewport": {
      "width": 1440,
      "height": 960
    },
    "scale": 1,
    "theme": "dark",
    "language": "en"
  },
  "privacyPatterns": [
    {
      "id": "private-key",
      "source": "-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
      "flags": "i"
    },
    {
      "id": "credential-assignment",
      "source": "(?:password|passwd|api[_-]?key|secret|access[_-]?token)\\s*[:=]\\s*[\"\\']?[^\\s\"\\'<>]{8,}",
      "flags": "i"
    },
    {
      "id": "bearer-secret",
      "source": "\\bBearer\\s+[A-Za-z0-9._~+/=-]{8,}",
      "flags": "i"
    },
    {
      "id": "user-profile-path",
      "source": "\\b[A-Za-z]:[\\\\/](?:Users|Documents and Settings)[\\\\/][^\\\\/\\s\"\\'<>]+",
      "flags": "i"
    }
  ],
  "allowedNetworkOrigins": [],
  "steps": [
    {
      "id": "open-settings",
      "target": {
        "selector": "#settings-tab",
        "accessibleName": "Settings"
      },
      "input": {
        "method": "mouse_click",
        "x": 72,
        "y": 256,
        "button": "left",
        "clicks": 1
      },
      "expectedTransition": "Settings is the selected tab and its panel is visible.",
      "semantic": {
        "probe": {
          "kind": "attribute",
          "selector": "#settings-tab",
          "name": "aria-selected"
        },
        "beforeEquals": "false",
        "afterEquals": "true",
        "pollIntervalMs": 100,
        "timeoutMs": 5000
      }
    }
  ]
}
```

`tuple.viewport` 係以 CSS 像素計嘅渲染器視口。`tuple.scale` 係即時 `window.devicePixelRatio`。輔助程式會將 `capturePixelSize` 推導為 `viewport × scale`，四捨五入成完整像素，並要求每張已擷取 PNG 同即時 Win32 用戶端都要一致。即時主題來自 `document.body.dataset.theme`，即時語言來自 `document.documentElement.lang`。

計劃唔可以預先宣告證據、資料根目錄、使用者資料，或者偵錯開關。工具擁有呢啲開關，並將每個開關精確附加一次。語意檢查係宣告式唯讀探查，絕對唔係由呼叫者撰寫嘅 JavaScript。支援嘅探查只會讀取一個允許清單內嘅狀態屬性、一個允許清單內嘅原始狀態屬性、可見性，或者選擇器數量。文字內容、表單值、標記、物件屬性，同任意屬性都唔係語意探查範圍。

上面顯示嘅全部四份私隱紀錄，都必須按照嗰個精確次序，使用嗰啲精確識別碼、來源同旗標。計劃唔可以加入呼叫者撰寫嘅正規表示式。咁樣可以將私隱評估限制喺已審核固定清單內，避免唔安全表示式造成渲染器卡死，或者變成私密資料查詢。

滑鼠座標係擷取像素嘅用戶端座標。輸入之前，輔助程式會用固定比例相除，呼叫 `document.elementFromPoint`，並要求命中節點係唯一已登記目標或者佢嘅子節點。鍵盤輸入則要求目前作用中元素位於唯一已登記目標之內。

## 套件收據合約

建置收據使用結構版本 2。任何證據命令繼續之前，工具都會驗證以下邊界：

- `sourceCommit` 必須等於 `sourcePreservation.candidateCommit` 同規劃來源提交；
- `sourcePreservation.verified` 必須係 `true`；
- 執行檔簽署狀態必須精確係 `NotSigned`；
- 執行檔同 `appAsar` 位元組數必須為正數，亦要等於重新讀取嘅檔案大小；
- 執行檔同 `appAsar` 路徑必須解析到可棄置套件目錄之內；
- 建置收據本身必須精確位於該目錄內嘅 `dist/package/packaged-app-manifest.json`；
- 已暫存來源證明路徑必須解析到該目錄之內；
- `provenance.logicalPath` 必須精確係 `app/provenance.json`；
- 已暫存同已打包來源證明雜湊必須相等；
- 來源保存收據必須存在於已宣告路徑；
- 每份 `sourceBinding.appAsar` 同 `sourceBinding.server` 紀錄必須有精確鍵 `fileCount`、`bytes`、`inventorySha256` 同 `files`；
- 每個來源綁定檔案必須有精確鍵 `path`、`source`、`bytes` 同 `sha256`；
- 來源綁定路徑必須唯一，並使用 JavaScript 預設碼元排序，`fileCount` 要等於完整紀錄數量，而總位元組要等於紀錄總和；
- 每個來源綁定清單雜湊，都要對每份已排序紀錄嘅 UTF-8 串接 `path + NUL + bytes + NUL + sha256 + LF` 重新計算；
- 圖示清單必須具備受限、有效身份；
- 計劃路徑同雜湊必須等於收據路徑同雜湊；
- 執行檔、`app.asar` 同已暫存來源證明位元組，要再由磁碟重新雜湊。

建置收據可以包含絕對本機路徑，所以會保留為本機建置證據。逐次點擊紀錄簿只會保存已綁定雜湊，同安全相對證據路徑。

版本 2 收據係獲接受嘅套件組成信任邊界。工具會獨立驗證完整紀錄陣列同佢哋嘅標準雜湊，重新讀取執行檔、`app.asar`、已暫存來源證明同收據位元組，並將結果綁定到乾淨來源提交。啟動之前，工具會將完整已打包應用程式目錄複製到擁有嘅執行根目錄，清點每個普通檔案，比較來源之前、來源之後，同凍結副本清單，然後只啟動凍結執行檔。之後每個執行階段邊界都會重新雜湊凍結目錄，任何位元組變動都會被拒絕。工具唔會解開 `app.asar`，亦唔會重新解讀每個描述性 `source` 欄位。套件產生者負責來源同套件比較，並必須喺發佈之前拒絕唔完整或唔匹配嘅收據。

## 執行生命週期

### 1. 自我檢查

```powershell
node scripts/evidence/evidence-run.mjs self-test
node scripts/evidence/record-window.mjs self-test
```

呢啲命令只驗證命令登記，唔會啟動或者擷取應用程式。

### 2. 準備

```powershell
node scripts/evidence/evidence-run.mjs prepare --plan "C:\path\to\temporary\evidence-plan.json"
```

準備會依照次序完成以下工作：

1. 驗證乾淨來源提交同全部套件雜湊；
2. 驗證版本 2 套件收據；
3. 預先檢查便宜 Lowlevel 工具清單；
4. 如果擁有名稱嘅隱藏桌面一早存在就拒絕；
5. 如果規劃 CDP 連接埠一早已有監聽者就拒絕；
6. 建立全新擁有嘅暫存執行根目錄，再讀返擁有者標記；
7. 啟動之前寫入再讀取受限復原標記；
8. 直接喺具名隱藏桌面啟動已打包執行檔；
9. 證明回傳 PID 喺啟動前程序清單唔存在；
10. 擷取同保存程序樹身份；
11. 按程序擁有權、標題同類別，動態解析精確一個非零應用程式 HWND；
12. 如果該桌面有任何非擁有可見視窗就拒絕；
13. 驗證推導像素尺寸；
14. 證明 CDP 監聽者屬於已啟動樹內唯一一個程序，而且只限迴環；
15. 讀取同驗證兩份隔離資料根目錄收據；
16. 要求精確一個 CDP 頁面目標，URL 同預期完全一致；
17. 驗證即時視口、比例、主題、語言、渲染器私隱，同資源來源邊界；
18. 建立逐次點擊紀錄簿。

準備從來唔會按索引揀視窗，亦唔會將估出嚟嘅 HWND 保留為之後互動嘅證明。每個後續命令都會再次解析同重新驗證 HWND。

每個可以改動紀錄簿、錄影、設定檔、程序或完成紀錄嘅命令，都會擁有一個原子任務執行鎖。準備先會喺初始化屏障後面建立原本唔存在嘅執行根目錄，而個屏障綁定精確 PID、父 PID、程序建立時間，同執行檔。其他命令會拒絕處於初始化中嘅執行。同一個準備程序必須先取得命令鎖，先可以移除屏障或者啟動任何嘢。鎖收據會綁定精確執行擁有者標記、命令、PID、父 PID、程序建立時間、執行檔，同隨機權杖。第二個改動命令會喺讀取同重寫共用狀態之前停止。正常完成時會重新讀取精確收據，先移除鎖。

啟動之前，輔助程式會寫入帶有 `armed` 狀態嘅受限本機復原標記。標記會綁定擁有嘅凍結套件清單同凍結執行檔路徑。啟動之後，佢只會記錄擁有嘅執行識別碼、隱藏桌面名稱、PID、啟動區間、來源雜湊、執行檔雜湊、凍結套件綁定、PID 不存在判定，最終再加入擁有嘅程序身份。佢從來唔會保存命令列、URL、標題、秘密或者無關程序身份。精確擁有執行檔路徑只會留喺任務本機程序身份紀錄。穩定準備會移除標記。之後如果準備失敗，會先嘗試用記憶體內精確程序身份清理，令執行狀態寫入失敗都唔會遺留已證明程序。如果啟動呼叫未有耐久回傳 PID，`recover-launch` 會喺記憶體內即時程序資料搜尋精確凍結執行檔、唯一證據參數，同受限建立時間，而唔保存無關程序或命令列資料。佢會解析出唯一一個擁有根程序、證明冇近期已打包程序或監聽者殘留後關閉空白任務桌面，否則就因含糊而拒絕。如果 PID 已經記錄，復原會喺清理前重新驗證 PID、執行檔、建立區間、擁有者標記、隱藏桌面、凍結位元組，同程序樹。

### 3. 檢查續跑狀態

```powershell
node scripts/evidence/evidence-run.mjs status --plan "C:\path\to\temporary\evidence-plan.json"
```

狀態回應會回報以下其中一個動作：

| 已存狀態 / 階段 | 續跑動作 | 意義 |
| --- | --- | --- |
| `pending` / `pending` | `capture` | 呢次嘗試未有可信輸入或圖片。 |
| `running` or `failed` / `pre_captured` | `reset` | 已有輸入前圖片，但未記錄輸入意圖。受限重試安全。 |
| `running` or `failed` / `input_intent` | `restart_run` | 輸入可能已發生。重用設定檔可能會將非冪等動作套用兩次。 |
| `running` or `failed` / `input_applied` | `restart_run` | 輸入肯定已發生。必須全新隔離執行。 |
| `captured` | `inspect` | 兩張原始圖片同語意轉換都存在，但仍然需要人工檢查。 |
| `completed` | 下一步 | 雜湊、檢查，同完成標記仍然一致。 |

狀態會重新讀取來源、套件收據、全部套件雜湊、每張保留 PNG、精確計劃對紀錄簿投影，同每個重新計算完成標記。來源、套件、圖片、計劃綁定或標記一旦過時，就會停止續跑。

### 4. 執行一個已宣告互動

```powershell
node scripts/evidence/evidence-run.mjs step --plan "C:\path\to\temporary\evidence-plan.json" --step open-settings
```

命令會由動態 HWND 擷取非均勻、冇中繼資料嘅輸入前 PNG，並重新驗證每個邊界。佢先保存 `pre_captured`，再喺執行一次針對 HWND 嘅輸入之前保存 `input_intent`。輸入之後會即刻保存精確輸入收據同 `input_applied`。佢會用固定截止時間輪詢宣告式語意探查，之後喺輸入後 PNG 前後重新驗證精確 CDP 目標、監聽者擁有者、渲染器私隱、資源來源、程序樹，同一個 HWND。PNG 完成後會再讀宣告式語意狀態，並將擷取後值同最初觀察到嘅輸入後狀態分開綁定。

步驟會停喺 `captured`，唔係 `completed`。

### 5. 檢查原始像素

審核者會開啟紀錄簿內精確輸入前後 PNG，再寫一份獨立暫存檢查檔：

```json
{
  "schemaVersion": 1,
  "stepId": "open-settings",
  "preSha256": "<ledger pre-image SHA-256>",
  "postSha256": "<ledger post-image SHA-256>",
  "pixelsInspected": true,
  "sensitiveDataReviewed": true,
  "targetVisible": true,
  "expectedStateVisible": true,
  "noClipping": true,
  "reviewer": "reviewer-identifier"
}
```

```powershell
node scripts/evidence/evidence-run.mjs inspect --plan "C:\path\to\temporary\evidence-plan.json" --step open-settings --inspection "C:\path\to\temporary\open-settings-inspection.json"
```

檢查命令會重新讀取兩張 PNG 身份同雜湊。複製、取代、編輯、縮放、帶中繼資料、空白或者過時圖片一律拒絕。只有通過之後先會建立完成標記。

### 6. 受限復原

```powershell
node scripts/evidence/evidence-run.mjs reset --plan "C:\path\to\temporary\evidence-plan.json" --step open-settings
```

只有耐久階段係 `pending` 或 `pre_captured` 嘅 `failed` 或中斷 `running` 步驟先可以重設。最多三次嘗試。如果下游已有完成證據，步驟唔可以重設。一旦存在 `input_intent`，重設就會被拒絕，因為輸入可能已經發生。唯一安全復原係使用全新執行識別碼、全新雙設定檔目錄，同新隔離啟動。`captured` 步驟必須檢查，唔可以靜靜重新擷取覆蓋有效原始位元組。

如果準備喺啟動後停止，並留下 `launch-recovery.json`，請執行：

```powershell
node scripts/evidence/evidence-run.mjs recover-launch --plan "C:\path\to\temporary\evidence-plan.json"
```

復原唔會只信 PID。已記錄 PID 時，佢要求精確擁有者標記同計劃雜湊，證明 PID 喺啟動前唔存在，驗證建立時間位於已記錄啟動區間內，匹配固定執行檔，重建即時程序樹，拒絕非擁有可見視窗，再用同一條擁有清理路線。啟動仍然處於已武裝但冇 PID 時，復原會由固定執行檔、唯一證據參數，同受限啟動時間精確識別一個程序，或者證明冇近期匹配程序、監聽者或可見任務視窗殘留。缺少或含糊身份仍然會被拒絕。

如果命令程序停止時仍擁有 `.evidence-command-lock`，請執行：

```powershell
node scripts/evidence/evidence-run.mjs recover-lock --plan "C:\path\to\temporary\evidence-plan.json"
```

鎖復原會重新讀取任務擁有者標記同精確鎖收據。如果已記錄 PID、父 PID、建立時間，同執行檔仍然識別一個即時程序，就會拒絕復原。只有程序身份已消失或者被重用，先可以移除精確鎖檔同目錄。

### 7. 擁有範圍清理

```powershell
node scripts/evidence/evidence-run.mjs cleanup --plan "C:\path\to\temporary\evidence-plan.json"
```

清理會重新讀取執行擁有者標記、重新驗證根程序建立時間同凍結執行檔、拒絕任何非擁有可見視窗、嘗試針對性 <kbd>Alt</kbd>+<kbd>F4</kbd>，然後只按先子後父次序終止擁有程序樹內仍然存活嘅身份。每個執行階段邊界都會保存新證明身份。清理亦會沿住已保存父鏈重建遲到子程序，拒絕 PID 重用，就算原本根程序已退出都會包括嗰啲子程序。如果每個已記錄程序都退出咗，只有任務桌面冇可見視窗，空白擁有 PID 集先會獲接受。佢只會關閉具名隱藏桌面，再重新讀取擁有者標記。通過晒呢啲證明之後，先會刪除兩個精確隔離任務設定檔目錄，並將本機執行狀態換成已刪節清理收據。紀錄簿檔、已擷取證據，同凍結驗證輸入會保留。

清理從來唔會列舉任意可見桌面，亦唔會單憑 PID 終止程序。

## 只擷取視窗嘅錄影

錄影需要固定嘅本機 ffmpeg 執行檔。佢嘅絕對路徑會留喺暫存錄影計劃，而公開安全收據只會加入 SHA-256。

```json
{
  "schemaVersion": 1,
  "recordingId": "main-walkthrough",
  "frameRate": 4,
  "durationSeconds": 20,
  "outputFile": "recordings/main-walkthrough.webp",
  "encoder": {
    "kind": "ffmpeg",
    "path": "C:\\tools\\ffmpeg\\ffmpeg.exe",
    "sha256": "<64 lowercase hexadecimal characters>"
  },
  "actions": [
    {
      "atFrame": 8,
      "target": {
        "selector": "#settings-tab",
        "accessibleName": "Settings"
      },
      "input": {
        "method": "mouse_click",
        "x": 72,
        "y": 256,
        "button": "left",
        "clicks": 1
      },
      "semantic": {
        "probe": {
          "kind": "attribute",
          "selector": "#settings-tab",
          "name": "aria-selected"
        },
        "beforeEquals": "false",
        "afterEquals": "true",
        "timeoutMs": 5000,
        "intervalMs": 100
      }
    }
  ]
}
```

```powershell
node scripts/evidence/record-window.mjs capture --plan "C:\path\to\temporary\evidence-plan.json" --recording "C:\path\to\temporary\recording-plan.json"
```

第一幀之前，擷取會寫一份綁定精確執行、來源、套件、組合、編碼器、時間、動作計劃，同輸出嘅錄影進度紀錄。每個動作都會耐久推進 `pending`、`input_intent`、`input_applied` 同 `post_captured`。`input_intent` 會喺輸入前寫入，精確輸入收據就會喺之後即刻寫入。意圖階段或之後嘅中斷，都永遠唔可以喺同一隔離執行中重設或重複動作。

每一幀都會重複來源、套件、凍結套件、精確目標、即時組合、私隱、CDP 監聽擁有權、程序樹，同動態視窗證明。動作會喺輸入後同該幀之前重複呢啲證明。每一幀擷取後都會再重複，連最後一幀都唔例外。每份動作收據會保留選擇器、無障礙名稱同角色、精確受限輸入、宣告式語意探查、預期前狀態、觀察到嘅前狀態、預期後狀態、觀察到嘅後狀態，同該幀之後重新讀取嘅狀態。錄影期間 HWND、擁有程序、類別同邊界必須保持不變。擷取之前，完整編碼器目錄會複製到擁有嘅執行根目錄，再由完整清單綁定。編碼同每次之後嘅解碼器驗證都只會使用嗰個凍結執行檔。編碼器會直接執行而唔經 shell，寫出動畫無損 WebP，亦永遠唔會收到螢幕擷取輸入。輔助程式會驗證 VP8X 必須排第一、ANIM 必須位於幀之前、精確允許嘅 RIFF 區塊、畫布同幀幾何、正數幀持續時間、內嵌位元流尺寸、動畫身份、幀數、零值填充、冇中繼資料、內嵌幀區塊，同完整解碼器往返。

唔執行輸入之下檢查錄影復原：

```powershell
node scripts/evidence/record-window.mjs status --plan "C:\path\to\temporary\evidence-plan.json" --recording "C:\path\to\temporary\recording-plan.json"
```

| 錄影狀態 | 動作 | 意義 |
| --- | --- | --- |
| 冇進度或輸出 | `capture` | 可以開始全新錄影。 |
| 部分幀，而每個動作仍然係 `pending` | `reset` | 冇輸入意圖，所以可以移除精確部分輸出再重試。 |
| 任何動作位於 `input_intent`、`input_applied` 或 `post_captured` | `restart_run` | 輸入可能已經發生。請使用全新執行識別碼同隔離設定檔。 |
| 已擷取收據等候檢查 | `inspect` | 原始幀同 WebP 位元組仍然綁定等候審核。 |
| 已完成收據 | `complete` | 每個保留身份同完成標記仍然驗證成功。 |

只重設一個已證明位於輸入前嘅錄影中斷：

```powershell
node scripts/evidence/record-window.mjs reset --plan "C:\path\to\temporary\evidence-plan.json" --recording "C:\path\to\temporary\recording-plan.json"
```

重設會重新讀取來源同套件綁定，加上精確進度紀錄。任何動作階段超過 `pending`、任何已完成或等候檢查收據，以及任何冇耐久進度紀錄嘅部分輸出，都會被拒絕。

錄影完成要使用以下獨立檢查檔：

```json
{
  "schemaVersion": 1,
  "recordingId": "main-walkthrough",
  "outputSha256": "<recording WebP SHA-256>",
  "frameInventorySha256": "<SHA-256 of the canonical ordered frame receipt array>",
  "everyFrameInspected": true,
  "sensitiveDataReviewed": true,
  "expectedSurfaceOnly": true,
  "expectedFlowVisible": true,
  "noClipping": true,
  "reviewer": "reviewer-identifier"
}
```

```powershell
node scripts/evidence/record-window.mjs inspect --plan "C:\path\to\temporary\evidence-plan.json" --recording "C:\path\to\temporary\recording-plan.json" --inspection "C:\path\to\temporary\recording-inspection.json"
```

檢查會重新讀取每張保留 PNG、要求完整有序幀索引、將每份動作收據同精確錄影計劃比較、重新讀取最終 WebP、重複解碼器往返，再對來源、套件、組合、編碼器、時間、幀、動作、輸出、私隱，同檢查紀錄重新計算決定性完成標記。

喺之後任何提升邊界，再次讀取已完成收據同媒體：

```powershell
node scripts/evidence/record-window.mjs verify --plan "C:\path\to\temporary\evidence-plan.json" --recording "C:\path\to\temporary\recording-plan.json"
```

`inspect` 寫入完成狀態之後會叫用呢個驗證器。獨立命令會重複來源同套件綁定、每個幀雜湊同尺寸、每個目標、角色、輸入、語意狀態、私隱布林值、最終 WebP 身份、解碼器往返，同完成標記計算。

## 私隱邊界

- 結構同視窗擷取結果檢查都會拒絕螢幕擷取。
- 每次螢幕截圖呼叫都要包含正數動態 HWND，並必須回傳 `mode: window`、相同 HWND、`rendered_ok: true`，同精確擁有輸出路徑。
- 規劃 CDP 連接埠必須喺啟動前空置。啟動後，每個命令都要證明唯一一個迴環監聽者屬於擷取程序樹。過時或無關本機監聽者會停止執行。
- 任何額外或已取代 CDP 目標都會停止執行。失敗收據只記錄一般污染類別，從來唔會記錄無關 URL 或標題。
- 隱藏桌面上任何非擁有可見視窗，都會停止探索、互動、錄影，同清理。
- 渲染器私隱探查會檢查受限文件文字、表單控制值、無障礙同描述屬性，以及產生嘅偽元素內容。佢哋只回傳禁用模式識別碼。匹配文字從來唔會保存，而超過節點或字元上限就會拒絕。
- 網絡收據只保留數量。請求 URL 同內容唔會寫入證據。
- 本機 `file:`、`data:` 同 `blob:` 資源會當成非網絡資源。任何 HTTP 或 HTTPS 來源都必須明確列入允許清單。
- 語意探查由輔助程式按固定唯讀結構產生。計劃唔可以提交 JavaScript、改動文件，或者讀取任意屬性。
- 語意結果同收據會拒絕似憑證嘅值同使用者設定檔路徑。
- PNG 證據會拒絕文字、壓縮文字、國際文字、EXIF、無效校驗和、唔支援像素格式、尾隨位元組、完全透明幀，同均勻幀。
- PNG 證據亦會拒絕 `IHDR`、`IDAT` 同 `IEND` 以外每個未知或可選區塊，以及含未消耗位元組嘅壓縮串流。
- WebP 證據會拒絕 EXIF、XMP、色彩描述檔中繼資料、未知頂層或內嵌幀區塊、非零填充、無效 RIFF 長度、次序錯誤結構區塊、無效幀矩形或持續時間、內嵌位元流尺寸唔匹配、無效畫布尺寸，同非動畫錄影輸出。
- 應用程式設定檔根目錄只屬於該任務。擁有清理移除之前，會立即再次驗證精確擁有者標記。
- 人工像素檢查仍然係必須。自動檢查唔可以證明圖片完全冇私密視覺資料。

## 聚焦檢查

只執行證據檢查：

```powershell
node --test tests/evidence/common.test.mjs tests/evidence/plan-ledger.test.mjs tests/evidence/mcp-cdp.test.mjs tests/evidence/recording-process.test.mjs tests/evidence/recovery.test.mjs tests/evidence/run-lock.test.mjs tests/evidence/harness-cli.test.mjs
```

刻意可見擷取破壞可以獨立執行：

```powershell
node tests/evidence/deliberate-red-probe.mjs
```

預期結果：退出碼 1，同時有 `VISIBLE_CAPTURE_FORBIDDEN`。

執行以下命令還原有效合約：

```powershell
node scripts/evidence/evidence-run.mjs self-test
```

預期結果：退出碼 0，同時有 `window-only-evidence-v1`。

額外聚焦負面檢查包括：額外或已取代 CDP 目標、已被佔用 CDP 連接埠、非擁有或可由外部到達嘅監聽者、錯誤 MCP 路線、非擁有或含糊視窗、螢幕模式截圖結果、唔唯一無障礙目標、輸入目標唔匹配、原始語意 JavaScript、缺少必需私隱紀錄、私隱掃描超限、過時套件位元組、凍結目錄變動、唔完整來源綁定清單、被篡改執行擁有者標記、缺少雙根目錄證明、含糊輸入後重試、並行執行鎖擁有權、過時鎖復原、無效錄影邊界、拒絕重設錄影輸入意圖、已改動錄影私隱或語意收據、過時錄影完成標記、錄影中繼資料、格式錯誤動畫 WebP 幾何或次序、未知 PNG 或 WebP 區塊、不可見 PNG、唔安全收據值、遲到程序子代、空程序清理含糊、無效已武裝啟動復原、路徑逃逸，同唔完整程序身份。

## 目前整合邊界

唔好對未完成介面執行呢個工具。只有以下條件喺同一個最終提交全部成立，擷取先會解除阻擋：

- 主程序資料根目錄隔離接縫已整合；
- 非改動式套件來源證明路線已整合；
- 來源簽出乾淨；
- 可棄置套件建置完成；
- 版本 2 收據存在，而且獨立有效；
- 兩份完整來源綁定清單都通過標準數量、位元組總和、排序，同雜湊檢查；
- 執行檔同 `app.asar` 雜湊已固定；
- 規劃 CDP 連接埠喺啟動前空置，而啟動後可以證明監聽者擁有權；
- 明確已審核互動清單同所有必需私隱紀錄存在；
- 已證明建置應用程式喺任何正常資料讀取之前，用兩個隔離資料根目錄啟動。

喺嗰之前，正確工具結果係拒絕，而唔係後備擷取。
