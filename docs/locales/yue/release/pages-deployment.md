# GitHub Pages 部署

## 運作方式

`.github/workflows/pages.yml` 會喺每次 push 同明確 workflow dispatch 時，組合並部署靜態文件網站。Build job 會 checkout 完整歷史入面嘅準確 commit，安裝 lockfile 指定嘅 Node.js dependency graph，執行 `npm run compose-site`，設定 GitHub Pages，然後只 upload `_site`。第二個 job 會將已 upload 嘅網站部署去受保護嘅 `github-pages` environment。

網站部署 workflow 同 release 發佈各自獨立。網站部署成功，唔代表 Windows installer 或 OCI archive 已經 build 好。只有 release workflow 可以發佈嗰啲可下載產品，網站唔可以戴住假鬍鬚扮 release 經理。

## 設定

Workflow 喺 `ubuntu-24.04` 使用 Node.js `22.18.0`。權限只限 `contents: read`、`pages: write` 同 `id-token: write`。每個 third-party action 都 pin 去完整而且審核過嘅 commit。部署 concurrency key 以 source ref 分隔，新 commit 取代舊 commit 時，會取消較舊而且只處理網站嘅 run。

Repository 必須將 GitHub Pages source 設定為 GitHub Actions。預期公開地址係 `https://ding-ding-projects.github.io/HairGrowthEstimator/`。

## 失敗情況

- Lockfile 安裝失敗會喺任何 upload 之前停止組合。
- Canonical 頭髮圖片遺失或無效時，會停止組合，唔會部署一段甩咗幾撮頭髮嘅視覺序列。
- `_site` directory 遺失會令 upload step 失敗。
- Pages 權限或 repository 設定遺失，部署會失敗，但 release 發佈狀態唔會被改動。
- 新 push 可以取消已被取代而且只處理網站嘅 run。取消唔係部署成功 verdict，熄燈唔等於剪綵。

## 安全與私隱

Workflow 唔會收到 release credential、repository write credential、signing material、application secret、personal vocabulary file 或私人 user data。佢只 upload 組合後嘅靜態 directory。網站冇 analytics、third-party runtime scripts，亦冇複製私人設定。

## 驗證

喺本機執行針對 workflow 合約嘅檢查：

```powershell
node --test scripts/release/tests/pages-workflow.test.mjs
```

部署之後，以未登入方式 fetch 公開頁面，驗證 served commit-bound provenance，喺回傳 HTML 讀取 Open Graph tags，再用 anonymous client fetch absolute `og:image` URL。

## 建議閱讀

- [GitHub Actions release 自動化](automation.md)
- [Provenance、完整性與 line-count 證據](provenance-and-integrity.md)
- [Windows application 與 Squirrel.Windows packaging](windows-packaging.md)
