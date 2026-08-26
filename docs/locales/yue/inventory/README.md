# 完整性清單

呢幾份人手編寫嘅清單，會點名即使探索程式、實作檔案或者證據消失咗，都必須繼續存在嘅畫面同記錄。佢哋係證據地圖，唔係話一個已宣告嘅控制項一定識郁。

## 清單

- [網站通用功能清單](site-universal-features.md)
- [正則表達式建構器擁有權](regex-builders.md)
- [頭髮參考素材權威](hair-reference-assets.md)

## 狀態用語

- **原始碼存在** 代表指定嘅原始碼檔案或者 selector 存在於連結嘅 checkout。
- **已宣告** 代表模板包含個控制項，但運行時行為仲未驗證。
- **待辦** 代表所需實作或者證據唔存在，或者仲未檢查。
- **已驗證** 只會用喺綁定某個確切建置成品嘅證據。目前清單冇任何一行有呢個狀態。

負向回歸證據會逐個邊界記錄。刻意整壞一個 provenance selector、一個正則表達式建構器註冊，或者一個原始碼模組，只能證明嗰個指定檢查。佢唔可以證明成份人手清單、每個本地化項目、每個聚焦測試、每份互動記錄，同埋每份畫面擷取記錄喺被移除時都會轉紅。

## 證據邊界

以下聚焦測試識別碼同證據路徑，都係穩定而必須保留嘅識別碼。標記為待辦嘅路徑，只係將來真實成品嘅預留位置，唔係已經存在嘅證據連結。

已接受嘅強化測試套件原始碼存在於 `tests/site/hardening.test.mjs`。較早嘅聚焦證明涵蓋文章目標，同有界限嘅 installer 發佈檢查。最新嘅對抗性 fixture 移除或者削弱咗通用清單所記錄嘅六個確切原始碼邊界：School-sensitive overlay 關閉、重建分頁後嘅焦點還原、JSONL 正面允許清單使用、Worker 喺建立或者傳送訊息被拒後嘅佇列復原、有界限而採用 fatal UTF-8 嘅頭髮 manifest 輸入，同埋完全一致嘅 Ollama origin。嗰次執行一共報告 11 個測試，5 個通過，6 個失敗。還原邊界之後，結果係 11 個通過、0 個失敗、0 個略過。另行驗證嘅讀取前個人詞彙檔大小、已本地化狀態同動作，以及自有文案豁免證明，都各自在還原前轉紅 1 個，之後通過 1 個。外部詞彙掃描器嘅精確數量 fixture 轉紅 1 個，當時 `PRIVATE_VOCABULARY_EXPECTED_COUNT` 設為 0；之後通過 1 個，當時預期數量還原至 100。已還原嘅套件包括整合式服務對應項目審核，同佢刻意加入嘅 health-route 斷言。呢啲聚焦結果全部都唔係完整清單證明。

L06 原始碼本地化清單點名 250 個 `ui-core`、274 個 `ui-settings` 同 686 個 `runtime` entries，另加 50 組英文同廣東話文章。五個聚焦測試已通過，而精確 catalog-entry deletion 同 article-locale omission regressions 亦曾經轉紅。Terminal-transfer provenance suite 喺實作前 red 4 of 4，還原後 pass 4 of 4。呢啲係精確原始碼邊界結果，唔係組合後互動、畫面擷取、release 或 deployment 證明。

## 建議閱讀

- [文件索引](../README.md)
- [網站狀態同建置 provenance](../site/status-and-provenance.md)
- [私隱同資料邊界](../security/privacy-and-data-boundaries.md)
