# 語言、玩味程度、School 模式與啟動驚喜

## 行為

網站提供三個會保存嘅顯示模式：

- 英文只顯示英文內容。
- 玩味香港廣東話只顯示廣東話內容。
- 雙語模式用英文做精簡主要一行，再用較短廣東話做第二行。第二行只係補充第一行，唔會複製控制項，亦唔會喺窄版面塞到逼爆。

英文同廣東話各自有一個獨立保存、由 1 至 5 嘅玩味程度。兩邊預設都係 5。Level 1 完全專業，level 5 玩味最高，中間 level 會逐級增加玩味。呢個設定會套用到每一類訊息，包括資料、進度、成功、警告、錯誤、破壞性操作內容、安全內容同無障礙內容。幽默只會改語氣，唔會改事實。每個版本都會保留完全相同嘅事實 placeholder，包括名稱、日期、時長、數量、受影響資料、失敗原因同復原操作。

對話框 emoji 偏好同玩味程度分開。啟用時，佢會喺 dialogs 同 message boxes 加入相關但只作裝飾嘅 emoji。佢唔會喺 buttons、action labels、field labels、accessible names 或 factual values 加 emoji，費事操作名稱變成表情包猜謎。

School 模式係一個共用、可以由使用者改名嘅瀏覽器設定。同一網站來源底下每個頁面都會讀取同一份版本化紀錄，監察佢有冇改變，並且唔使 reload 就套用較新 revision。模式啟用期間，網站會強制使用英文，並且由已呈現嘅 controls、routes、search results、overlays、notifications 同 accessible text 移除廣東話、雙語、玩味程度、personal-vocabulary 同 dim-sum 功能。訪客之前揀過嘅選項仍然會保存，只係暫時休息。停用模式後，嗰啲選項會即時恢復。改名之後，網站所有提及呢個模式嘅表面都只會顯示使用者揀嘅名稱。

網站嘅共用界線係目前瀏覽器 profile 同 origin。Browser storage events 可以同步已開啟嘅 same-origin tabs，但靜態網站唔可以直接監察已安裝桌面產品嘅 operating-system record。因此，跨產品即時共用需要明確介接嘅本地連線，唔可以因為網站用咗 browser storage 就當佢已經做到。

喺符合資格嘅啟動情況，網站會做一次而且只做一次新 random draw，結果大過或等於 0 同細過 0.10 先會顯示驚喜。菜式名稱來自公開 `Ding-Ding-Projects/dim-sum-photos` catalog，並會用英文同繁體中文顯示。只有 catalog 對所選紀錄已有 published photo asset，先會顯示圖片。個 surface 唔會阻塞、唔會搶 focus，而且每次 launch 最多出現一次。First run、School 模式、error recovery、update activity、訪客正做緊一項工作、quiet 或 do-not-disturb state，又或者今次 launch 已經顯示過驚喜，都會抑制佢。網站唔提供停用呢個驚喜嘅偏好設定。

## 設定

既定控制項係 `#language-mode`、`#funny-en`、`#funny-yue`、`#dialog-emoji` 同 `#school-mode`。Language value 只可以係 `en`、`yue` 或 `both`。每個 funny level 都係 1 至 5 嘅整數。School mode record 必須有 schema version、單調遞增 revision、update timestamp、enabled state 同 bounded display name。Stored values 要先當成一份完整紀錄驗證，通過先可以使用。Invalid records 會退回 shipped English presentation，絕不會只套用部分欄位。

Translation resources 同 behavior 分開。L06 registry 正好擁有八個 message identifiers：`informational.saved`、`success.applied`、`progress.working`、`warning.review`、`error.failed`、`destructive.confirm`、`security.blocked` 同 `accessibility.status`。兩種語言嘅五個 funny levels 都會使用同一組 named placeholders。只要欠一個 language、level、category、message 或 factual placeholder，整份 registry validation 就會喺使用之前失敗。佢永遠唔會局部套用。Bilingual layout 亦唔會為同一個 action 造多一個可以操作嘅 control。

手寫 Cantonese source inventory 精確包含 250 個 `ui-core` entries、274 個 `ui-settings` entries，同 686 個 runtime entries。五十篇英文 documentation articles 各自啱啱好有一份廣東話 mirror。Composer 會經同一份 contract 驗證同合併 catalogs，將每篇 English article 綁定到 mirror，再嵌入一份 locale payload。精確 commands、URLs、code、dates、versions、arithmetic、identifiers 同 external facts 保持不變。School mode 會繞過 locale payload，模式結束時先恢復之前揀選嘅 language。

驚喜每次 launch 只會有一個 eligibility decision 同一個 random draw。Rerender、tab switch、settings change 或 catalog retry 都唔會再抽一次。Catalog metadata 同 photo availability 會喺呈現之前驗證。如果無法找到符合資格而且已發佈嘅 asset，啟動會照常繼續，只係唔顯示驚喜。

## 失敗情況

- 唔支援嘅 language value 會退回英文，並顯示唔阻塞嘅復原訊息。
- 完整 persisted settings validation 會拒絕超出範圍嘅 funny level。Pure presentation resolver 會防守式將暫時有限數值四捨五入，再限制喺 1 至 5；非數字值就使用已驗證 fallback。
- Message variant 一旦欠咗、改名咗或者多咗 factual placeholders，完整 registry check 就會失敗。Invalid registry 唔會被使用。
- 舊 School mode revision 唔可以蓋過較新嘅本地 revision。
- Malformed incoming shared record 會被忽略，最後一個 validated state 會繼續有效。Malformed initial record 會回到已驗證 browser base 或 shipped default。
- 如果 browser storage 無法讀取或監察，網站必須報告 live sharing unavailable，唔可以扮同步緊。明確 unavailable-state behavior 仍待 composed verification。
- Catalog image 缺漏、格式錯誤、未發佈或連唔到，都唔會拖慢啟動，亦唔會用杜撰或本地生成嘅菜式頂替。
- Reduced motion 會移除非必要嘅進場同離場動畫，但仍保留菜式名稱、圖片 alternative text 同 dismissal timing。

## 安全與私隱

Language、funny-level、dialog-emoji 同 School mode state 會留喺訪客控制嘅 browser storage。School mode name 係有長度限制嘅 plain text，永遠唔會當 markup 解讀。Personal-vocabulary contents 唔會複製到 School mode record、diagnostics、exports、history 或 public records。

School 模式係使用體驗控制項，唔係 access-control boundary。清除網站 local storage 就可以 reset，介面亦會坦白講明呢條 recovery route。驚喜只會讀 public catalog metadata 同 published public photo assets，唔會向 catalog host 傳送 visitor state、identifiers 或 measurements。

## 驗證

原始碼實作位於 `site/presentation-contract.js`、`site/app.js`、`site/security-contract.js` 同 `site/index.template.html`。已接納嘅 pure-contract run `node --test tests/site/presentation-contract.test.mjs` 回報 12 passed、0 failed、0 cancelled、0 skipped、0 todo，同埋 exit code 0。相關測試嘅完整標題係 `normalizes exact language modes and independent funny levels with School forcing English`、`keeps every message category complete across both languages and all five levels`、`normalizes the shared renameable School record and all suppression decisions`，以及 `uses an exact startup draw below ten percent and applies every suppression condition`。最後一項 runtime-binding 測試亦涵蓋精確嘅 listener registration and teardown，加埋由紅轉綠嘅 caller mutations。`tests/site/language-attention.test.mjs` 入面已接納嘅 main source-boundary run，亦喺 deliberate source-removal state 回報 0 passed 同 5 failed 之後，回報 5 passed。

Focused localization run `node --test tests/site/localization.test.mjs` 回報 5 passed、0 failed、0 skipped。佢會驗證精確 catalog counts、每一項 static visible 同 accessible English source、全部 50 個 article pairs、一條 composer 同 runtime route、technical-fact parity，同明確 hand-written inventory。刻意刪除一個 catalog entry 同漏咗一個 article locale 時，兩個 completeness checks 都會先轉紅，還原之後先重新變綠。

以上結果只係 source evidence。Source catalogs 同 article mirrors 已喺點名邊界完整，但 compact bilingual layout、每一個 rendered visible 同 accessible reference 嘅 user rename、真正 same-origin tab propagation、storage-unavailable status、完整 suppression and restoration，以及 catalog asset availability，仍然需要 composed-website interaction。

Pure-contract run 已證明 negative 同 nonfinite draw refusal、inclusive zero 同 exclusive 0.10 boundaries，以及每一個 suppression input。Main source-boundary run 已證明 Low stimulation 會到達精確嘅 `quietMode` caller field。目前 runtime 嘅 update-path argument 仍然固定為 false，所以 live update-state integration 仍待完成。One draw per launch、no opt-out control、public-catalog bilingual names、published-photo behavior、non-blocking presentation、alternative text、offline handling、reduced motion、composed interaction 同 capture evidence 仍然待完成。

## 建議文章

- [設定與外觀](settings-and-appearance.md)
- [旁白與聲音選擇](narrator-and-voices.md)
- [排程與外部設定](scheduled-settings.md)
- [瀏覽器儲存限制](../security/browser-storage-limitations.md)
