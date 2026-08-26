# 發佈同封裝

呢個分類記錄 Hair Growth Estimator 點樣重現 build、製作 Windows 安裝程式、輸出 OCI container archive、bootstrap dependencies、自動發佈，同埋保留完整性證據。

## 文章

- [Dependency inventory 同 bootstrap](dependency-inventory.md)
- [Windows 程式同 Squirrel.Windows 封裝](windows-packaging.md)
- [OCI container 封裝](container-packaging.md)
- [GitHub Actions 發佈自動化](automation.md)
- [GitHub Pages 部署](pages-deployment.md)
- [Provenance、完整性同程式碼行數證據](provenance-and-integrity.md)

## 支援嘅發佈產品

| 產品 | 平台 | 格式 | 主要證據 |
| --- | --- | --- | --- |
| 桌面程式 | Windows x64 | 可直接執行嘅封裝目錄 | `dist/package/packaged-app-manifest.json` |
| 桌面安裝程式 | Windows x64 | 真正 Squirrel.Windows `Setup.exe`、`RELEASES` 同完整 `.nupkg` | `dist/squirrel-windows/release-manifest.json` |
| 頭髮長度服務 | Linux amd64 | OCI image layout tar archive | `dist/container/container-manifest.json` |

所有 Windows executable 都係刻意唔簽名。Windows 可能會顯示 unknown-publisher 或 SmartScreen 警告。發佈流程絕對唔會搵、要求、產生或使用 code-signing certificate，唔會突然變魔術師喺帽入面拎張證書出嚟。

## 發佈 workflow 形狀

Workflow 會喺每次 push 同每次 `workflow_dispatch` 呼叫時執行。每次 run 都會按以下準確次序行一條有四個 job 嘅發佈路徑：

1. `windows-package` build 同驗證可執行嘅 Windows 程式，以及完整 Squirrel.Windows 系列。
2. `linux-container` 喺 Windows 產品可用之後，build 確定性 Linux OCI archive。
3. `publish-release` 驗證兩份轉移產品，然後發佈一個獨一無二、非 draft 嘅 release。
4. `finalize-release` 做唯讀驗證，而 terminal completion timing 仍然如實標示為 pending。

成功嘅 workflow run 到達 terminal state 之後，已提交嘅 post-run wrapper 只會修補同一個 release 一次，並喺 `dist/terminal-transfer` 下面輸出網站可安全接手嘅資料。早期 task branch 嘅 push 發生喺 workflow 支援所有 push 之前，當時冇建立 run，所以唔可以後補扮成 release evidence。

第一個 release 冇上一份完整 package，所以會準確包含一份完整 Squirrel package，而唔會有 delta package。之後每個 release 都必須由已設定嘅較早非 draft release，取得一份獨立驗證過嘅上一代完整 package，先可以產生 delta。上一代 release evidence 如果缺失、有歧義或者對唔上，流程會 fail closed，唔會靜靜雞發佈一條後續 full-only update feed。

## 失敗時點處理

Build scripts 一遇到未解決嘅 dependency、封裝、provenance、icon、簽名政策或者完整性問題，就會用 nonzero 結束。單靠 packaging command 成功未夠。每個產品仲要通過已提交嘅 validator，並產生自己嘅 manifest，先可以擺入 release staging，唔可以靠一個綠色 exit code 戴假髮。

## 安全摘要

- Tool archives 同 executable build helpers 都有固定 SHA-256 值。
- npm dependencies 會按 `package-lock.json` 安裝，並驗證完整性。
- Windows code signing 已停用，亦會驗證 Authenticode certificate table 確實不存在。
- Release builds 由乾淨 commit 開始，並將封裝 bytes 同嗰個準確 commit 嘅 Git blobs 比對。
- Service image 使用 digest-pinned base、non-root account，同已記錄嘅 read-only runtime 限制。
- Release publication 只會 stage allowlist 入面、已經驗證過嘅檔案。

## 建議文章

- [GitHub Actions 發佈自動化](automation.md)
- [Provenance、完整性同程式碼行數證據](provenance-and-integrity.md)
