# Windows 應用程式同 Squirrel.Windows 打包

呢個 repository 根目錄有兩個建置腳本。兩個都會攞返兼驗證指定版本嘅 MinGit、可攜式 Node.js、lockfile dependency graph、Electron runtime 同 Squirrel 輔助 executable。兩個都支援靜默自動化，而且絕對唔會順手發佈任何嘢，唔會建置建到興起就自己剪綵。

## 可直接執行嘅打包應用程式

互動模式：

```bat
build.bat
```

靜默模式：

```bat
build.bat /s
```

`build.bat` 會用 release automation 同一份 electron-builder 設定產生 `dist/win-unpacked/Hair Growth Estimator.exe`。互動模式只會喺打包同驗證成功之後，先至詢問要唔要執行已打包嘅 executable。靜默模式永遠唔會提示、暫停、開 window，亦唔會等輸入。

validator 要求：

- 一個形狀合理嘅 Windows PE executable；
- `resources/app.asar`；
- 冇 Authenticode certificate table；
- package version 同 source commit 必須等於 release context；
- 每個普通 `app.asar` file 同 byte 都要等於指定嘅手寫 candidate inventory，或者有文件記錄嘅 release transformation，任何意料之外嘅 root、package、framework、application 同 asset path 都會被拒絕；
- 每個已打包 server byte 都要等於 candidate commit；
- 一份由 master 同 output hash 互相對得上嘅 generated icon manifest；
- executable 入面嵌入晒七個 canonical icon resource。

Release transformation 絕對唔會改寫 tracked `app/provenance.json`、`app/release-metadata.json`、`package.json` 或 `package-lock.json`。Generated release bytes 只會放喺 `dist/package-input`，亦只會取代相應嘅 logical packaged path。Application、asset、canonical icon 同 server inputs 會由精確 candidate Git blobs 寫入 `dist/package-source`，所以 checkout line-ending conversion 唔可以改變封裝 bytes。Canonical receipt 會放喺 disposable packaged directory 入面嘅 `dist/win-unpacked/dist/package/packaged-app-manifest.json`。`dist/package/packaged-app-manifest.json` 會保留一份 byte-identical convenience mirror。Canonical receipt 會記錄 package-root-relative executable、`app.asar`、staged provenance 同 tracked-source preservation paths，令 evidence verifier 可以只複製同驗證一個 self-contained package，唔使再讀 source checkout。

Generated electron-builder configuration 會由 exact release context 設定 `extraMetadata.version`。咁樣 packaged root metadata version 就會同 staged provenance 一致，而 tracked `package.json` 繼續原封不動。Prepack step 會執行 `npm run verify:icons`；icon generation 係獨立嘅 source-maintenance action，release packaging 絕對唔會暗中執行。`scripts/release/assert-source-preserved.mjs` 會喺 packaging 前後擷取同驗證 tracked tree，而 executable icon editing 只限 generated output，唔會伸手入 source 扮髮型師。

## Squirrel.Windows installer

互動模式：

```bat
build-installer.bat
```

靜默模式：

```bat
build-installer.bat /s
```

預期嘅 release family 係：

- `HairGrowthEstimator-Setup-<version>-x64.exe`
- `RELEASES`
- 第一次 release 有一個 full `.nupkg`
- `release-manifest.json`
- 之前嘅 release 存在，而且 configured feed 可以提供佢之後，先會有 delta package

Portable-only、ZIP-only、MSI-only、NSIS、MSIX 同其他 installer family 都唔係受支援嘅 release substitute。

第一次 release 冇 prior full package，所以必須啱啱好有一個 full `.nupkg`，而且冇 delta package。呢個 boundary 只准第一次 release 使用。之後每次 release，packaging 都必須由 configured earlier non-draft release 攞到啱啱好一個 full package，並且喺 delta generation 前獨立驗證佢嘅 release identity、tag、target commit、filename、bytes、digest、NuGet identity 同 `RELEASES` row。Prior-package evidence 一旦 missing、ambiguous、stale、corrupt 或 mismatched，就會 fail closed。Release path 絕對唔會靜雞雞將之後嘅 build 當成另一個 first release，唔可以每次都扮第一次見家長。

## Icon provenance

`assets/icons/logo-master.svg` 係 canonical source。`scripts/core/generate-icons.mjs` 用 `sharp` 0.34.3 產生七個 PNG size 同一個 multi-resolution `.ico`。`assets/icons/icon-manifest.json` 會記錄 master bytes、master SHA-256、renderer version、file size 同 output hash。

Package 會將 canonical generated file 對應到 application asset path。Squirrel update metadata 會用一條包含 exact source commit 嘅 immutable raw GitHub URL。由於 no-signing policy 之下 `signAndEditExecutable` 會保持 disabled，獨立 post-pack step 會用已鎖定嘅 in-process `resedit` library，以無碰撞 icon ids 取代 language `1033` 嘅 primary icon group `1`。Atomic replacement 之前會驗證每個 group descriptor、referenced icon id、byte count、dimension、plane、bit depth 同 payload digest。同一個 verified step 亦會更新 `Setup.exe`，並逐 byte 保留 Squirrel bootstrapper 必需嘅額外 internal groups。

Squirrel packaging 開始之前，build 會將 complete installed vendor directory 複製去 `dist/build-input/squirrel-vendor`，驗證 pinned original executables 同 supporting tools，然後只對 staged `Squirrel.exe` 套用 canonical icon。Builder 必須使用呢個 task-local directory。Receipt 會證明 installed dependency bytes 冇變，而且每一個 unrelated staged file 都逐 byte 保持一致。Final validation 會由 pinned original 獨立重做 deterministic transformation，然後要求 staged updater、full package 嘅 `lib/net45/squirrel.exe`，同 Setup 嘅 `Update.exe` 逐 byte 完全一致，今次隻松鼠終於戴啱帽又冇偷換衫。

## Installer integrity

Installer validator 會檢查：

1. Exact setup filename、version、architecture、minimum shape、SHA-256、unsigned state 同 embedded icon resource。
2. 每個 `RELEASES` row 都要同 named package 嘅 byte count 同 SHA-1 對得上。
3. 每個 package SHA-256 都要納入更強嘅 release manifest。
4. 第一次 release 啱啱好得一個 full package。
5. Full package 嘅 NuGet version。
6. Setup executable 嘅 embedded bootstrap ZIP 包含 `Update.exe`，亦包含 validated `RELEASES` entry 所指名嘅 exact full package bytes。
7. Full package 入面實際嘅 application executable 同 `app.asar`。
8. Package、provenance 同 release-metadata version 及 source commit。
9. 實際 application、asset、icon 同 server content，都要同 clean candidate 嘅 Git blob 對得上。
10. Complete Windows product release identity 要同 container packaging 同 publication 使用嘅 logical-run context 一致。

`Update.exe` 會直接喺 outer Setup bootstrap ZIP 入面驗證。Full `.nupkg` 會包含 application payload 同 Squirrel package runtime，而唔係再放多一個 `Update.exe`；如果硬係要求入面有一份，就會驗證咗一個憑空作出嚟嘅 package topology，成個 installer 會無啦啦多咗個孖生兄弟。

ZIP parsing 只會喺 terminal slash、creator-specific directory attribute、zero stored payload、zero CRC 同 zero sizes 全部一致時接受 explicit directory。佢會拒絕 absolute path、drive-prefixed path、parent traversal、duplicate entry、canonical alias、special Unix entry type、file-directory ancestor conflict、truncated data、unsupported compression、CRC disagreement 同 central-directory size disagreement。

## Unsigned release warning

Setup executable 同 installed application 係刻意 unsigned。使用者可能會見到 Windows unknown-publisher 或 SmartScreen warning。Hash 同 release manifest 可以提供 transport 同 package integrity evidence，但佢哋唔係 code-signing substitute，而且絕對唔會被包裝成係。

## Failure recovery

保存好 log 之後，只刪除 generated `dist/` output，再重新執行同一個 root script。唔好用 direct electron-builder command 繞過 script failure。應該修理 root script 或 validator，等受支援嘅 path 繼續可以重現，唔好幫壞咗嘅路鋪地氈遮住佢。

## 建議文章

- [Dependency inventory 同 bootstrap](dependency-inventory.md)
- [Provenance、integrity 同 line-count evidence](provenance-and-integrity.md)
- [GitHub Actions release automation](automation.md)
