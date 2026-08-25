# 私隱同資料邊界

## 運作方式

量度、剪髮日期、備註、設定同訪客偏好，預設都會留喺本機。桌面狀態放喺產品嘅私人 user-data directory，服務狀態放喺已設定嘅 JSON data file，網站偏好就放喺訪客嘅瀏覽器 profile。同源網站分頁只會交換 shared origin 嘅 browser storage event，唔會將訪客狀態經 network 傳走。

## 設定

Network synchronization 只會喺使用者選擇加入，並設定 HTTP 或 HTTPS service URL，或者 local SSH forward 之後啟用。Non-loopback service mode 需要 API key。Allowed browser origin 必須係精確設定值。

網站會喺 template HTML 交付一份靜態 Content Security Policy。當中包括 `default-src 'self'`、`script-src 'self'`、`worker-src 'self'`、`connect-src 'self' http://127.0.0.1:11434 http://localhost:11434`、`object-src 'none'`、`frame-src 'none'`、`base-uri 'none'` 同 `form-action 'self'`。Image source 只限 same-origin、data image，同已有文件記錄嘅公開 GitHub asset host。Served-header verification，同埋證明每份 composed resource 喺呢份 policy 下仍然可用，目前仍然待辦。

Browser state 同 appearance import 都會經 strict JSON parsing、complete schema validation、allowlisted field、bounded array and string、unsafe-key rejection，同埋喺 persistence 之前建立新 sanitized state。Saved Ollama state 只可以使用 runtime 同 Content Security Policy 容許嘅同樣兩個精確 loopback origin。General export 使用 positive allowlist，所以日後新加入嘅 live-state field 會保持排除，直至佢獲得明確 privacy 同 representation decision。JSONL haircut convenience row 只會來自已經遮走敏感資料嘅 `record.state.haircuts` array，永遠唔會直接由 live state 建立。

## 失效情況

- 使用者清除瀏覽器儲存時，會失去只屬於網站嘅 preference、lock、local history 同 authenticator data。
- 偵測到較新 revision 之後，過時同源分頁嘅 mutation 會被拒絕。較新 state 會取代較舊 view，訪客要重新執行仍然需要嘅改動。
- 無效 desktop JSON state 目前會退回 default，而且唔會保留無效檔案。
- Server data-file read failure 可能令 request 無法處理。
- Private-LAN publishing 設定錯誤，可能會將 service 暴露到原定 interface 之外。
- Content Security Policy 缺少或者被削弱，可能擴大 injected markup 或 compromised same-origin file 帶來嘅影響。
- Import 或 export 時使用 broad object copying，可能令日後新增嘅 sensitive field 未經明確決定就跨越邊界。

## 保安同私隱

唔好將 API key、SSH key、personal vocabulary content 或 metadata、custom image byte、authenticator secret 或 private path 放入 source、log、capture、issue、release note、analytics 或 ordinary export。Desktop main process 會喺作業系統 encryption 可用時，將 service API key 分開儲存。網站冇同等嘅作業系統 vault。網站嘅 CSV 同 TSV export 會由已經遮走敏感資料嘅 positive-allowlist record 正規化而成，亦會喺每一 row 重複 omission list 同 representation description。

網站嘅 10 percent startup surprise 會引用 project-approved public dim-sum catalog 入面 `hk-dish-0001` 嘅 image，唔會將嗰張 image 複製入呢個 repository。Request 唔會帶 measurement、profile identifier、credential 或 analytics parameter。八張 hair-length reference photograph 使用另一條邊界，屬於由 `assets/hair-growth/stages.json` 映射嘅 local build asset。

## 驗證

原始碼檢查確認 separate API-key storage、URL credential rejection、non-loopback mode service authentication、bounded request body、no record-body logging、normalized tabular privacy metadata、由 `record.state.haircuts` 建立 JSONL、monotonic same-origin revision、stale-write refusal、explicit browser-storage warning、exact Ollama origin alignment，同埋 static Content Security Policy。`site/security-contract.js` 提供嚴格 `parseJsonStrict`、`validateBrowserState`、`validateAppearanceMap`、`sanitizeImportedState`、`validateStoredStateEnvelopeText`、巢狀 `validateOllama` 同 positive-allowlist `buildRedactedExportState` 邊界。Active state、appearance、vocabulary、storage-envelope 同 export consumer 都會呼叫呢啲邊界。聚焦 hardening test 涵蓋 JSONL allowlist 同 Ollama origin source boundary，而聚焦 serializer test 會驗證目前 record 嘅 CSV 同 TSV privacy omission。完整 built import behavior、corrupt-state recovery、policy response inspection、anonymous catalog-asset request、privacy capture 同 end-to-end network evidence 仍然待辦。

## 建議文章

- [瀏覽器儲存限制](browser-storage-limitations.md)
- [私人 LAN 託管](../operations/private-lan.md)
- [SSH tunnel](../operations/ssh-tunnels.md)
