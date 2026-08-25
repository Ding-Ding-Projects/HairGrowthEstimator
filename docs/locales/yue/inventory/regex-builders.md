# 正則表達式建構器擁有權清單

## 合約

網站每個搜尋欄位、dropdown、picker、menu 同 context menu，都會擁有一份獨立純文字篩選器，以及一個相鄰而錨定嘅完整正則表達式工作台入口。開啟一個擁有者時，唔可以重用或者覆寫另一個擁有者嘅 query、flags、validation、samples、replacement preview 或者 regex-enabled state。

呢份係人手編寫嘅清單。佢刻意包括缺少嘅擁有者，咁樣就算移除咗控制項，或者一直冇加入佢嘅建構器，都唔會令清單扮完整。模板用 `data-open-regex-for` 宣告建構器按鈕。檢查到嘅運行時實作，包含獨立 `state.regexOwners` 記錄、相鄰建構器註冊、有界限輸入大小、結果上限、dropdown 強化，同埋以下已識別行嘅原始碼消費者。`site/regex-worker.js`、`site/regex-client.js`、非同步 `runRegexWorkbench` 同 `filterSearchItems` 而家會實作有界限隔離評估、可棄置 Workers、response identifiers、每個擁有者嘅 cancellation、stale-generation refusal、deadlines、queue limits、termination，同埋拒絕同步 regular-expression fallback。Worker 建立同 `postMessage` 被拒時，會釋放 active slot、推動排隊工作，並乾淨俐落咁拒絕受影響嘅 request。錨定 popover positioning、完整 keyboard 行為、建置互動同畫面擷取仍然待辦。

`SCHOOL_SENSITIVE_REGEX_OWNERS` 列出 `language-mode`、`funny-en`、`funny-yue`、`voice-yue`、`vocabulary-file`、`replace-vocabulary` 同 `clear-vocabulary`。School mode 啟用時，如果開住嘅 regex dialog 屬於其中一個精確目標，就會關閉。當 context menu、appearance editor 或者 lock editor 嘅目前目標屬於已標記嘅 School-sensitive 或隱藏畫面時，亦會關閉。呢啲只係原始碼行為，完整建置互動同還原證據仍然待辦。

## 集合同導覽搜尋

| 擁有者 ID | 畫面同目標 | 原始碼 selector | 必需獨立狀態 | 聚焦測試 ID | 狀態同證據 |
| --- | --- | --- | --- | --- | --- |
| `current-strip` | 目前主要分頁列 | [模板](../../../../site/index.template.html) 入面嘅 `#strip-search` 加 `[data-open-regex-for="strip-search"]` | Query、pattern、flags、validation、mode、current-strip scope | `site.regex.owner.current-strip` | 原始碼消費者：`renderTabs`；建置互動同畫面擷取待辦 |
| `group-tabs` | 所選群組內嘅分頁 | `#group-tab-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode、selected-group ID | `site.regex.owner.group-tabs` | 獨立擁有者會保存，但冇 selected-group result consumer |
| `group-names` | 可見群組名稱同標籤 | `#group-name-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode | `site.regex.owner.group-names` | 獨立擁有者會保存，但冇 group-result consumer |
| `master-tabs` | 網站擁有嘅每個分頁 | `#master-tab-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode、result context | `site.regex.owner.master-tabs` | 獨立擁有者會保存，但冇 master result consumer |
| `tab-overflow` | 溢出嘅分頁 | `#overflow-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode | `site.regex.owner.tab-overflow` | 原始碼消費者：`renderOverflow`；建置互動同畫面擷取待辦 |
| `bulk-tab-query` | 關閉包含或者唔包含文字嘅分頁 | `#bulk-tab-query` 加相鄰按鈕 | 正向同反向動作共用一個 predicate、flags、include-pinned choice、preview | `site.regex.owner.tab-bulk-close` | 原始碼消費者：`updateBulkTabPreview`；輸入冇宣告式 `data-search-owner`，所以按 ID 指派擁有權 |
| `haircuts` | 剪髮記錄 | `#haircut-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode、current filter scope | `site.regex.owner.haircuts` | 原始碼消費者：`renderHaircuts`；建置互動同畫面擷取待辦 |
| `documentation` | 已捆綁文章標題同內文 | `#docs-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode、title/body matches | `site.regex.owner.documentation` | 原始碼消費者：`renderDocs`；組合 bundle 同建置證據待辦 |
| `history` | 本機歷史 | `#history-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode、date and action filters | `site.regex.owner.history` | 原始碼消費者：`renderHistory`；date range 可用，action filter 缺少 |
| `notifications` | 通知中心 | `#notification-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode、current selection | `site.regex.owner.notifications` | 原始碼消費者：`renderNotifications`；建置互動同畫面擷取待辦 |
| `changelog` | 更新日誌項目 | `#changelog-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode、date range | `site.regex.owner.changelog` | 原始碼消費者：`renderChangelog`；建置互動同畫面擷取待辦 |
| `settings` | 設定標籤、說明同目前值 | `#settings-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode、owning settings tab and focus target | `site.regex.owner.settings` | 原始碼消費者：`filterSettings`；只會篩選目前已渲染卡片，唔會跨分頁導覽 |
| `command-palette` | 指令、目的地、文章、設定同 appearance controls | `#palette-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode、rich result context | `site.regex.owner.command-palette` | 原始碼消費者：`renderCommandPalette`；固定索引同 teleport 已存在，完整索引同 rich rows 未完成 |
| `support-tickets` | 本機虛構支援單 | `#ticket-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode、ticket status filter | `site.regex.owner.support-tickets` | 原始碼消費者：`renderTickets`；建置互動同畫面擷取待辦 |
| `authenticator` | 本機 authenticator 項目 | `#totp-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode；secrets 永遠唔會變成 sample text | `site.regex.owner.authenticator` | 原始碼消費者：`renderTotpEntries`；只用 labels 同 issuers，建置證據待辦 |
| `ollama-models` | 已安裝本機模型 tags | `#ollama-search` 加相鄰按鈕 | Query、pattern、flags、validation、mode、installed-state filter | `site.regex.owner.ollama-models` | 原始碼消費者：`renderOllamaModels`；只有已安裝 tags，建置證據待辦 |
| `converter-results` | converter 佇列同結果歷史 | 冇搜尋欄位 | Query、pattern、flags、validation、mode、queue/result scope | `site.regex.owner.converter-results` | 缺少；冇互動或者畫面擷取證據 |
| `locks` | 受管理元素 lock 清單 | 冇 lock-list 搜尋 | Query、pattern、flags、validation、mode、target and policy filters | `site.regex.owner.locks` | 缺少；冇互動或者畫面擷取證據 |
| `schedules` | 已排程設定規則清單 | 冇 schedule-list 搜尋 | Query、pattern、flags、validation、mode、enabled and source filters | `site.regex.owner.schedules` | 缺少；冇互動或者畫面擷取證據 |
| `appearance-presets` | 已命名外觀 presets | 冇 preset-list 搜尋 | Query、pattern、flags、validation、mode | `site.regex.owner.appearance-presets` | 缺少；冇互動或者畫面擷取證據 |
| `logo-presets` | 隨附同用戶 logo 選擇 | `#logo-preset` 係 dropdown 擁有者，但冇獨立 preset-list 搜尋 | Query、pattern、flags、validation、mode | `site.regex.owner.logo-presets` | 透過 dropdown 部分宣告；清單證據待辦 |
| `export-history` | 之前生成嘅 exports | 冇 export-history 清單或者搜尋 | Query、pattern、flags、validation、mode | `site.regex.owner.export-history` | 缺少；冇互動或者畫面擷取證據 |

## Dropdown 同 picker

運行時 `enhanceDropdowns` 會加入相鄰搜尋輸入、獨立 `:dropdown-filter` 擁有者、禮貌通知嘅結果數量同建構器，套用到目前每個 `select`，亦包括動態掛載嘅 workbench 同 appearance selects。佢會喺原始碼內篩選 native option visibility。呢個唔係已開啟嘅自訂 popup，所以建置 keyboard 行為、焦點還原、screen-reader 行為，同一致嘅 option hiding 仍未證明。

| 擁有者 ID | Dropdown 或 picker | 原始碼 selector | 建構器宣告 | 聚焦測試 ID | 狀態同證據 |
| --- | --- | --- | --- | --- | --- |
| `converter-category` | Converter 類別 | `#converter-category` | 宣告式建構器加生成嘅 `converter-category:dropdown-filter` | `site.regex.dropdown.converter-category` | 原始碼篩選已實作；自訂 popup 互動同畫面擷取待辦 |
| `converter-adapter` | Converter adapter | `#converter-adapter` | 宣告式建構器加生成嘅 `converter-adapter:dropdown-filter` | `site.regex.dropdown.converter-adapter` | 原始碼篩選已實作；自訂 popup 互動同畫面擷取待辦 |
| `export-format` | Export 格式 | `#export-format` | 宣告式建構器加生成嘅 `export-format:dropdown-filter` | `site.regex.dropdown.export-format` | 原始碼篩選已實作；建置證據待辦 |
| `language-mode` | 語言模式 | `#language-mode` | 宣告式建構器加生成嘅 `language-mode:dropdown-filter` | `site.regex.dropdown.language-mode` | 原始碼篩選已實作；建置證據待辦 |
| `theme` | 主題 | `#theme-select` | 宣告式建構器加生成嘅 `theme:dropdown-filter` | `site.regex.dropdown.theme` | 原始碼篩選已實作；建置證據待辦 |
| `density` | 密度 | `#density-select` | 宣告式建構器加生成嘅 `density:dropdown-filter` | `site.regex.dropdown.density` | 原始碼篩選已實作；建置證據待辦 |
| `font-family` | 介面字體家族 | `#font-family` | 宣告式建構器加生成嘅 `font-family:dropdown-filter` | `site.regex.dropdown.font-family` | 原始碼篩選已實作；缺少已安裝字體列舉同 typeface previews |
| `dock` | 分頁列邊緣 | `#dock-select` | 宣告式建構器加生成嘅 `dock:dropdown-filter` | `site.regex.dropdown.dock` | 原始碼篩選已實作；建置證據待辦 |
| `logo-preset` | Logo preset | `#logo-preset` | 宣告式建構器加生成嘅 `logo-preset:dropdown-filter` | `site.regex.dropdown.logo-preset` | 原始碼篩選已實作；建置證據待辦 |
| `logo-fit` | Logo fit mode | `#logo-fit` | 生成嘅 `logo-fit:dropdown-filter` 同來自 `enhanceDropdowns` 嘅建構器 | `site.regex.dropdown.logo-fit` | 原始碼篩選已實作；冇宣告式模板建構器，亦冇建置證據 |
| `voice-en` | 英文旁白聲音 | `#voice-en` | 宣告式建構器加生成嘅 `voice-en:dropdown-filter` | `site.regex.dropdown.voice-en` | 原始碼篩選同延遲 stable-identity 列舉已實作；建置證據待辦 |
| `voice-yue` | 廣東話旁白聲音 | `#voice-yue` | 宣告式建構器加生成嘅 `voice-yue:dropdown-filter` | `site.regex.dropdown.voice-yue` | 原始碼篩選同延遲 stable-identity 列舉已實作；建置證據待辦 |
| `schedule-theme` | 已排程主題 | `#schedule-theme` | 宣告式建構器加生成嘅 `schedule-theme:dropdown-filter` | `site.regex.dropdown.schedule-theme` | 原始碼篩選已實作；建置證據待辦 |
| `palette-size` | 指令面板大小 | `#palette-size` | 宣告式建構器加生成嘅 `palette-size:dropdown-filter` | `site.regex.dropdown.palette-size` | 原始碼篩選已實作；建置證據待辦 |
| `lock-policy` | 每元素 lock policy | `#lock-policy` | 宣告式建構器加生成嘅 `lock-policy:dropdown-filter` | `site.regex.dropdown.lock-policy` | 原始碼篩選已實作；建置證據待辦 |
| `lock-duration` | 解鎖時段 | `#lock-duration` | 宣告式建構器加生成嘅 `lock-duration:dropdown-filter` | `site.regex.dropdown.lock-duration` | 原始碼篩選已實作；建置證據待辦 |
| `ticket-category` | 支援單類別 | `#ticket-category` | 宣告式建構器加生成嘅 `ticket-category:dropdown-filter` | `site.regex.dropdown.ticket-category` | 原始碼篩選已實作；建置證據待辦 |
| `schedule-source` | 本機、HTTPS API 或 Home Assistant 來源 | 冇控制項 | 缺少 | `site.regex.dropdown.schedule-source` | 缺口；冇建構器、互動或者畫面擷取證據 |
| `narrator-language` | 英文、廣東話或者雙語旁白 | 冇控制項 | 缺少 | `site.regex.dropdown.narrator-language` | 缺口；冇建構器、互動或者畫面擷取證據 |
| `history-actions` | 一個或者多個動作篩選器 | 冇控制項 | 缺少 | `site.regex.dropdown.history-actions` | 缺口；冇建構器、互動或者畫面擷取證據 |
| `ollama-family` | 模型家族篩選器 | 冇控制項 | 缺少 | `site.regex.dropdown.ollama-family` | 缺口；完整 catalog 畫面缺少 |
| `ollama-capability` | 模型能力篩選器 | 冇控制項 | 缺少 | `site.regex.dropdown.ollama-capability` | 缺口；完整 catalog 畫面缺少 |
| `ollama-variant` | 模型 variant 同 tag | 冇控制項 | 缺少 | `site.regex.dropdown.ollama-variant` | 缺口；完整 catalog 畫面缺少 |
| `ollama-quantization` | Quantization | 冇控制項 | 缺少 | `site.regex.dropdown.ollama-quantization` | 缺口；完整 catalog 畫面缺少 |
| `ollama-fit` | Hardware-fit verdict | 冇控制項 | 缺少 | `site.regex.dropdown.ollama-fit` | 缺口；完整 catalog 畫面缺少 |
| `ollama-harness` | Allowlisted harness profile | 冇控制項 | 缺少 | `site.regex.dropdown.ollama-harness` | 缺口；harness 畫面缺少 |
| `appearance-state` | 一般、hover、焦點、pressed、selected、disabled、loading、success、warning 同錯誤狀態 | 動態 `[data-appearance-state]` select | 生成嘅篩選器同建構器，配合唔穩定嘅 generated select ID | `site.regex.dropdown.appearance-state` | 原始碼篩選存在；缺少 dragged 同 validation 狀態、穩定 owner ID 同建置證據 |
| `appearance-layer` | 外觀 layer 同 group | Layer rows 使用 inputs，而唔係 dropdown | 缺少 layer/group picker | `site.regex.dropdown.appearance-layer` | 缺口；冇 picker、建構器、互動或者畫面擷取證據 |
| `appearance-blend` | Layer blend mode | 動態 `[data-style="mixBlendMode"]` select | 生成嘅篩選器同建構器，配合唔穩定嘅 generated select ID | `site.regex.dropdown.appearance-blend` | 原始碼篩選存在；stable owner ID 同建置證據待辦 |
| `appearance-font` | 每元素字體家族 | 動態 `[data-style="fontFamily"]` select | 生成嘅篩選器同建構器，配合唔穩定嘅 generated select ID | `site.regex.dropdown.appearance-font` | 原始碼篩選存在；已安裝字體列舉、preview、stable owner 同建置證據待辦 |
| `appearance-color-space` | 顏色 translator representation | Translator 輸出會渲染成 read-only cards | 缺少可編輯 color-space picker 同建構器 | `site.regex.dropdown.appearance-color-space` | 缺口；translations 存在，但冇 picker、互動或者畫面擷取證據 |
| `appearance-font-style` | 每元素一般、italic 或者 oblique style | 動態 `[data-style="fontStyle"]` select | 生成嘅篩選器同建構器，配合唔穩定嘅 generated select ID | `site.regex.dropdown.appearance-font-style` | 原始碼篩選存在；stable owner 同建置證據待辦 |
| `appearance-decoration` | 每元素文字 decoration | 動態 `[data-style="textDecoration"]` select | 生成嘅篩選器同建構器，配合唔穩定嘅 generated select ID | `site.regex.dropdown.appearance-decoration` | 原始碼篩選存在；完整 decoration 深度同建置證據待辦 |
| `appearance-alignment` | 每元素文字 alignment | 動態 `[data-style="textAlign"]` select | 生成嘅篩選器同建構器，配合唔穩定嘅 generated select ID | `site.regex.dropdown.appearance-alignment` | 原始碼篩選存在；stable owner 同建置證據待辦 |
| `regex-mode:<owner>` | 每個已掛載 workbench 嘅純文字或者 regular-expression mode | 動態 `[data-regex-mode]` select | 生成嘅篩選器同建構器，配合唔穩定嘅 generated select ID | `site.regex.dropdown.workbench-mode` | 獨立同 owner dialogs 都有原始碼篩選；stable owner 同建置證據待辦 |
| `regex-expected:<owner>` | 預期 match 或 no-match outcome | 動態 `[data-regex-case-expected]` select | 生成嘅篩選器同建構器，配合唔穩定嘅 generated select ID | `site.regex.dropdown.expected-outcome` | 原始碼篩選存在；stable owner 同建置證據待辦 |

## Menu 同 context menu

每個開啟嘅 menu instance 都需要目標自有嘅篩選狀態，就算由共用 component 渲染都一樣。篩選可以隱藏可見項目，但永遠唔可以令一個已隱藏嘅破壞性 shortcut 繼續生效。

| 擁有者 ID | Menu 目標 | 目前擁有者 | 聚焦測試 ID | 狀態同證據 |
| --- | --- | --- | --- | --- |
| `element-context-menu` 加 session target | 每個已渲染元素 | 共用 `#context-menu`、`#context-search`、`[data-open-regex-for="context-search"]`、全域 context-menu listener、`Shift+F10` 同 touch long-press | `site.regex.menu.every-element-context` | 原始碼搜尋同目標 routing 已實作；owner state 係共用而唔係 target-specific，action specialization 同焦點還原未完成，建置證據待辦 |
| `tab-context:<tab-id>` | 每個主要同設定分頁 | 冇 tab-specific owner | `site.regex.menu.tab-context` | 缺少分頁管理、外觀、lock、搜尋同證據 |
| `group-context:<group-id>` | 每個 tab-group header | 冇擁有者 | `site.regex.menu.group-context` | 缺少 group menu、搜尋、建構器同證據 |
| `appearance-context:<property-id>` | 每個 appearance property、layer、state 同 preview target | 冇擁有者 | `site.regex.menu.appearance-context` | 缺少 menu、搜尋、建構器同證據 |
| `notification-context:<notification-id>` | 每個通知 | 共用元素 menu 會開啟通用 activate、appearance、lock 同 copy 動作 | `site.regex.menu.notification-context` | 通用原始碼 routing 存在；缺少 notification-specific actions 同獨立擁有者 |
| `haircut-context:<record-id>` | 每筆剪髮記錄 | 共用元素 menu 會開啟通用 activate、appearance、lock 同 copy 動作 | `site.regex.menu.haircut-context` | 通用原始碼 routing 存在；缺少 record-specific actions 同獨立擁有者 |
| `history-context:<revision-id>` | 每個歷史 revision | 共用元素 menu 可能會開啟，但缺少 restore、label、export 同 details 動作 | `site.regex.menu.history-context` | 未完成亦未驗證 |
| `authenticator-context:<entry-id>` | 每個 authenticator 項目 | 共用元素 menu 會通用地開啟；copy 同 confirmed delete 亦存在於該行、menu 之外 | `site.regex.menu.authenticator-context` | 缺少 entry-specific menu owner 同完整動作 |
| `ollama-context:<tag>` | 每個本機模型 tag | 共用元素 menu 可能會開啟，但缺少 installed-model actions | `site.regex.menu.ollama-context` | 通用原始碼 routing 存在；缺少 model-specific owner 同動作 |
| `converter-context:<result-id>` | 每個 converter 佇列或者結果項目 | 冇結果清單或者擁有者 | `site.regex.menu.converter-context` | 缺少 |
| `support-context:<ticket-id>` | 每張本機支援單 | 共用元素 menu 會通用地開啟；Advance 存在於支援單該行、menu 之外 | `site.regex.menu.support-context` | 缺少 ticket-specific menu owner 同完整動作 |
| `tab-overflow-menu` | 分頁溢出 | `#tab-overflow-dialog`、`#overflow-search` 同 `renderOverflow` | `site.regex.menu.tab-overflow` | 原始碼篩選同啟動已實作；完整 keyboard flow 同建置證據待辦 |
| `application-overflow-menu` | 全域應用程式動作 | `[data-action="open-overflow"]` 目前會開啟分頁 overflow，而唔係完整全域 menu | `site.regex.menu.application-overflow` | 缺少獨立全域擁有者同證據 |

## 正則表達式工作台內部擁有者

工作台會渲染幾個內部結果畫面，但呢啲畫面冇自己嘅獨立搜尋欄位。以下各行會分開已實作嘅工作台內容，同仍然缺少嘅內部搜尋擁有權合約，唔會一鍋熟咁當全部完成。

| 擁有者 ID | 必需目標 | 聚焦測試 ID | 狀態 |
| --- | --- | --- | --- |
| `regex-constructs` | 引導式 construct catalog 同 engine capability matrix | `site.regex.internal.constructs` | Capability matrix 原始碼已實作；guided builder 同內部搜尋擁有者缺少 |
| `regex-tree` | Parse tree 同 token annotation | `site.regex.internal.parse-tree` | `explainRegex` 為所選 constructs 實作 token annotations；parse tree 同內部搜尋缺少 |
| `regex-matches` | Match 同 capture table | `site.regex.internal.matches` | 原始碼已實作 indexes、captures、named groups、zero-width advance 同 500-result cap；內部結果搜尋缺少 |
| `regex-test-cases` | 預期 match 同 no-match cases | `site.regex.internal.test-cases` | 原始碼已實作最多 100 個持久 cases 同 pass 或 fail results；edit、delete 同內部搜尋缺少 |
| `regex-snippets` | 已儲存 snippets | `site.regex.internal.snippets` | 目前擁有者嘅 JSON import、export 同 copy 已實作；已命名 saved-snippet list 同內部搜尋缺少 |
| `regex-replacements` | Replacement templates 同 previews | `site.regex.internal.replacements` | 目前擁有者嘅原始碼已實作；內部 preview 搜尋缺少 |
| `regex-trace` | 有界限 trace 同 performance diagnostics | `site.regex.internal.trace` | 已有 elapsed timing、size caps、result cap 同 heuristic risk warning；已接受嘅 Worker isolation 同 timeout 待辦，execution trace 缺少 |

## 必需驗證

聚焦驗證必須證明純文字預設行為、明確 regex opt-in、雙向 query 同 flag 同步、無效 patterns、Unicode、多行輸入、captures、replacements、zero-width matches、no-match states、adversarial inputs、Worker evaluation deadlines 同 termination、拒絕同步 fallback、錨定 placement、焦點還原、keyboard filtering、screen-reader result counts、獨立 owner state，同埋上面嘅完整擁有者清單。完整負向回歸必須逐一移除每個精確擁有者或者建構器註冊，令佢轉紅，再還原令佢轉綠。

負向回歸證據只係部分完成。目前網站套件只會刻意移除 current-strip 建構器註冊 `data-open-regex-for="strip-search"`，觀察原始碼檢查失敗，再將佢還原。嗰個結果並冇涵蓋呢份清單嘅每個擁有者、Worker isolation、聚焦互動或者畫面擷取證據。最新文件檢查時，仍然冇任何建置成品互動或者畫面擷取證明。

## 建議文章

- [搜尋同正則表達式工作台](../site/search-and-regex-workbench.md)
- [分頁式導覽](../site/tabbed-navigation.md)
- [設定同外觀](../site/settings-and-appearance.md)
- [網站通用功能清單](site-universal-features.md)
