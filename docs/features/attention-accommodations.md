# Attention accommodations

## Behavior

Five accommodations are independently persisted and off by default:

- Focus dims non-active regions without hiding content.
- Low stimulation quiets color, scripted motion, transient informational notices, and narration.
- Time awareness reports exact session time and time since a meaningful change.
- One thing at a time stores one user-selected next action.
- Momentum presents a neutral prompt after 40 unchanged minutes and respects Not now for one hour.

These are interface accommodations. They do not diagnose, assess, advise, score, rank, count streaks, or imply a medical benefit.

Operating-system reduced motion independently stops scripted progression and settles animated color. It does not silently enable low-stimulation colors or notification suppression.

## Configuration

Each accommodation is an independent persisted Boolean and defaults to off. The next action is a bounded user-entered string. Momentum uses a 40 minute inactivity threshold and a one hour dismissal. Reduced motion remains an operating-system preference and is never overwritten by these controls.

## Failure modes

Invalid timestamps return to bounded current-time defaults. Future timestamps never produce negative elapsed values. The next action is trimmed and bounded. Momentum dismissal accepts only a bounded duration and never resets the other four accommodations.

## Security and privacy

All accommodation state stays local. The feature does not infer a diagnosis, send activity facts over the network, compute a score, or expose private work content through notifications or exports.

## Verification

Run `node --test tests/core/delight-attention.test.js tests/core/presentation-wave-integration.test.js tests/core/accessibility.test.js`.

## 香港粵語

聚焦、低刺激、時間提示、一次一件事同動力提示可以獨立開關，預設全部關閉。聚焦只會淡化，唔會收藏內容。低刺激會收靜顏色、動態、非必要提示同旁白。時間提示只報實際分鐘，唔會催你。一次一件事保存由你揀嘅下一步。動力提示喺 40 分鐘冇變更後出現，按「遲啲先」就安靜一個鐘。

呢啲只係介面輔助，唔做診斷、評估、建議、分數、排名或者連勝紀錄。

## Suggested articles

- [Narrator voices and pacing](narrator.md)
- [Language modes and funny levels](language-and-funny-levels.md)
- [Scheduled settings](scheduled-settings.md)
