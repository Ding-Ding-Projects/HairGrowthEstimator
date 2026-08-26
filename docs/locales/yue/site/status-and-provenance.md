# 狀態同組建溯源

## 運作方式

網站初始畫面必須顯示實際執行緊嘅版本，同埋屬於嗰個版本、已有紀錄嘅本地更新日期與時間，包括秒數同時區。數值必須來自同已組合網站 artifact 綁定嘅溯源資料。啟動時間、原始檔修改時間，或者人手填落去嘅時間戳，都唔算有效溯源，唔可以魚目混珠。

網站亦需要一個狀態介面，列出目前 release、最近一次已驗證 build、已知限制、證據連結，同埋誠實標示仍然 pending 嘅狀態。

## 設定

Build composition 會寫入兩種明確 provenance source 其中一種。Terminal transfer 唔存在時，就產生 tracked package version 加 commit time，而且冇 installer。完整 terminal transfer 只有喺四份 local records、copied hashes、起始 context identity、獨立而成功嘅 GitHub Actions terminal-attempt identity、GitHub release metadata 同 downloaded Setup bytes 全部通過驗證之後，先會產生精確 terminal release version 加 canonical publication time。初始畫面會將已記錄 timestamp 本地化顯示，同時保持底層 instant 不變。

## 失效情況

- 缺少或者無效嘅 provenance 會顯示 unavailable 狀態。
- Release manifest、context、receipt、exact commit 或 external release readback 只要有一項唔一致，就唔可以作出 verified 聲明。Static package metadata 唔係 release identity。
- 冇真實來源支持嘅 status value 必須保持 unverified。
- 瀏覽器本機 visitor setting 唔可以改動 artifact provenance。

## 保安同私隱

Provenance 可以包含公開嘅 source commit、version 同 release timing。佢必須排除 private path、host name、user name、environment value、secret 同 build-machine inventory。

## 驗證

Front-screen selector、embedded JSON placeholder、semantic version、timestamp、commit 同 source validation、包含秒數同時區嘅 local-time formatting、installer validation 同 status-panel rendering 已經存在於原始碼。`scripts/compose-site.mjs` 而家會由已驗證 terminal installer 衍生 release-bound version 同 updated-at，唔會將 static package metadata 當 release identity。四項 focused terminal checks 先刻意 red 4 of 4，還原之後就有 4 passed、0 failed、0 skipped。冇 transfer 嘅 ordinary composition 亦通過，並保留 `installer: null`。真實 terminal-release composition、built-site interaction、capture 同 public response inspection 仍然待辦。

## 建議文章

- [版本同組建溯源](../operations/version-provenance.md)
- [發佈、安裝同更新](../operations/release-install-and-updates.md)
- [狀態中心邊界](../security/status-hub-boundaries.md)
