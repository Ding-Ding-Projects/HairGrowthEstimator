# Shared School mode

## Behavior

School mode uses one versioned record in the shared local application-data area. Its enabled state, user-selected display name, and unlock reference are watched while the application is running, so a valid change made by another local application is applied without a restart.

Enabling the mode retains the application’s prior language and funny-level choices. While active, the application presents serious English and removes Cantonese, bilingual, funny-level, personal-vocabulary, and dim-sum controls, routes, search results, documentation entries, previews, and code-name changes from rendered surfaces. Disabling the mode after a successful local unlock restores the retained choices.

## Unlock and recovery

PIN and password enrollment are available. Credential hashes are protected by the operating system and the shared record contains only an opaque reference. Five incorrect attempts introduce a bounded delay. Passkey is represented by the strict core schema but no operating-system passkey enrollment adapter is bundled in this build, so the picker reports it as unavailable.

This is an interface convenience, not a security boundary. A user may intentionally reset it by deleting the shared local record.

## Failure behavior

Invalid Unicode names, empty names, oversized records, unknown fields, stale timestamps, unsupported unlock policies, missing enrollment evidence, and a mismatched current credential are rejected without changing the shared presentation record. A display name is validated before a new credential is persisted.

## Verification

Run `node --test tests/core/school-mode.test.js tests/core/presentation-wave-integration.test.js tests/core/vocabulary-integration.test.js`.

## 香港粵語

School mode 用一份本機共用紀錄，開關、改名同解鎖參考會即時監察，其他本機應用做咗有效變更就唔使重新開機。開啟時會保存原本語言同搞笑程度，轉用認真英文，並由畫面、搜尋、文件、預覽同指令清單移除受限制內容。驗證後關閉，就會還原之前選擇。

PIN 同密碼已經可用。Passkey 資料格式已經有嚴格驗證，但今個版本未附作業系統註冊介面，所以會清楚顯示未可用，唔會整個假掣扮有料。

## Suggested articles

- [Language modes and funny levels](language-and-funny-levels.md)
- [Narrator voices and pacing](narrator.md)
- [Evidence-only data isolation](../development/evidence-data-isolation.md)
