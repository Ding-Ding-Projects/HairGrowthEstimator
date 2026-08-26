# 變更記錄

所有值得記低嘅變更都會寫喺呢度。日期同 commit 連結只會喺可以驗證之後先加，唔會預支未來。

## Unreleased

Commit 連結：呢個項目目前不可用，因為一個 commit 喺存在之前，唔可能如實引用自己未來嘅 SHA。不可變 release 記錄會將呢個項目綁定到精確 commit。

### 新增

- 公開文件網站會喺導覽之前顯示同建置綁定嘅來源資料。
- 提供頭髮生長估算、剪髮記錄、單位轉換、視覺階段、服務、私隱、匯出、下載狀態同更新狀態介面。
- 提供每位訪客各自嘅語言、玩味程度、外觀、旁白、排程、專注輔助、導覽、搜尋、通知、歷史同匯出控制。
- 提供瀏覽器本機版進階 regular expression、情境外觀、玩味鎖、authentication code、檔案轉換同本機 Ollama mediation，而且每一項都清楚講明瀏覽器限制，唔會扮到無所不能。
- 提供詳細分類文件同手寫完整性清單。
- 以可重現方式產生真正產品標誌嘅 social preview。
- 提供原始碼層驗證，並刻意執行由紅轉綠嘅負面回歸。
- 加入凍結嘅瀏覽器顯示合約，涵蓋三種語言模式、八類事實訊息、兩種語言各自五級玩味程度、共用 School mode 抑制、旁白 admission 同 serialized tracks、有界限排程設定、精確啟動驚喜 predicate，以及五個獨立專注輔助模式。
- 記錄已接受嘅網站加固合約，包括嚴格本機 JSON validation、positive export allowlisting、內部文件連結、有界限 installer manifest、byte-level PNG inspection、Worker-isolated regular expressions、Content Security Policy，同無障礙發現 18 至 24。
- 加入聚焦網站文章，涵蓋三種語言顯示、五級事實文案 parity、共用而且可由使用者改名嘅 School mode、旁白聲音同 yielding、排程本機同外部設定、精確 10 percent 啟動驚喜，以及五個獨立專注輔助模式。
- 加入有版本嘅廣東話原始碼 catalogs，包含 250 個 `ui-core`、274 個 `ui-settings` 同 686 個 `runtime` entries，另加 50 份完整文章 mirror 同明確完整性清單。

### 修正

- 瀏覽器估算器同公開文件而家共用同一個平均 Gregorian month，即 `365.2425 / 12 = 30.436875 days`，同時計算已過時間嘅目前長度同到達目標前嘅剩餘預測。
- 文件所述每月 1.0 cm 預設值仍然可以調整，清楚標示為非醫療用途，個人差異可以好明顯，並保留現有 NCBI clinical overview 連結。
- 瀏覽器估算器而家會喺新增、編輯或者刪除之後，從仍然有效而且最新嘅剪髮記錄推導 active baseline，同時保留訪客獨立嘅手動 fallback。
- 手動 baseline 同剪髮表格而家會用引導式 inline error 拒絕未來日期。舊有未來剪髮記錄仍然可見，但喺日期真正到來之前唔會變成 active。
- 同源分頁而家會為每個已載入 document 使用全新 writer identity，儲存單調遞增嘅瀏覽器 revision，透過 Web Locks 或 IndexedDB transaction 將寫入序列化，協調 storage event，驗證每次寫入，並清楚拒絕 stale mutation。
- CSV 同 TSV 狀態匯出而家會為完整已刪減記錄提供 normalized JSON Pointer rows，唔再淨係得 aggregate counts。每一行都有 typed JSON values，同埋清楚嘅 representation 及 privacy metadata。
- 無障礙文件而家要求清楚 setting-control names、完整 nested tab relationships 同 roving navigation、分頁篩選期間穩定焦點、完整 context-menu 鍵盤巡覽同焦點返回、刻意文件結果 activation，以及 44 乘 44 CSS pixel 嘅獨立 selection target。
- 網站設定控制而家會收到清楚 accessible names，而 Tools 同 Settings 區域亦會提供完整 tab 同 tabpanel 關係，以及共用 roving keyboard behavior。
- 網站 regular-expression workbench 同搜尋評估而家會經有界限 disposable Workers 執行，唔再喺介面 thread 建立使用者 pattern。
- Worker construction 同 message-send 失敗而家會乾淨拒絕、終止任何已建立 Worker、釋放 queue capacity，再繼續排隊工作，唔會一隻 Worker 跌低成條隊。
- 啟用 School mode 而家會關閉進行中嘅 School-sensitive regular-expression dialog，同埋任何因 target 變得不可用而需要收起嘅相關 context、appearance 或 lock overlay。
- 重建已篩選 tab strip 之後，而家會透過重建後嘅 `focusTarget` 恢復焦點；如果做唔到，就回落到已選或者第一個可見分頁，而且唔會改變 selection。
- JSONL 剪髮 convenience rows 而家只會來自 `record.state.haircuts` 嘅 positive export allowlist，絕對唔會直接從 live state 偷雞攞資料。
- Personal-vocabulary 檔案載入而家會喺讀取之前執行 256 KiB 限制、拒絕變咗嘅 byte count，並用 fatal UTF-8 decoding。佢嘅 localized status、choose or replace、clear、live-region、palette 同 School-filtering anchors 已完成原始碼檢查。
- Personal-vocabulary replacement 而家會將使用者撰寫內容同事實 display names、notes、local labels、authenticator codes、model names 同 release code name 標示為 exempt，同時繼續替換網站擁有嘅可見及 accessible copy。
- 外部 personal-vocabulary scanner 而家會用 fatal decoding 讀取所選檔案，要求精確 version 1 root fields 同非零 expected entry count，喺唔列印 values 嘅情況下檢查非空 text replacements，並證明 private replacement scan 唔係空殼。
- 文件結果而家只會喺訪客刻意啟用之後，先將焦點移到明確可聚焦嘅 article region。
- Installer manifest input 而家會喺 JSON parsing 之前套用 65,536-byte limit 同 fatal UTF-8 decoding。
- Runtime provenance handling 而家會再次驗證完整 installer contract，包括 exact version-tag matching、160-character filename bound、publication field types、positive IDs，同 immutable asset URL。
- Hair-reference manifest input 而家會喺 JSON parsing 之前套用 65,536-byte limit 同 fatal UTF-8 decoding。
- 本機 Ollama configuration 而家只接受 `http://127.0.0.1:11434` 或 `http://localhost:11434`，會保存 normalized origin，並喺 runtime validation 同 Content Security Policy 使用同一條邊界。
- 語言同專注輔助原始碼及文件而家共用同一套精確排程規則：瀏覽器解析嘅 IANA timezone input、inclusive dates、start-inclusive and end-exclusive time windows、equal-time all-day behavior、午夜後歸屬 previous start date and weekday、highest-priority selection，同 later-list-position tie-breaking。
- 旁白文件而家清楚講明，瀏覽器無法可靠偵測進行中嘅 screen reader，所以網站必須使用由訪客明確控制嘅 yielding，而且唔可以聲稱有 automatic ducking。
- 旁白 admission 而家使用 250 ms global debounce、固定 per-category cooldowns，同一條永遠唔會畀呢啲限制拖慢嘅 urgent error path。
- 外部排程文件而家會分清楚 session-only in-memory Home Assistant credentials 同 operating-system vault，亦會報告 CORS 或缺少 mediator 嘅限制，唔會未套用就扮成已套用。
- Release-bound composition 而家只接受固定四檔案 `dist/terminal-transfer` 交接，會驗證精確 receipt hashes 同 nested source bindings，再讀返已發佈 GitHub release 同 Setup asset，並由已驗證 terminal installer 推導可見 version 同 updated-at，唔再要求 tracked package version 扮成 release version。
- Terminal transfer receipt 而家會分開起始 `contextRunAttempt` 同較後成功嘅 `terminalRunAttempt`。Composer 會獨立驗證精確 GitHub Actions terminal-attempt identity，唔會再因為發佈喺較後 attempt 完成，就將合法 rerun 當成撞錯門牌。

### 保安同私隱

- 冇 analytics、trackers、remote fonts 或 CDN assets。
- 網站 template 而家宣告 static Content Security Policy，將 scripts 同 Workers 限制為同源檔案，將本機 model connections 限制到已記錄嘅 loopback endpoints，封鎖 objects 同 frames，並限制 image、base 同 form destinations。
- 喺 immutable release manifest 存在之前，唔會顯示未驗證 installer link。
- Composer 係唯一獲設定去讀取 root asset authority canonical hair-reference images 嘅 source consumer。呢個 checkout 未有 source images，亦冇新增第二個 authority。
- 訪客私人設定繼續留喺本機 browser storage，而且訪客可以自行清除。
- 同源協調只會留喺 browser profile，唔會同步資料去另一部裝置、服務或者網絡供應者。
- 外部排程來源接受 HTTPS 或精確 loopback HTTP，拒絕 embedded credentials、fragments 同 redirects，將回應限制喺 16 KiB，再透過 fatal UTF-8 同 bounded JSON parsing 處理，3 秒後 timeout，並只會將 Home Assistant credentials 留喺 tab memory。Browser CORS 同 static Content Security Policy 仍然決定真實 request 可唔可以行得通。
- 上一個網站版本儲存嘅 narrator 同 theme-only schedule records，而家會先按精確舊格式遷移，再做嚴格 current-schema validation。其他訪客狀態會保留，格式壞咗嘅舊 record 仍然會 fail closed，唔准半桶水入場。
- Normalized CSV 同 TSV exports 會保留已經刪減嘅 record，並喺每一行重複 omission statement。
- 嚴格 security contract 同 active browser consumers 而家實作 duplicate-key-aware JSON parsing、bounded personal-vocabulary validation、完整 browser-state 同 appearance validation、sanitized import construction、bounded stored-envelope parsing，同 positive export allowlist。完整聚焦 hardening suite 喺還原後錄得 12 passed、0 failed、0 skipped。最新 six-boundary adversarial fixture 喺還原前錄得 5 passed 同 6 failed。個別 personal-vocabulary size-order、status-and-action、owned-copy exemption 同 external-scanner fixtures 都係先錄得 one failure，還原後再錄得 one pass。呢啲聚焦結果只係局部 negative-regression evidence，唔係完整 inventory proof。
- 最終完整網站原始碼 suite 錄得 55 passed、0 failed、0 skipped，並只透過外部 value-free path 驗證目前私人詞彙。

### 已知證據缺口

- Built-artifact interaction evidence、真實 captures 同 screen recording 仍然待辦。
- 已部署 Open Graph 同 anonymous image-fetch verification 仍然待辦。
- Installer 同 automatic-update verification 仍然待辦。
- 最終 three-check repair subset 喺移除精確 article-focus、bounded manifest-reader 同 runtime installer-validation 邊界之後，3 of 3 全部轉紅；還原後就有 3 passed、0 failed、0 skipped。完整 focused hardening suite 同 integrated service-counterpart audit 而家通過，但每個 inventory、localization、interaction 同 capture boundary 嘅完整 negative-regression coverage 仍然待辦。Counterpart audit 只會刻意破壞 server health-route boundary，其他已接受 fixtures 亦只涵蓋各自點名嘅 source boundaries。
- 網站 source parity 已經透過 shared calculator 同 deterministic vectors 實作。對於可調整嘅每月 1.0 cm 預設值，以及兩個使用 canonical 30.436875-day month 嘅計算，desktop 同 core consumption、integrated cross-surface proof 同 built-artifact interaction 仍然待辦。
- 最終 README capture update 仍然待辦，而且唔屬於今次 documentation-only lane。
- L06 source integration 已經存在。主要 focused source-boundary test 錄得 5 passed，之前就係刻意嘅 0-of-5 red state。最終 pure-contract test 錄得 12 passed、0 failed、0 skipped，同 exit code 0。Localization suite 喺精確 catalog-entry deletion 同 article-locale omission checks 轉紅之後錄得 5 passed。Terminal-transfer provenance suite 喺刻意嘅 0-of-4 red state 之後錄得 4 passed。組合後 language、School mode、narrator、schedule、surprise、attention 同真實 terminal-release interactions，以及佢哋嘅 capture evidence 仍然待辦。
