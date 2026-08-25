# 頭髮參考素材權威

## 用途

產品採用同一位成年男性主角嘅八張生成相片，作為近似頭髮長度視覺參考。呢份清單防止網站副本、桌面副本或者文件副本自立門戶，變成另一個互相打架嘅來源。

## 標準來源

根目錄嘅 `assets/hair-growth/stages.json` 檔案係唯一嘅階段至檔案對應權威。佢嘅 schema version 1 會用 `length` 記錄厘米、用 `file` 記錄來源檔案，並記錄預期 `sha256`。被引用嘅檔案放喺同一層嘅 `assets/hair-growth/`。另一份圖像生成審核 manifest 可以記錄尺寸同生成 metadata，但唔會取代階段對應。`scripts/compose-site.mjs` 係目前唯一嘅網站消費者。JSON 解析前，佢會用 `MAX_HAIR_MANIFEST_BYTES` 將 manifest 限制為 65,536 bytes，並用採用 fatal 模式嘅 UTF-8 `TextDecoder` 解碼。之後，佢會驗證精確階段集合、拒絕唔安全嘅 manifest 路徑、檢查每個檔案介乎 1 KiB 至 12 MiB、驗證每個來源 SHA-256 digest、將標準目錄複製到輸出 `assets/hair-growth/`，再把記錄注入 `#bundled-hair-assets`。

檔案可以進入組合輸出之前，`inspectPng` 邊界會進行 byte-level 驗證。佢會驗證 PNG signature、有次序而唯一嘅 header、chunk 長度同 CRC-32 值、必需嘅圖像資料同結尾 chunks、精確 1254 by 1254 尺寸、非 interlaced 嘅 8-bit grayscale、RGB、grayscale-alpha 或者 RGBA layout、有界限地解壓至精確 scanline 長度、row-filter 邊界，同埋完整終止。composer 亦會拒絕重複嘅階段長度、檔名同 SHA-256 值，並拒絕標準來源根目錄下任何預期以外嘅檔案或者目錄。真實來源檔案檢查、同一主角一致性審閱，同複製後 byte-identity 證明仍然待辦，因為呢個 checkout 冇根素材目錄。

| 穩定階段 ID | 近似長度 | 精確英寸換算 | 顯示值 | 標準檔案 | 解碼證明 | 網站使用 | 桌面使用 |
| --- | ---: | ---: | ---: | --- | --- | --- | --- |
| `hair-stage-003` | 0.3 cm | 15/127 in | 0.12 in | 待辦，位於 `assets/hair-growth/` | 待辦 | 待辦 | 待辦 |
| `hair-stage-015` | 1.5 cm | 75/127 in | 0.59 in | 待辦，位於 `assets/hair-growth/` | 待辦 | 待辦 | 待辦 |
| `hair-stage-030` | 3 cm | 150/127 in | 1.18 in | 待辦，位於 `assets/hair-growth/` | 待辦 | 待辦 | 待辦 |
| `hair-stage-050` | 5 cm | 250/127 in | 1.97 in | 待辦，位於 `assets/hair-growth/` | 待辦 | 待辦 | 待辦 |
| `hair-stage-090` | 9 cm | 450/127 in | 3.54 in | 待辦，位於 `assets/hair-growth/` | 待辦 | 待辦 | 待辦 |
| `hair-stage-140` | 14 cm | 700/127 in | 5.51 in | 待辦，位於 `assets/hair-growth/` | 待辦 | 待辦 | 待辦 |
| `hair-stage-200` | 20 cm | 1000/127 in | 7.87 in | 待辦，位於 `assets/hair-growth/` | 待辦 | 待辦 | 待辦 |
| `hair-stage-280` | 28 cm | 1400/127 in | 11.02 in | 待辦，位於 `assets/hair-growth/` | 待辦 | 待辦 | 待辦 |

## 行為

階段 resolver 會用標準厘米值，喺呢批穩定 ID 入面揀選。切換單位只會改標籤，永遠唔會改已選取嘅實際物理階段。圖像遺失或者讀唔到時，會用包含數字估算嘅文字 fallback。

## 設定

階段 metadata 只可以放喺根 manifest，而且上面每一行各有一筆記錄。運行時程式會消費建置時注入嘅記錄，唔可以另行重述第二份階段至檔名表。registry 必須指返去 manifest 擁有嘅檔案，亦唔可以嵌入重複圖像 bytes。四捨五入只供顯示。換算精確採用每英寸 2.54 厘米。

## 失效模式

- 缺少階段會留下明確清單缺口，唔可以靜靜雞用最接近嘅檔名頂替。
- 另一個來源目錄出現重複檔案屬於 drift，並會阻擋發佈驗證。
- 檔案如果解碼失敗、尺寸唔符合預期，或者缺少 digest，就仍然不可用。
- 當 bytes 無法通過 PNG signature、結構、尺寸、pixel-count 或者 termination 檢查時，單有 digest match 亦唔夠。
- 用經過四捨五入嘅英寸值做標準輸入嘅階段標籤，可能會揀錯邊界。

## 保安同私隱

呢啲相片係產品素材，唔可以包含用戶量度、個人 metadata、位置資料、憑證或者 analytics 識別碼。運行時只會本機載入。任何圖像請求都唔可以包含用戶嘅估算或者 profile 識別碼。

## 驗證

原始碼檢查已確認以上所述由 composer 擁有嘅 `MAX_HAIR_MANIFEST_BYTES` 限制、fatal UTF-8 解碼、階段、路徑、大小、唯一階段、唯一檔案、唯一 digest、精確目錄、PNG signature、結構、CRC、1254 by 1254 尺寸、有界限解壓、scanline、termination、digest 同英寸換算驗證。聚焦強化測試涵蓋有界限嘅 manifest 原始碼邊界。由於呢個 checkout 冇 `assets/hair-growth/`，所以冇任何一行有來源素材證明。待辦驗證必須為每一行記錄精確由 manifest 擁有嘅檔名、media type、尺寸、有界限嘅 decoded pixel count、SHA-256 digest、結構檢查同 decoder 結果、成年主角一致性審閱、alt text、根 manifest 記錄、注入嘅 `#bundled-hair-assets` 記錄、網站 package 引用、桌面 package 引用，同埋 byte-identity 證明。互動同畫面擷取證據仍然待辦。

## 建議文章

- [動畫頭髮長度視覺化](../features/visual-growth-timeline.md)
- [厘米同英寸](../features/measurements.md)
- [私隱同資料邊界](../security/privacy-and-data-boundaries.md)
