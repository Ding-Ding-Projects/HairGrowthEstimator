# Language modes and funny levels

## Behavior

The presentation core supports English, playful Hong Kong-style Cantonese, and bilingual output. Bilingual messages keep English as the primary segment and Cantonese as a separate secondary segment. English and Cantonese each have an independent persisted funny level from 1 through 5, both defaulting to 5.

The core explicitly covers informational, success, progress, warning, error, destructive, security, accessibility, and notification messages. Funny levels change the surrounding voice only. Factual values, identifiers, dates, counts, destinations, and failure reasons remain present.

The hand-written corpus covers every current static renderer source and every inventoried renderer-generated presentation boundary. Its 515 unique markup sources include visible text, accessible names and descriptions, placeholders, alternative text, and visible input defaults. Another 288 rows cover command, settings, search, palette, notification, error, status, and dynamic renderer copy. All 15 bundled articles provide complete English and Cantonese bodies at both funny-level extremes. Bilingual mode composes the selected English and Cantonese variants without altering factual values.

Unknown text that arrives at runtime from a provider remains in its original form. Technical values, commands, URLs, paths, identifiers, version facts, and provider-authored fields are deliberately preserved instead of receiving a guessed translation.

## Configuration

- `settings.language`: `en`, `yue`, or `bilingual`
- `settings.funnyEnglish`: integer 1 through 5
- `settings.funnyCantonese`: integer 1 through 5

Scheduled overrides use the same validated values and do not overwrite the stored base settings.

## Failure modes

Unknown message keys, unsupported modes, out-of-range levels, missing factual placeholders, extra fields, structured facts, accessors, and non-finite values are rejected. Rendering produces plain text rather than privileged markup.

## Security and privacy

Rendering is local and consumes only validated presentation data. Technical tokens and provider-authored facts are preserved verbatim, while rejected inputs produce no partial translation, privileged markup, telemetry, or network request.

## Verification

Run `node --test tests/core/presentation.test.js tests/core/presentation-corpus.test.js tests/core/presentation-wave-integration.test.js`.

The corpus test independently extracts the current case-sensitive markup sources rather than trusting the registry to discover itself. It also pins each dynamic row to its renderer source, checks the 71 notification and error call-site lines and their 91 semantic strings, and deliberately proves that entry deletion and Cantonese locale omission turn the test red.

## 香港粵語

顯示核心支援英文、香港粵語同雙語。雙語會先放英文，再用獨立一段顯示粵語。英文同粵語各有自己嘅 1 至 5 級搞笑程度，預設都係 5。資料、成功、進度、警告、錯誤、刪除、安全、無障礙同通知訊息全部有明確語氣框架，數字、日期、識別碼同錯誤原因就原封不動。

手寫語料庫已經包晒目前 515 個獨立靜態畫面字串、288 個由 renderer 產生嘅語意字串，同 15 篇完整內置文章。可見文字、無障礙名稱同描述、設定、搜尋、指令面板、通知同錯誤全部有英文、香港粵語同雙語路徑，亦有 1 級同 5 級來源。外來供應者文字、指令、網址、路徑、識別碼同技術事實就會保持原樣，唔會夾硬作翻譯。

## Suggested articles

- [Shared School mode](shared-school-mode.md)
- [Narrator voices and pacing](narrator.md)
- [Scheduled settings](scheduled-settings.md)
