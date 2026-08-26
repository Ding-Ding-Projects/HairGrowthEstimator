# 排程同外部設定

## 運作方式

L06 schedule contract 會暫時覆寫網站嘅 language、theme、density、accent、font scale 同 motion。Base setting 會分開儲存，當冇任何 enabled rule 符合時就會自動返嚟，唔使使用者逐樣執返。其他 appearance 同 customization value 暫時未包含喺呢個 rule shape，呢點會明確列為 completeness gap，而唔係靜雞雞當佢哋不存在。

本機 rule 可以使用可選、包含邊界嘅 start date 同 end date、start time 同 end time，以及 Every day 或者明確 weekday set。Evaluation 會將瀏覽器解析出嚟嘅 IANA timezone 當成獨立 input，而唔會將同一份資料重複塞入每條 rule。一般 time window 會喺同一 local date 由 start 開始匹配，到 end 之前停止，end 本身唔包括在內。Cross-midnight window 會歸入佢開始嗰日嘅 weekday，午夜後嗰段就屬於上一個 start date 同 weekday，end 同樣唔包括在內。Start 同 end time 相同，係明確嘅 all-day exception。系統會先按畫面顯示嘅 timezone，由目前 instant 評估 date boundary，之後先處理 precedence。

每條 rule 都有 stable identifier、bounded label、enabled state、source type、explicit priority 同 deterministic list order。Priority 較高者勝出。Priority 相同時，persisted list order 較後嘅 rule 勝出。每次只會 atomically 套用一條 rule，所以兩個相同候選者嘅 value 永遠唔會撈埋一碟。每次 edit 都會記錄一個新 local revision，而已過期嘅 override 永遠唔會覆寫 visitor 嘅 base value。

每條 rule 可以使用 local value、已驗證而有版本嘅 HTTPS API，或者 Home Assistant boolean entity。Active 而且已驗證嘅 API response，可以提供 allowlisted partial setting，只喺目前 evaluation 入面覆寫該 rule 嘅 persisted setting。佢永遠唔會改動 persisted rule 或 base setting。Home Assistant `binary_sensor` 或 `input_boolean` 狀態為 `on` 時，會啟用 persisted rule value；狀態為 `off` 時，就由 base value 或另一條 matching rule 接手。External result 會喺 activation 時同有界限 interval 內重新整理。Generation identifier 會阻止舊 response 覆寫較新嘅 edit 或 result。

## 設定

Schedule editor 包括 label、原生 start date 同 end date、start time 同 end time、Every day 或 selected weekday、priority、enabled state、language、theme、density、accent、font scale、motion、source selection、API configuration、Home Assistant configuration、timezone status 同 rule list。Editor 會顯示 evaluation 實際使用、由瀏覽器解析嘅 IANA timezone。Timezone 唔會多餘咁重複儲存喺每條 rule 入面。

上一個網站版本儲存嘅規則會先遷移，再做嚴格驗證。舊有只改 theme 嘅 rule 會保留 identifier、label、enabled state、times、weekdays、theme 同 creation time。遷移後 priority 係零、冇 date limits、source 係 local，而且唔會覆寫 language、density 或 motion。Accent 同 font scale 會由訪客原本儲存嘅 base settings 開始，避免遷移一完成就突然轉樣。格式錯誤或者新舊欄位撈埋一齊嘅 record 仍然無效，整份 saved state 會被 quarantine，唔會半套用半估。

Persisted rule 必須啱啱好只有 `id`、`label`、`enabled`、`priority`、`startDate`、`endDate`、`start`、`end`、`everyDay`、`days`、`settings`、`source` 同 `createdAt`。Priority 必須係 -1000 至 1000 嘅 integer。Date 可以留空，或者係真實嘅 `YYYY-MM-DD` value。Time 必須係真實嘅 `HH:MM` value。Day 必須係 0 至 6 之間、冇重複嘅 integer，而 Every day 關閉時就一定要有 day。

`settings` object 必須啱啱好只有 `language`、`theme`、`density`、`accent`、`fontScale` 同 `motion`。Language 可以係 `unchanged`、`en`、`yue` 或 `both`。Theme 可以係 `unchanged`、`dark`、`light` 或 `contrast`。Density 可以係 `unchanged`、`compact`、`comfortable` 或 `spacious`。Accent 可以係 `unchanged`，或者 3、4、6 或 8 digit hexadecimal color。Font scale 由 0.75 至 2。Motion 可以係 `unchanged`、`full` 或 `reduced`。

`source` object 必須啱啱好只有 `kind`、`url` 同 `entityId`。Kind 可以係 `local`、`api` 或 `homeAssistant`。Local value 使用同 direct setting change 一樣嘅 validator。External source 會定義 request timeout、refresh interval bound、maximum response byte、expected schema version 同 allowlisted setting key。Unknown field、unsupported version、invalid partial date 或 time input、impossible date range，或者空白 weekday set，都會令成條 rule 被拒絕，唔會左執一忽右套一忽。

API URL 必須使用 HTTPS。HTTP 只會接受完全相同嘅 loopback host。Redirect、embedded credential、URL fragment、file URL、非 HTTP scheme，同 validation 後改變 host，全都會被拒絕。Home Assistant rule 另外需要已驗證嘅 base URL，同埋符合 `binary_sensor.*` 或 `input_boolean.*` 嘅 entity identifier。

## 失效情況

- 無效或者未填完整嘅 date 同 time 唔會建立 rule。
- Start date 遲過 end date 屬於無效。兩個 date 都省略，就代表 date range 無邊界。
- 除非已選 Every day，否則空白 weekday selection 屬於無效。
- Daylight-saving change 會按目前 instant，同瀏覽器解析出嚟嘅 IANA timezone 評估。畫面顯示嘅 local date 同 time 會直接比較，所以被跳過嘅 wall-clock interval 唔會製造假 match，而重複 wall-clock interval 嘅兩次出現都會一致評估。
- 較舊嘅 network response 唔可以覆寫較新嘅 edit 或 activation。
- Offline、malformed、refused、redirected、oversized、timed-out、rate-limited、unauthenticated 或者 `off` source，會保留 local base state 或另一條目前有效嘅 rule，並顯示 non-blocking recovery message。
- Remote value 永遠唔會靜雞雞寫返做 permanent base setting。
- 移除或者停用 winning rule 時，系統會即時重新計算 winner；如果冇其他 rule 符合，就恢復 base state。
- 瀏覽器喺背景被 suspend 之後，resume 時會按 current time 重新計算，唔會逐個重播所有錯過嘅 interval。

## 保安同私隱

External response 受 size 同 time bound 限制，會按照 versioned schema 解析，而且只容許已知 setting field。佢哋唔可以提供 script、markup、file path、arbitrary URL 或額外 request。Request 使用 cancellation 同 generation check，亦永遠唔會記錄 response body 或 credential value。

靜態網站無法將 Home Assistant access token 放入 operating-system credential vault，而 cross-origin browser request 亦受目標 CORS policy 限制。因此 direct route 只會將 token 放入目前 page lifetime 嘅 tab memory。Token 永遠唔會寫入 rule、browser storage、history、export、log、documentation 或 URL，reload page 後就要重新輸入。呢個做法嘅 durability 同 isolation 都低過 operating-system vault，介面會清楚交代呢個限制，唔會扮到好似金鐘罩咁。

Direct request 只會喺完全相同、已驗證嘅 Home Assistant origin 透過 CORS 允許網站時先運作。被拒絕嘅 preflight 或 response 會保持 unavailable 狀態，唔會亂估 authentication 結果。需要 durable credential storage，或者目標唔容許 browser CORS 嘅 visitor，就需要明確設定同源或 loopback mediator，由 static page 以外管理 credential，並只回傳有界限嘅狀態。網站唔會聲稱呢種 mediation 已經自動安裝。

## 驗證

原始碼實作已經透過 `validateScheduleRule`、`evaluateScheduleRules`、`validateExternalSettingsResponse`、`addSchedule`、`updateScheduledOverrides` 同 `refreshExternalSchedules` 提供。獲接受嘅 12 of 12 pure-contract result 證明咗確實嘅 rule、settings 同 source shape；enum 同 numeric bound；真實 date 同 time；URL 同 entity boundary；由瀏覽器提供嘅 IANA timezone evaluation；optional date；start-inclusive 同 end-exclusive 嘅一般及 cross-midnight window；equal-time all-day exception；weekday ownership；highest-priority 同 later-list-position precedence；external activation；partial API setting；Home Assistant `on` 同 `off`；以及 response-schema refusal。確實嘅 schedule test title 係 `validates bounded scheduled rules, source fields, URLs, dates, times, and entity identifiers`、`evaluates timezone windows, optional dates, weekdays, cross-midnight rules, and stable precedence` 同 `validates versioned API and Home Assistant response envelopes without persisting remote values`。最終 runtime-binding test 亦透過 deliberate red-to-green mutation，證明 API `settings` handoff 同 `evaluation.settings` consumption。獲接受嘅 main source-boundary run，喺 deliberate source-removal state 變成 red 之後，已通過 schedule control、schema、response bound、redirect refusal 同 session-token boundary。

以上結果只係 source evidence。Persistence、base-state restoration、background resume、真實瀏覽器入面嘅 daylight-saving transition、六項目前支援 setting 嘅 atomic application、更廣泛嘅 appearance 同 customization scheduling，以及 composed interaction 仍然 pending。

Focused source evidence 涵蓋 HTTPS 同 exact-loopback URL validation、embedded-credential 同 fragment refusal、response schema 同 allowlist、API activation、Home Assistant `on` 同 `off`，亦涵蓋 redirect refusal、16 KiB response bound、3-second timeout、session-only credential 同 generation ordering 嘅 source presence。Real redirect、oversized body、cancellation、stale response、offline behavior、missing credential、CORS refusal、optional mediator absence、rate limiting、remote-value non-persistence、composed-website interaction 同 capture evidence 仍然 pending。

## 建議文章

- [語言、玩味程度、學校模式同啟動驚喜](language-and-school-mode.md)
- [設定同外觀](settings-and-appearance.md)
- [瀏覽器儲存限制](../security/browser-storage-limitations.md)
- [私隱同資料邊界](../security/privacy-and-data-boundaries.md)
