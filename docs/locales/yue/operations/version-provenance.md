# 版本同建置來源資料

## 行為

每個首個畫面都必須顯示正在執行嘅版本，以及同一個版本記錄嘅 updated-at 本機日期同時間，當中包括秒數同時區。桌面版本來自套件或封裝後應用程式中繼資料。網站版本來自佢嘅組合成品資訊清單。時間戳記來自綁定到該成品嘅建置或發佈來源記錄。

## 設定

有效 provenance record 包含 schema version、product version、source commit、UTC build 或 release instant、artifact identity，同埋嗰項聲明嘅來源。冇 terminal transfer 時，網站會使用 tracked package metadata 同 commit time，亦唔會嵌入 installer。有已驗證 terminal transfer 時，version 來自 immutable installer 同相符 release context，而 updated-at 就來自 canonical `publication.publishedAt`。顯示層會將穩定時點轉成本機時間，並指出時區。

## 失敗情況

- 缺少、無效、過時或者不相符嘅來源資料會顯示不可用狀態。
- 啟動時間、檔案時間戳記、目前時鐘值同手動輸入標籤都係無效替代品。
- 如果 release 嘅 terminal manifest、context、transfer receipt、exact commit 或 GitHub readback 有任何不一致，就唔可以聲稱 front-screen value 已驗證。Tracked `1.0.0` source version 唔會令已驗證 `1.0.<run number>` terminal release 失效。

## 安全同私隱

來源資料係公開發佈證據，必須排除私人路徑、機器名稱、使用者名稱、內部網絡詳情、秘密資料、環境值同未刪減建置日誌。

## 驗證

原始碼檢查已確認 `scripts/compose-site.mjs` 同時支援坦白嘅 package-and-commit fallback，同固定 four-file terminal path。Release-bound path 會驗證 closed schemas、精確 copied hashes、完整 nested source bindings、run identity、target commit、release metadata 同 downloaded Setup bytes，之後先衍生 version 同 updated-at。網站 `renderProvenance` consumer 會驗證 semantic version、commit、source、timestamp 同 installer agreement，喺 `#front-provenance` 顯示包含秒數同時區嘅本機時間，驗證失敗亦會如實顯示 unavailable state。Focused terminal suite 先刻意 red 4 of 4，還原之後就有 4 passed、0 failed、0 skipped。真實 terminal release、built interaction、captures 同 deployed-response proof 仍然待辦。

## 建議文章

- [狀態同建置來源資料](../site/status-and-provenance.md)
- [發佈、安裝同更新](release-install-and-updates.md)
- [網站通用功能清單](../inventory/site-universal-features.md)
