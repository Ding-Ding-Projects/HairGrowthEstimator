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

## Verification

Run `node --test tests/core/scheduled-settings.test.js tests/core/vault-service-credentials.test.js tests/core/presentation-wave-integration.test.js`.

## 香港粵語

每條規則有固定識別碼、名稱、開關、優先次序、日期、時間、星期、IANA 時區同資料來源。開始同結束時間一樣就代表全日，跨午夜會歸入開始嗰日，結束嗰一刻唔包括在內。優先次序高嘅後套用，同分就由文件入面較後嗰條勝出。規則完咗或者來源出事，原本設定會重新出場，唔會俾臨時值霸住張櫈。

外部來源有限時、限大小、唔跟重新導向、唔收網址內憑證。Home Assistant 存取值只會放喺作業系統保護儲存，唔會塞入排程文件或者畫面狀態。

## Suggested articles

- [Language modes and funny levels](language-and-funny-levels.md)
- [Narrator voices and pacing](narrator.md)
- [Attention accommodations](attention-accommodations.md)
