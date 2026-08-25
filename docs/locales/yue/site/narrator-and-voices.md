# 旁白與聲音選擇

## 行為

旁白預設關閉，必須由訪客有意識咁啟用。佢會保存嘅語言選項係英文、廣東話或兩者。兩者永遠代表先英文、後廣東話，經同一條 serialized queue 播放。Speech 絕不重疊，同一 category 入面較新嘅 queued event 會取代已經過時嘅 predecessor。Admission 使用 250 ms global debounce，再加 category cooldowns：informational、progress 同 warning events 係 5 seconds；success 係 3 seconds；accessibility 係 2 seconds；destructive 同 security 係 1 second；errors 係 0 seconds。Error 永遠當 urgent 接納，唔受 debounce 或 previous error time 限制。

英文同廣東話各自有獨立 voice picker，兩種語言預設都係「自動選擇」。Pickers 會列出 browser 回報嘅 voices，保存穩定 `voiceURI` identity，而唔係 localized display name，亦會解釋真正生效嘅聲音。Voice enumeration 係 asynchronous。Runtime 會讀 initial list、subscribe `voiceschanged`、喺 first list empty 時做有上限嘅 delayed reads，並喺 teardown unsubscribe。Rate 同 pitch 使用平台支援而有界限嘅 ranges，預設係 normal delivery。

每個 spoken event 嘅 factual content 喺任何 funny level 都完全一樣。Voice 只會改 style 同 delivery，唔會改 error reason、affected record、elapsed time、count 或 recovery action。Quiet presentation 同 reduced-motion preferences 只會抑制 optional cues，唔會抑制可見 factual message。

Browsers 無法提供可靠而跨平台嘅訊號，話畀網站知 screen reader 係咪正講緊。網站因此唔可以承諾 automatic screen-reader detection 或 audio ducking。佢會維持旁白預設關閉、提供由訪客明確控制嘅 yield setting、喺要求 yielding 時停止 optional speech，並喺控制項旁邊講清楚限制。呢個係坦白嘅 browser limitation，唔係 screen reader 唔存在嘅證據。

## 設定

既定控制項係 `#narrator-enabled`、`#narrator-language`、`#voice-en`、`#voice-yue`、`#narrator-rate`、`#narrator-pitch` 同 `#assistive-tech-active`，兩個 voice pickers 都有 factual status lines。Values 只會喺完整 settings validation 之後接納：

上一個網站版本儲存嘅狀態會先遷移，再做嚴格驗證。舊有五欄 narrator record 會保留 enabled 狀態、兩個 stable voice identities、rate 同 pitch。Narrated language 會由訪客原本儲存嘅網站語言開始，而新增嘅 assistive-technology、quiet-hours 同 reduced-sound 選項會由關閉開始。如果舊 narrator record 多咗、少咗或者整壞咗欄位，程式仍然會拒絕，唔會估估下只套用一半。

- enabled 同 yield values 都係 booleans；
- language 係 `en`、`yue` 或 `both`；
- `voiceURIEn` 同 `voiceURIYue` 只可以係 automatic sentinel，或者 browser 回報、有長度限制嘅 `voiceURI`；
- persisted rate 由 0.1 至 10，而 pitch 由 0 至 2；visible rate slider 刻意只提供較窄嘅 0.5 至 2 range；
- assistive-technology、quiet-hours 同 reduced-sound states 都係 booleans；
- `NARRATION_DEBOUNCE_MS` 係 250，`NARRATION_COOLDOWNS_MS` 帶有上面列出嘅固定 per-category values，而 pure contract 會將 queue 限制喺最多 64 entries；

已揀但目前 missing 嘅 voice identity 會保留。介面唔會靜靜將 preference 改回 automatic selection。如果嗰把 voice 之後返嚟，佢可以再次生效，唔使使用者重揀。

## 失敗情況

- Empty first enumeration 會保持 loading state，直至 bounded retry 或 `voiceschanged` update 解決。系統唔會第一時間就話無 voices installed。
- Selected voice 如果已經唔再 installed，仍然會保持 selected，同時分開回報 current automatic fallback 同 missing-selection state。
- Network-backed voice 喺 offline 時可能 unavailable。Browser 有提供相關 property 時，status 會喺嘗試 speech 之前指出。
- 無 compatible voice 會產生 factual unavailable state。網站唔會用 unrelated language voice 頂替，再扮 requested language 正常 active。
- Unsupported speech synthesis 唔會影響任何 visible messages，narrator control 亦會保持誠實嘅 unavailable state。
- Cancelling、disabling narration、enabling yield control 或 leaving page，都會 cancel active utterance、clear bounded queue 同 release event listeners。
- Both mode 嘅 Cantonese track 如果講唔到，English track 唔可以當成 complete bilingual event 成功嘅證據。Visible status 會回報 partial result。

## 安全與私隱

旁白只會處理已經可見、列入 allowlist 嘅 event text。佢唔可以朗讀 credentials、private vocabulary payloads、hidden state、browser-storage contents 或 private file paths。網站唔會增加 narration upload endpoint，亦唔會自己傳送 speech text。

部分 browser 或 operating-system voices 由 network 支援。揀選呢類 voice，可能令 browser 或 platform speech service 喺頁面以外處理文字。網站無法檢查或保證該 provider 嘅 transport。Browser 有回報相關事實時，status 會指出 network-backed voices，offline behavior 亦會保持明確。

## 驗證

原始碼實作經由 `normalizeNarratorSettings`、`shouldYieldNarration`、`buildNarrationTracks`、`evaluateNarrationAdmission`、`replaceQueuedNarration`、`scheduleVoiceEnumeration`、`queueNarrationTracks` 同 `playSpeechQueue` 提供。已接納嘅 12 of 12 pure-contract result 已證明 default-off state；英文、廣東話同嚴格排序嘅 Both tracks；independent stable identities；rate and pitch normalization；assistive-technology、quiet-hours 同 reduced-sound yielding；exact debounce 同 category cooldown decisions；urgent error admission；category replacement；以及 queue bounds。旁白測試嘅完整標題係 `normalizes narrator choices, yields explicitly, serializes tracks, and replaces queued categories`。最後一項 runtime-binding 測試係 `pins School storage, narrator admission, scheduled API values, voice retry, and startup quiet mode with red-to-green source proof`；佢證明 narrator admission callers and timestamps、startup 同 `voiceschanged` delayed enumeration，以及 listener teardown。已接納嘅 main source-boundary run 喺 deliberate source-removal run 轉紅之後，亦通過 narrator boundary。

Browser assistive-technology verification 只限 explicit yield control、focus、accessible descriptions，同已記錄嘅 reliable automatic detection 缺口。文件唔可以聲稱靜態頁面偵測或 ducked 真正 screen reader。Actual empty-then-populated enumeration、missing and returning voices、network-backed status、no-compatible-voice behavior、spoken ordering、real-time debounce and cooldown behavior、speech errors、cancel and teardown、persistence、composed-website interaction 同 capture evidence 仍然待完成。

## 建議文章

- [語言、玩味程度、School 模式與啟動驚喜](language-and-school-mode.md)
- [無障礙與響應式版面](accessibility-and-responsive-layout.md)
- [設定與外觀](settings-and-appearance.md)
- [通知與本地歷史](notifications-and-history.md)
