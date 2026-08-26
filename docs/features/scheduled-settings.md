# Scheduled settings

## Behavior and precedence

Each rule stores a stable identifier, label, enabled state, priority, optional inclusive date bounds, start and end times, day mode, weekdays, an IANA timezone, and one source. Equal start and end times cover the full local day. Cross-midnight windows belong to the local day on which they start, and the end boundary is exclusive.

Matching rules apply from low to high priority. Later document order wins a priority tie. When a rule ends or fails, the unchanged base setting becomes visible again. The editor and source responses use the same bounded schema.

## Sources

- Local sources carry validated settings directly.
- API sources require HTTPS, except exact loopback HTTP, and return `{"schemaVersion":1,"settings":{...}}`.
- Home Assistant sources use a validated `binary_sensor` or `input_boolean`. `on` activates the rule’s local settings and `off` leaves the base or another matching rule in effect.

External requests reject redirects, embedded URL credentials, unsupported protocols, unknown settings, malformed JSON, responses larger than the configured limit, and requests beyond the timeout. Home Assistant access values are stored under an exact canonical source scope in operating-system protected storage. They are never placed in the schedule document or renderer state.

Each external rule’s bounded refresh interval participates in the live refresh timer. Generation checks prevent an older response from replacing a newer evaluation. A rejected refresh keeps the last valid scoped result or the base setting.

## Network destination policy

`app/core/network-policy.js` defines the pure policy that the privileged request boundary must apply after resolving a scheduled source and before opening its connection. Resolution uses the operating system resolver with every answer requested in verbatim order. The policy validates the complete answer set, then produces an immutable lookup and connection plan. A caller must connect through that pinned lookup instead of resolving the hostname again. This keeps a second DNS answer from silently changing the destination between validation and connection.

Public HTTPS is the default scope. Every resolved address must be globally reachable. The whole resolution is rejected if even one answer is loopback, RFC 1918 private use, IPv6 unique-local, link-local, a known metadata-service address, unspecified, multicast, reserved, documentation, benchmarking, IPv4-mapped IPv6, malformed, duplicated, or paired with the wrong address family. Noncanonical numeric hostname forms such as a single integer, hexadecimal IPv4, octal components, or shortened IPv4 are rejected before URL normalization can reinterpret them.

Two narrow approvals are supported outside the public default:

- A loopback approval binds one exact canonical scheduled-source scope, one exact origin, and one exact set of loopback addresses. It is the only approval that can permit HTTP.
- A private-LAN approval binds the same three boundaries and permits only RFC 1918 IPv4 or IPv6 unique-local addresses over HTTPS.

Loopback approval is derived only from an exact saved loopback source after every resolver answer is confirmed as loopback. Private-LAN approval is separate from the schedule document and renderer state. When the user stores a Home Assistant access value for a private destination, the main process shows a local decision dialog containing the exact origin and complete resolved address set. Approval is stored atomically in `scheduled-network-approvals.json` under the private application-data directory. The file uses schema version 1, permits at most 64 records and 16 addresses per record, and is fully revalidated on every read. It contains approval metadata only, never the Home Assistant access value.

A later resolver answer must match the approved address set exactly. Added, removed, or changed addresses stop the connection and require another local decision. A declined decision stores neither approval nor access value. Replacing an approval first removes the old exact binding, so a failed replacement leaves the source unapproved instead of silently retaining authority for an address set the user just replaced.

An approval cannot be reconstructed by copying its visible fields, reused for a sibling path or source, widened by another DNS answer, or used for link-local, metadata, multicast, mapped, unspecified, or reserved addresses. The privileged boundary creates an approval only after the user has deliberately selected the bounded local destination.

Every HTTPS plan keeps certificate verification enabled, verifies the certificate against the original canonical hostname, and supplies that DNS hostname for Server Name Indication. An IP-literal URL is pinned to that exact literal and is verified as an IP identity. Every plan rejects redirects with `redirect: "error"` and a zero-redirect limit.

For Home Assistant, the plan derives the request URL from the normalized base URL and entity identifier. Its credential binding contains only the protected-store reference, the exact canonical source scope, the exact request origin, and the exact request URL. Credential values are neither accepted by the policy input nor returned in a plan or error.

### Failure behavior

The policy fails closed when resolution is empty or exceeds 16 answers, any answer is unsafe, an approval is missing or mismatched, an IP literal resolves to another address, the URL is noncanonical, TLS requirements are weakened, or a pinned lookup is asked to resolve another hostname. A rejected request retains the last valid scheduled result or the unchanged base settings. Policy errors use stable codes and fixed messages that do not echo URL credentials or access values.

The pure module does not resolve DNS or open sockets itself. The privileged request boundary owns those effects, passes the resolver’s complete `{ address, family }` result into `createScheduledSourceNetworkPlan()`, uses `createPinnedLookup()` for the connection, verifies the connected socket address against that plan, keeps the original hostname for certificate verification, and refuses every redirect response.

## Verification

Run `node --test tests/core/network-policy.test.js tests/core/network-approvals.test.js tests/core/scheduled-settings.test.js tests/core/vault-service-credentials.test.js tests/core/release-blockers-integration.test.js tests/core/presentation-wave-integration.test.js`.

The focused network-policy suite deliberately starts red before the module exists, then covers every address category, mixed safe and unsafe DNS answers, empty and oversized resolutions, exact loopback and private-LAN approvals, forged and widened approvals, numeric aliases, TLS identity requirements, zero redirects, Home Assistant credential binding, secret non-reflection, and the immutable pinned lookup.

Primary references:

- [Node.js DNS lookup options and complete-answer behavior](https://nodejs.org/api/dns.html#dnslookuphostname-options-callback)
- [Node.js TLS hostname verification](https://nodejs.org/api/tls.html#tlscheckserveridentityhostname-cert)
- [IANA IPv4 Special-Purpose Address Space](https://www.iana.org/assignments/iana-ipv4-special-registry)
- [IANA IPv6 Special-Purpose Address Space](https://www.iana.org/assignments/iana-ipv6-special-registry)
- [RFC 1918 private IPv4 address space](https://www.rfc-editor.org/rfc/rfc1918.html)
- [RFC 3927 IPv4 link-local address space](https://www.rfc-editor.org/rfc/rfc3927.html)

## 香港粵語

每條規則有固定識別碼、名稱、開關、優先次序、日期、時間、星期、IANA 時區同資料來源。開始同結束時間一樣就代表全日，跨午夜會歸入開始嗰日，結束嗰一刻唔包括在內。優先次序高嘅後套用，同分就由文件入面較後嗰條勝出。規則完咗或者來源出事，原本設定會重新出場，唔會俾臨時值霸住張櫈。

外部來源有限時、限大小、唔跟重新導向、唔收網址內憑證。Home Assistant 存取值只會放喺作業系統保護儲存，唔會塞入排程文件或者畫面狀態。

網絡目的地預設只接受公開 HTTPS。解析主機名之後，所有地址都要逐個驗證，有一個係迴環、私人網段、link-local、metadata、未指定、多播、保留、IPv4-mapped IPv6，或者古怪數字別名，成批都會拒絕。唔會見到一個正常地址就當其餘地址冇事。

迴環同私人 LAN 要另外建立精確批准，綁死來源範圍、origin 同地址清單。迴環批准先可以用 HTTP，私人 LAN 仍然要 HTTPS。link-local 同 metadata 地址無論如何都唔會放行。連線會用驗證過嘅固定 lookup 結果，唔會臨開 socket 又重新問 DNS。HTTPS 會保留原本主機名做證書核對，重新導向一律拒絕。

私人 LAN 批准唔會寫入排程文件或者 renderer 狀態。用戶儲存私人 Home Assistant 存取值之前，主程序會顯示本機確認對話框，列明精確 origin 同完整地址清單。批准紀錄會獨立原子寫入私人應用資料，真正存取值仍然只留喺作業系統保護儲存。DNS 地址清單有任何增加、刪除或者改變，都會停止連線並要求重新確認。取消確認就唔會儲存批准或者存取值。

Home Assistant 嘅憑證綁定只包含保護儲存參照、精確來源範圍、request origin 同 request URL。真正存取值唔會進入 policy input、結果或者錯誤訊息。純 policy 模組唔會自己查 DNS 或者開 socket，主程序邊界要接好完整解析、固定 lookup、TLS 核對同零重新導向先算完成。

## Suggested articles

- [Language modes and funny levels](language-and-funny-levels.md)
- [Narrator voices and pacing](narrator.md)
- [Attention accommodations](attention-accommodations.md)
