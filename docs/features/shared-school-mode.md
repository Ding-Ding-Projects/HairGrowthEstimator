# Shared School mode

## Behavior

School mode uses one versioned record in the shared local application-data area. Its enabled state, user-selected display name, and unlock reference are watched while the application is running, so a valid change made by another local application is applied without a restart.

Enabling the mode retains the application’s prior language and funny-level choices. While active, the application presents serious English and removes Cantonese, bilingual, funny-level, personal-vocabulary, and dim-sum controls, routes, search results, documentation entries, previews, and code-name changes from rendered surfaces. Disabling the mode after a successful local unlock restores the retained choices.

The main process reconciles each shared-record read through `createSchoolEffectiveState` and `reconcileSchoolRecordRead`. A valid initial record becomes the trusted baseline. If no valid baseline exists, the effective state remains restricted and reports a degraded unavailable status. Later invalid or unavailable reads retain the last valid effective state rather than replacing it with a disabled default.

The reconciliation result includes the retained `record`, `effectiveEnabled`, `status`, `availability`, `degraded`, `reason`, `publishable`, `verifiedDisable`, and `retainedLastValid` fields. `publishable` means the newly read candidate was accepted, not that the status envelope must be hidden. An enabled-to-disabled candidate is accepted only when the caller supplies verified disable evidence. Only that accepted transition sets `verifiedDisable` to `true`, which is the signal that allows the renderer to restore hidden preferences.

## Configuration

The shared record uses a bounded versioned schema with enabled state, validated display name, monotonic revision and timestamp, plus one opaque unlock reference. The application watches the shared local record live and keeps the last valid effective state when the record cannot be read or validated.

## Unlock and recovery

PIN and password enrollment are available. Credential hashes are protected by the operating system and the shared record contains only an opaque reference. Five incorrect attempts introduce a bounded delay. Passkey is represented by the strict core schema but no operating-system passkey enrollment adapter is bundled in this build, so the picker reports it as unavailable.

This is an interface convenience, not a security boundary. A user may intentionally reset it by deleting the shared local record.

## Failure modes

Invalid Unicode names, empty names, oversized records, unknown fields, stale timestamps, unsupported unlock policies, missing enrollment evidence, and a mismatched current credential are rejected without changing the shared presentation record. A display name is validated before a new credential is persisted. Invalid, unreadable, stale, revision-conflicting, or unverified-disable observations retain the last valid state and report a specific degraded reason. Degraded observations never authorize preference restoration.

## Security and privacy

The mode is an interface convenience and never claims encryption or protection from another person using the computer. Credential material stays in operating-system protected storage. The shared record, logs, exports, captures, and source contain no PIN, password, private vocabulary payload, or usable authentication value.

## Verification

Run `node --test tests/core/school-mode.test.js tests/core/school-mode-fail-closed.test.js tests/core/presentation-wave-integration.test.js tests/core/vocabulary-integration.test.js`.

## 香港粵語

School mode 用一份本機共用紀錄，開關、改名同解鎖參考會即時監察，其他本機應用做咗有效變更就唔使重新開機。開啟時會保存原本語言同搞笑程度，轉用認真英文，並由畫面、搜尋、文件、預覽同指令清單移除受限制內容。驗證後關閉，就會還原之前選擇。

共用紀錄讀取失敗、格式無效或者暫時攞唔到時，程式會保留上一份有效狀態，唔會突然當成已關閉就放返隱藏選項出嚟。若果連有效基準都未有，畫面會保持受限制，並清楚標示降級同無法讀取。只有經驗證並正式接受嘅關閉轉換，先會發出可還原偏好設定嘅訊號，唔會見到個 `false` 就即刻開閘放人。

PIN 同密碼已經可用。Passkey 資料格式已經有嚴格驗證，但今個版本未附作業系統註冊介面，所以會清楚顯示未可用，唔會整個假掣扮有料。

## Suggested articles

- [Language modes and funny levels](language-and-funny-levels.md)
- [Narrator voices and pacing](narrator.md)
- [Evidence-only data isolation](../development/evidence-data-isolation.md)
