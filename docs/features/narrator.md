# Narrator voices and pacing

## Behavior

The narrator is off by default. English and Cantonese have separate installed-voice pickers keyed by each platform voice’s stable `voiceURI`. Each picker includes an automatic choice, refreshes after delayed voice enumeration, retains a saved voice that is no longer installed, and reports the effective fallback. Network-backed voices are identified because they may be silent while offline.

Both-language narration serializes English before Cantonese. The queue replaces a superseded pending event rather than stacking repeated copies. Per-category cooldowns limit ordinary repetition, while errors are never suppressed by the cooldown. Rate is bounded from 0.1 through 10 and pitch from 0 through 2.

## Configuration

Narration has an explicit enabled switch, one stable voice selection per language, an automatic fallback option, bounded rate and pitch controls, a language order, and quiet integration with low-stimulation and assistive-technology state. Settings persist locally and never hard-code a named installed voice as the default.

## Accessibility coexistence

The main process reports operating-system accessibility support and publishes changes to the renderer. Narration cancels and pauses while that signal or the user’s persisted assistive-technology quiet signal is active. Low-stimulation mode also suppresses narration.

## Failure modes

The interface distinguishes loading, no voice for a language, selected voice present, selected voice not installed, network-backed fallback, and speech synthesis unavailable. Missing language voices suppress only that language rather than claiming speech occurred.

## Security and privacy

Narration receives only the final bounded text selected for speech. Voice identities and settings stay local. The queue does not transmit text, voice metadata, credentials, private paths, or application records to a project service.

## Verification

Run `node --test tests/core/narrator.test.js tests/core/presentation-wave-integration.test.js`.

## 香港粵語

旁白預設關閉。英文同粵語各自揀已安裝聲線，用穩定 `voiceURI` 保存，聲線清單遲到都會再更新。已保存聲線唔見咗唔會偷偷重設，介面會保留選擇同講清楚實際後備聲線。雙語會先英文後粵語排隊講，重複舊訊息會換走，唔會疊到成條聲音塞車。

作業系統無障礙支援啟動，或者用戶開咗輔助技術安靜訊號時，旁白會立即停止同暫停。冇適合聲線就老實講，唔會靜雞雞扮讀完。

## Suggested articles

- [Language modes and funny levels](language-and-funny-levels.md)
- [Attention accommodations](attention-accommodations.md)
- [Scheduled settings](scheduled-settings.md)
