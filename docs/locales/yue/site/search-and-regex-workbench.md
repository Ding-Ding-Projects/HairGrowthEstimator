# 搜尋同 regex 工作台

## 運作方式

網站每個搜尋欄都必須以 plain-text search 做預設，並提供屬於自己、直接相鄰而且 anchored 嘅完整 regex builder。Builder 使用瀏覽器嘅 JavaScript regular-expression engine，亦必須標明 engine、dialect、supported flag、supported 同 unsupported construct、escaping rule，以及 bounded evaluation behavior。

完整工作台涵蓋 guided 同 raw construction、explanation、token annotation、live match、capture table、replacement preview、expected-match test case、saved snippet、import 同 export、match navigation、zero-width match、bounded timing、backtracking-risk warning、adversarial-input warning，以及 bounded trace；如果 tracing unavailable，就要提供確實解釋，唔可以留低一個神秘黑洞。

## 設定

每個搜尋欄都擁有自己嘅 query、pattern、flag、validation 同 mode。State 永遠唔可以喺 global search、menu filter、dropdown filter、tab search、settings search、history search 或其他 owner 之間漏來漏去。Pattern 同 sample limit 必須明確，亦要喺 evaluation 之前強制執行。

Regular-expression evaluation 會喺專用本機 Worker `site/regex-worker.js` 入面執行，唔會塞住主要 interface thread。`site/regex-client.js` 提供 `createRegexWorkerClient`，包括 bounded concurrency 同 queueing、每個 request 都用 disposable Worker、response identifier、cancellation、deadline，以及每條 settlement path 都會 termination。如果 Worker construction throw，client 會先釋放 active slot，再 reject request，之後繼續處理 queued work。如果 `postMessage` throw，共用 settlement path 會 terminate Worker、釋放 active slot、pump queue，並只 reject 該 request 一次。Worker 會限制 pattern、sample、replacement、test case、batch、match count 同 response size，而且冇 DOM authority。`runRegexWorkbench` 使用 Worker `scan` operation。`filterSearchItems` 預設保留本機 plain-text matching；啟用 regex 嘅 owner search 就會經 Worker `testMany` operation，用 bounded batch 執行，並設有 per-owner cancellation 同 stale-generation refusal。Worker creation failure 只會停用 regex evaluation，唔會退回 synchronous construction。靜態 Content Security Policy 只容許本機 Worker source。Built interaction 仍然 pending。

## 失效情況

- Invalid syntax 必須保留使用者輸入，並顯示 inline error。
- Unsupported construct 會繼續顯示，並附上確實 engine explanation。
- Empty 同 zero-width match 必須安全前進並終止。
- Evaluation 超出界限時必須停止，並回報冇產生結果。
- Timed-out 或 malformed Worker response 必須先 terminate 該 Worker，之後先開始另一個 evaluation。
- Worker creation failure 必須保持介面可用，並回報 bounded evaluation unavailable。佢唔可以退回 synchronous regular-expression execution。
- Worker construction 或 `postMessage` failure 必須 reject 受影響 request 並釋放 queue capacity，確保之後嘅 valid request 唔會畀漏咗嘅 active slot 阻塞。
- Empty result 必須顯示有名稱嘅 no-match state，唔可以得個空白框叫人估。

## 保安同私隱

Pattern 同 sample text 只會喺本機 evaluation，除非使用者明確 save，否則唔會傳送或持久儲存。Evaluation 必須有界限，以減低 regular-expression denial-of-service risk。Worker message 只會帶 bounded pattern、flag、sample、replacement、expected case 同 generated request identifier。佢哋唔可以包含 visitor state、credential、file path，或者 selected sample 以外嘅 DOM content。

## 驗證

瀏覽器原始碼實作咗獨立 owner record、plain 或 regex mode、pattern 同 sample bound、flag filtering、structured token explanation、由 Worker 支援嘅 live match 同 capture、replacement preview、expected outcome、copy、strict JSON snippet import、export、elapsed timing、heuristic backtracking warning，同 Worker construction 或 message-send refusal 後嘅 queue recovery。原始碼檢查只喺 `site/regex-worker.js` 發現 regular-expression constructor；`site/app.js` 會將 `runRegexWorkbench` 同 `filterSearchItems` 經 `createRegexWorkerClient` 執行，而且冇 synchronous regular-expression fallback。Focused hardening test 涵蓋 construction path 被拒絕後嘅 bounded Worker recovery。Guided construction、完整 engine capability matrix、saved snippet management、match navigation、trace support 同 built-site interaction evidence 仍然未完成。

## 建議文章

- [分頁導覽](tabbed-navigation.md)
- [設定同外觀](settings-and-appearance.md)
- [Regex builder ownership inventory](../inventory/regex-builders.md)
