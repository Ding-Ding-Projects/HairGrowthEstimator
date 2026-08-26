# 依賴清單同 bootstrap

`dependencies.manifest.json` 係本機 builds 同全部 release jobs 嘅可審計依賴清單。`download-dependencies.bat` 會讀呢份 manifest、安裝去 user-scoped locations，而且唔需要 machine-wide Node.js installation。

## 精確本機 toolchain

| 依賴 | 版本或 identity | 驗證 |
| --- | --- | --- |
| Git for Windows MinGit x64 | `2.55.0.windows.2` | 官方 archive SHA-256，加埋兩個已安裝 `git.exe` 嘅 SHA-256 values |
| Node.js portable Windows x64 | `22.18.0` | 官方 archive SHA-256 `c95d8a7e1c99e669cc08c9f1176e068c1f50847c37908fcb8c35b62482366511`，加埋已安裝 executable SHA-256 |
| npm | `10.9.3` | Node.js 22.18.0 隨附嘅 exact version |
| npm dependency graph | `package-lock.json` | 執行 `npm ci` 時嘅 npm lockfile integrity |
| Electron | `44.0.0` | Exact direct package version、官方 archive SHA-256，同埋已安裝 `electron.exe` 嘅 SHA-256 |
| electron-builder | `26.15.3` | Exact direct package version |
| electron-builder-squirrel-windows | `26.15.3` | Exact direct package version |
| `@electron/asar` | `4.3.0` | Exact direct package version |
| `sharp` | `0.34.3` | Exact direct package version |
| `resedit` | `1.7.2` | Exact direct package version |
| 隨附 Squirrel 7-Zip x64 executable | Package-supplied binary | SHA-256 `c7245e21a7553d9e52d434002a401c77a7ca7d0f245f2311b0ddf16f8f946c6f` |
| 隨附 Windows resource editor | Package-supplied binary | SHA-256 `e2df7b664db830f159d0dc6b3da8a95442cca175b9577f2d19952646d37ac32f` |
| 隨附 Squirrel executable toolchain | Package-supplied binaries | `Squirrel.exe`、`Setup.exe` 同 `WriteZipToSetup.exe` 嘅 exact committed SHA-256 values |

Portable Node.js archive 來自 `https://nodejs.org/dist/v22.18.0/`。佢嘅 canonical checksum source 係相配嘅官方 `SHASUMS256.txt` file。

MinGit 來自 exact `git-for-windows/git` release asset。Bootstrap 每次 warm run 都會重新檢查 cached archive 同兩個 extracted executables。錯嘅 cached archive 會移走；invalid installed runtime 會先搬埋一邊，畀人可以 recoverable inspection，之後先啟用 verified replacement，唔會畀壞貨扮熟客入場。

## 一 click bootstrap

執行：

```bat
download-dependencies.bat
```

做 automation 時，可以用以下任何一個 silent form：

```bat
download-dependencies.bat /s
download-dependencies.bat --silent
set SILENT=1 && download-dependencies.bat
```

個 script 會做以下 phases：

1. 由官方 archive bootstrap exact MinGit，再驗證 archive、command executable、core executable 同 reported version。
2. 由 committed manifest 讀 exact Node.js version 同 digests。
3. 只有重新檢查 cached archive 同 installed executable 之後，先重用 user-scoped portable Node runtime。
4. 下載缺少嘅官方 archive、驗證 SHA-256、extract 去 unique staging directory，再將完整 runtime 搬到定位。
5. 對 lockfile 執行 `npm ci --ignore-scripts=false --no-audit --no-fund`。
6. 要求 hand-written package inventory、`package.json`、lockfile root 同每一個 direct lockfile package record 完全相等，四邊口供要對得齊。
7. 重新檢查 Electron archive 同 installed runtime executable。
8. 揀選並驗證 Squirrel.Windows 使用嘅 exact x64 7-Zip helper。
9. Resource editor binary 未驗證之前，唔准郁 executable icon resources。
10. Packaging 之前，驗證每一個用嚟建立 `Update.exe` 同 setup payload 嘅 Squirrel executable。
11. 驗證 dependency、release metadata、workflow-job 同 workflow-tool schemas。

Warm runs 會重複 integrity checks，並重用現有 portable runtime 同 npm cache。已安裝依賴會留喺 source control 外面，唔會偷偷搭順風車入公開原始碼。

## GitHub Actions job 清單

Windows job 使用 `windows-2025`、exact MinGit 2.55.0.windows.2、Node.js 22.18.0、npm 10.9.3、Windows PowerShell 5.1、exact GitHub CLI 2.98.0，同埋 Squirrel.Windows。Committed bootstrap 只會安裝或者重用經 digest 驗證嘅 2.98.0 portable archive，使用前亦會驗證 extracted executable digest。

Linux container job 使用 `ubuntu-24.04`、Git `>=2.43.0 <3.0.0`，signed Ubuntu package 做 fallback、Node.js 22.18.0、npm 10.9.3、exact digest-verified GitHub CLI 2.98.0、GNU tar `>=1.35 <2.0`、Docker Engine 29.6.1，同埋 Docker Buildx 0.27.0。Immutable setup actions 會安裝 exact Docker components。

Publication job 使用 `ubuntu-24.04`，以及同一套 Git、GitHub CLI、Node.js、npm、GNU tar 同 exact lockfile graph。佢唔會安裝自己根本唔會叫嘅 container tools，唔養冇返工嘅工具。

Finalization job 使用 `ubuntu-24.04`，以及同一套 Git、exact GitHub CLI、Node.js、npm、GNU tar 同 lockfile graph。佢會獨立揀選並重新驗證兩個 product transfers，之後做 read-only release verification，而 workflow completion timing 仍然係 pending。

全部三個 Ubuntu jobs，`linux-container`、`publish-release` 同 `finalize-release`，都要求 GNU tar `>=1.35 <2.0`，並喺第一個 real action 之前執行 `tar --version`。Bootstrap 會接受已兼容嘅 GNU tar，或者安裝 signed Ubuntu 24.04 package fallback，之後重新跑 version probe。呢份 inventory 要逐個 job 重複，因為每個 job 都由獨立 environment 開始，冇得隔離飯香當自己食過。

`scripts/release/bootstrap-job-tools.mjs` 會先檢查 compatible Git，但一定會安裝或者重用 exact digest-verified GitHub CLI transport，唔會亂信任 arbitrary compatible installation。佢亦會修復缺少 Git history 嘅 checkout，並證明 `HEAD` 等於 `GITHUB_SHA`。四個 jobs 每個都會喺第一個 packaging、publication 或 finalization action 之前，跑完整 version probe list。Runner label 只係辨認 operating environment，唔代表入面已經擺好 toolchain。

## 失敗情況

- Digest 唔一致，會喺 extraction 或 resource editing 之前停止。
- 缺少或 incompatible Git 或 GitHub CLI，會停止，除非 canonical fallback 成功安裝並驗證。
- Electron package 唔完整而 `electron.exe` 仍然缺少，就會停止。
- Lockfile 缺少會停止，因為 dependency integrity 冇法重現。
- Direct package version 唔一致，會喺 packaging 前停止。
- npm installation 失敗，會將 lockfile-backed install phase 報告成 blocker。
- Tar command 缺少、唔係 GNU，或者超出 range，會停止每個受影響 Ubuntu job，除非 signed Ubuntu fallback 成功安裝並驗證。

任何 bootstrap path 都唔會安裝 credentials、code-signing material 或 standard Git LFS。

## 建議文章

- [GitHub Actions release automation](automation.md)
- [OCI container packaging](container-packaging.md)
- [Windows application 同 Squirrel.Windows packaging](windows-packaging.md)
