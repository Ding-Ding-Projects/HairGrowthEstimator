# 設定同外觀

## 運作方式

網站設定介面必須提供 English、玩味港式廣東話同 bilingual presentation；獨立 English 同 Cantonese funny-level control；emoji decoration control；theme、density、accent、font、motion 同 display-name setting；app-logo preset 同本機 custom-image processing；scheduled setting；personal-vocabulary upload；accessibility mode；以及 per-element appearance editing。

Appearance editing 必須 non-destructive、reversible、local 同 target-specific。每個 rendered element 都必須喺 context menu 提供 Edit appearance command，同時有 accessible equivalent。Unsupported property 必須繼續顯示，並附上確實 capability explanation，唔可以唔識就扮睇唔到。

## 設定

Setting 會用 versioned schema 儲存喺 browser-local state，亦有 reset action。Custom logo 必須喺本機 decode 同 convert，而且受 byte、pixel、frame、time 同 memory limit 約束。Theme color 使用 continuous picker，並顯示多種 color-space representation、gamut warning、alpha 同 contrast。

Personal-vocabulary file contract 使用 schema version 1，根層必須啱啱好只有兩個 field：`schemaVersion` 同 `entries`。`entries` 係由 source string 對應 replacement string 嘅 object。UTF-8 file 上限係 256 KiB，最多 4,096 個 entry，source string 長度由 1 至 160 個 character，replacement string 長度由 0 至 1,000 個 character，maximum JSON depth 係 2。`handleVocabularyFile` 會先檢查 `file.size`；如果大過 `MAX_VOCABULARY_BYTES`，就會喺呼叫 `arrayBuffer()` 之前拒絕個 file，之後確認實際 byte count 仍然同 `file.size` 一樣，再使用 fatal UTF-8 decoding。Unknown field、unknown schema version、malformed UTF-8 或 JSON、duplicate key、unsafe object key、non-string replacement，同埋超出已宣告 bound 嘅 value，都會令完整 file 被拒絕，唔會半套用半放生。`parseJsonStrict`、`validatePersonalVocabularyText` 同 `validatePersonalVocabularyCache` 喺 `site/security-contract.js` 實作其餘 contract；runtime 會用佢哋做 cache application、reload validation、replacement 同 clearing。

`tests/site/site.test.mjs` 入面嘅 external-file scanner 使用 fatal UTF-8 decoding，要求根層啱啱好只有 `schemaVersion` 同 `entries`，要求 `PRIVATE_VOCABULARY_EXPECTED_COUNT` 唔可以係 0，檢查 exact entry count 而唔會輸出任何 replacement，確認每個 replacement 都係 nonempty text，只排除公開嘅 `Slop Machine` value，亦斷言 private replacement scan 本身唔係空白。Deliberate count fixture 將 expected count 設為 0 時回報一個 failing test，恢復為 100 後就回報一個 passing test。呢份證據只涵蓋 scanner contract，絕對唔代表可以 bundle、log、export 或 display private file 或其中 entry。

只有已驗證嘅 local cache 可以跨 reload 保留。Cache 每次使用前都必須重新驗證。Cache missing、corrupt、stale、unsupported，或者經明確 clear，都會即時恢復 original shipped wording。Source filename、source path 同 file metadata 都唔會 cache。`applyVocabularyToOwnedText` 會喺網站擁有嘅 visible-text 同 accessible-name 邊界套用已驗證 replacement，同時透過 `data-vocabulary-exempt` 保留 exempt code、path、technical content、user-authored display name 同 note、local label、authenticator code、model name，以及 factual release code name。`vocabularyStatusCopy` 為 empty、`loading`、`loaded`、`replaced`、`invalid-preserved`、`invalid` 同 `cleared` 狀態提供 localized English、玩味 Cantonese 同 bilingual copy，而且唔會暴露 mapping 或 source metadata。`#vocabulary-status` 係 polite atomic status region。只有 valid cache 存在時，choose action 先會變成 Replace；冇 valid cache 時 Clear 仍然 disabled。Command palette 除咗 upload、replace 同 clear，仲有獨立 `vocabulary-status` destination。School mode active 時，四個 destination、personal-vocabulary control、search result、replacement behavior、status copy 同 reference 都唔會出現喺 rendered experience，而原有 valid cache 會保持 dormant，等 School mode 關閉後再恢復。`SCHOOL_SENSITIVE_REGEX_OWNERS` 識別 language、playfulness、Cantonese voice 同 personal-vocabulary owner，相關 active regex dialog 必須關閉。`applySchoolModeVisibility` 亦會喺目前 target 屬於 School-sensitive 或 hidden surface 時，關閉 context menu、appearance editor 或 lock editor。

State import 只接受經 strict whole-file validator 驗證、已有文件說明嘅 versioned browser export。`parseJsonStrict`、`validateBrowserState`、`validateAppearanceMap`、`sanitizeImportedState` 同 `validateStoredStateEnvelopeText` 喺 `site/security-contract.js` 實作 validation 同 sanitized-construction boundary。Runtime 會用呢啲 function 處理 stored state、complete live-state snapshot、state import、appearance import 同 appearance application。Appearance import 只接受 allowlisted layer、state 同 style field，而且有 bounded count 同 string length。Private lock、authentication entry、vocabulary cache、presentation-mode verifier、custom-logo byte 同 current presentation-mode state，普通 state import 只會由現有 local state 保留，永遠唔會由 imported file 帶入。

## 失效情況

- Invalid 或 unsupported local file 唔可以 partial apply。
- Missing 或 corrupt cached setting 必須退回 shipped default，並回報 fallback。
- Duplicate JSON key 必須喺普通 object parsing 覆寫較早 value 之前被拒絕。
- Invalid personal-vocabulary cache 唔可以繼續啟用 replacement，亦唔可以喺 recovery message 暴露內容。
- State 或 appearance import 如果包含 unknown、unsafe、credential-bearing 或 prototype-related field，就必須喺任何 live state 改變之前，由已有文件說明嘅 sanitizer 拒絕或省略。
- Chosen font 或 voice unavailable 時，選擇必須保留，但要顯示實際 active fallback。
- 清除 browser storage 會移除網站 preference 同 lock。

## 保安同私隱

Personal vocabulary 同 custom image 都留喺本機。Personal-vocabulary term、mapping、payload、cache content、filename、path 同 file metadata，全部排除喺 log、export、history snapshot、capture、analytics、prompt、clipboard operation、synchronized setting 同 network request 之外。State 同 appearance import 唔可以接受 credential material、executable markup、prototype key 或 arbitrary CSS property name。Website lock 只係 convenience control，唔係 security boundary。

## 驗證

原始碼檢查確認 versioned browser persistence、三個已宣告 language mode、兩個 funny-level setting、emoji switch、配有 browser-local PIN 嘅 School mode、theme、density、accent、rainbow speed、font、docking、display rename、logo selection、narrator control、reduced motion、strict personal-vocabulary loading 同 cache validation、schedule、attention mode、strict stored-state 同 import validation，以及會喺 application 之前做 allowlisted validation 嘅 target-specific appearance editor。Runtime 使用 version 1 `entries` schema、pre-read `MAX_VOCABULARY_BYTES` enforcement、stable read-byte verification、fatal UTF-8 decoding、4,096-entry bound、160-character key、1,000-character value、depth 2、duplicate-key rejection、strict cache validation、`applyVocabularyToOwnedText`、payload-free `vocabularyStatusCopy`、`SCHOOL_SENSITIVE_REGEX_OWNERS`、complete browser-state validation、allowlisted appearance validation、sanitized state construction 同 bounded stored-envelope parsing。Dedicated size-order proof 喺 restoration 前係 red 1，restoration 後 passed 1。External scanner 嘅 deliberate expected-count proof 喺 expected count 為 0 時亦係 red 1，恢復為 100 後 passed 1。另一個 focused fixture 移除 localized vocabulary status、action、live-region、cache-dependent action、palette-destination 同 School-filtering anchor 後係 red 1，restore 後 passed 1。Owned-copy exemption fixture 同樣喺 restoration 前係 red 1，之後 passed 1。Marked School-sensitive control、palette result、documentation result、replacement behavior、language presentation、dim-sum startup path、active sensitive regex dialog 同相關 targeted overlay，喺 School mode active 時都會 suppressed 或 closed。Focused hardening test 涵蓋 active regex-owner closure source boundary，但 built interaction、complete absence 同 restoration behavior，以及 cross-product live sharing 仍然 pending。Personal-vocabulary status 同 action copy 涵蓋三個 language mode，而完整 250-entry、274-entry 同 686-entry source catalogs 而家亦已覆蓋 website-owned copy。Composed-browser routing 仍然需要 interaction proof。Appearance editor 提供 browser-safe subset，亦標示幾個 unavailable capability，但未提供完整 required editor depth，亦未為每個 internal picker 提供獨立 regex builder。Focused property-consumer check、keyboard 同 screen-reader path、built interaction 同 real capture 仍然 pending。

## 建議文章

- [標誌自訂](logo-customization.md)
- [排程同外部設定](scheduled-settings.md)
- [旁白同聲線選擇](narrator-and-voices.md)
- [專注輔助模式](attention-modes.md)
- [本機鎖同 authenticator](locks-and-authenticator.md)
- [搜尋同 regex 工作台](search-and-regex-workbench.md)
- [瀏覽器儲存限制](../security/browser-storage-limitations.md)
