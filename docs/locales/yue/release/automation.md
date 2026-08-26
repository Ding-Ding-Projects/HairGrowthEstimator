# GitHub Actions 發佈自動化

`.github/workflows/release.yml` 會喺每次 push 同 `workflow_dispatch` 時執行。成功嘅 logical workflow run 只會發佈一個獨一無二、非 draft 嘅 GitHub Release。早期 task branch 嘅 push 發生喺 all-push trigger 存在之前，當時冇 workflow run，依家唔可以倒帶扮有。

## Version identity

Release version 係 `1.0.<github.run_number>`。Rerun attempt 會保留同一個 logical version，亦可以繼續同一個 staged release。較後嘅 workflow run 會得到更大嘅 run number，所以 version 都會更大。產品檔名同時包含 run ID 同 run attempt。

Windows job 會為同一個 logical run 解析一次 catalog-backed release context，並將嗰組準確 bytes 放入必需產品。Rerun 會重用最早一份有效，而且綁定同一 run ID 同 candidate commit 嘅 context。Container、publication 同 finalization jobs 都拒絕重新計算。Publication 同 finalization 會各自揀出該 logical run 最新、未過期嘅 Windows 同 container 產品，然後拒絕任何 identity 對唔上嘅組合，唔俾兩個陌生人戴同一頂帽扮一家人。

## Jobs

| Job | Runner | 用途 |
| --- | --- | --- |
| `windows-package` | `windows-2025` | Build 同驗證可執行程式以及完整 Squirrel.Windows 系列 |
| `linux-container` | `ubuntu-24.04` | Build 同驗證確定性 OCI archive |
| `publish-release` | `ubuntu-24.04` | 合併已驗證產品、計算程式碼行數、stage 一個 draft、只發佈一次，再驗證 server bytes |
| `finalize-release` | `ubuntu-24.04` | 重新驗證已發佈 release，同時如實保留 completion timing 為 pending |

Dependency 次序準確係 `windows-package`，然後 `linux-container`，再到 `publish-release`，最後 `finalize-release`。流程冇 matrix expansion、冇平行 publication path，亦冇第五個 release job 躲喺梳化底。

所有 third-party actions 都用經審閱嘅完整 commit SHA，workflow validator 會拒絕每個未審閱嘅 `uses:` entry、錯誤 revision，或者錯誤 occurrence count。Node.js 22.18.0、npm 10.9.3、GitHub CLI 2.98.0、Docker Engine 29.6.1 同 Docker Buildx 0.27.0 都有明確版本。已提交嘅 bootstrap 永遠會安裝或者重用準確、經 digest 驗證嘅 GitHub CLI archive 同 executable，唔會接受一個 mutable compatible system version 嚟搏彩數。

## Actions 入面冇 tests 或 lint

Workflow 唔會執行 unit、integration、end-to-end、lint、type、coverage、accessibility 或 screenshot checks。佢只會 build、封裝、驗證 release 完整性，再發佈。呢個係明確 delivery tradeoff：因為 Actions 入面根本冇 test verdict，所以即使某個 commit 嘅 local tests 會失敗，佢仍然可以被發佈。Source task 必須喺本機執行同報告 checks，但嗰啲 verdict 永遠唔會 gate workflow。

Packaging 同 integrity validation 仍然屬於 build 一部分，因為佢哋決定真實 release 產品係咪存在，同埋係咪對得上聲稱嘅 source。呢啲 validation 唔會被包裝成 product-behavior test coverage，個紙箱檢查過唔等於入面部機識煮飯。

## 乾淨 candidate 邊界

每個 build job 都會喺產生 release metadata 之前記錄 clean candidate marker。Marker 包含準確 commit、commit epoch，以及可用時已解析嘅 release-identity digest。Release-specific package metadata、application metadata 同 provenance 只可以寫入 `dist/package-input` 以下。Application、asset、canonical icon 同 server inputs 會喺 builder 讀取之前，由 marker commit 嘅精確 Git blobs 寫入 `dist/package-source`。整個 packaging 期間，tracked source files 必須 bytes 完全不變，而 Git status 必須保持空白。任何 staged、untracked、renamed、deleted 或 changed entry 都會失敗。Windows 同 OCI validators 會獨立將實際封裝內容同 marker commit 嘅 Git blobs 比對，而 Windows receipt 會記錄前後 tracked-source inventory hash。

## 發佈次序

1. 重用 Windows 產品中最早一份有效嘅 logical-run context。
2. 查詢 logical run 所有 artifacts，並獨立揀出最新、未過期嘅 Windows 同 container 產品，就算佢哋來自唔同 rerun attempts 都一樣。
3. 對轉移 bytes 重新執行 Squirrel 同 OCI parsers，將實際封裝內容同 candidate Git blobs 比對，再將兩份產品 identity 同重用 context 比對。
4. 只 stage 已驗證 Windows 同 container manifests 指名嘅安全 basenames。
5. 對準確 source commit 執行已提交嘅 line counter。
6. 為 unique tag 建立或者繼續一個 draft release。
7. 只 upload 缺少嘅 assets。現有 asset 必須重新下載，而且 hash 完全一致，先可以重用。
8. 再次下載每份 server-side asset，驗證 byte count 同 SHA-256。
9. Draft 只發佈一次。
10. 讀取準確 server publication timestamp，只更新嗰個 release-note boundary，將 `Workflow completed` 同 `Workflow duration` 明確保留為 pending，再逐字讀返 notes。
11. 執行第四個 workflow job，重新下載並驗證產品、tag、非 draft state、pending timing lines，同每份 release asset。呢個 active job 只讀，永遠唔會估自己嘅 completion timestamp。
12. Workflow 到達 terminal successful state 之後，對同一個 run 同 release 呼叫已提交嘅 `scripts/release/finalize-run.mjs` wrapper。準確 public command 係 `node scripts/release/finalize-run.mjs --repository Ding-Ding-Projects/HairGrowthEstimator --run-id <positive-decimal-run-id> --commit <40-character-lowercase-SHA>`。
13. 保留下面描述嘅 fixed terminal transfer。Terminal verification 成功之前，site-consumable installer manifest 會被 withheld。

Post-run terminal patch 係 release currentness 必需條件。Release notes 如果仍然話 completion pending，嗰個 release 雖然已經發佈，但未達到 final handoff 或 website download composition 所需嘅 current 狀態。`Workflow completed` 係所選 successful four-job server inventory 裏面最大嘅準確 `completed_at`。之後嘅 release mutation 同獨立 readback 係另一項事實：wrapper 會將最後一次獨立 release readback 嘅 GitHub response `Date`，記錄成 output-only `release-readback.json` 入面嘅 `releaseCurrentnessVerifiedAt`。佢永遠唔會將嗰個較後時間重新標示成 workflow completion，亦唔會 patch 個 timestamp 入 release notes，否則 mutation 會追住自己條尾轉圈。

Wrapper 係一次性 local execution：開始之前，佢嘅 work、staging、release-output 同 terminal-transfer directories 必須全部不存在。如果 server 已經帶有準確嘅較早 terminal notes，佢可以保留，但完成或者中斷 invocation 留低嘅 local output，必須先檢查同移除，先可以再執行。外來或者有歧義嘅 timing text 會 fail closed。Wrapper 唔會建立 tag、release 或 asset。

## Post-run terminal transfer

Wrapper 只接受上面展示嘅 repository identity、positive decimal run ID，同完整 lowercase candidate SHA。佢要求 checkout 喺嗰個準確 commit 而且保持乾淨，驗證 origin identity，下載並重新驗證所選產品，finalize 現有 release，再獨立讀返 release 同 server assets。

流程冇 production destination override。開始之前 destination 必須不存在，而且固定係 `dist/terminal-transfer`。Wrapper 會原子式輸出準確以下四個檔案：

- `installer-manifest.json`，只會喺 terminal release currentness 證明完成之後寫入；
- `release-context.json`，保留 logical-run identity；
- `trusted-product-validation.json`，保留獨立重新驗證嘅 Windows 同 container source bindings；
- `terminal-transfer-receipt.json`，用準確排序 filename、byte count、SHA-256，連同 repository、run、attempt、tag、target 同 version，綁定另外三個檔案。

Wrapper 成功之前會重新讀取 fixed directory，再驗證 receipt。Existing destination、額外或缺少 payload、錯誤 file order、invalid JSON、byte-count mismatch、digest mismatch、identity disagreement、nonterminal run、unsuccessful run、wrong origin 或 source change，任何一樣都會 fail closed。

當 pinned public catalog 可用，release 會連去 authoritative published dim-sum photo，並寫明 catalog record。佢唔會將 catalog image 複製或附加到呢個 repository 或 release。Catalog unavailable 唔會亂作一款點心，亦唔會 block build。Release 會只使用 version，並記錄 unavailable state。

## Release assets

必需嘅 external release assets 包括：

- unsigned Squirrel.Windows setup executable；
- `RELEASES`；
- `RELEASES` 指名嘅每份 full 或 delta package；
- `release-manifest.json`；
- OCI archive；
- `container-manifest.json`；
- Markdown 同 JSON line-count evidence。

## Credentials 同 permissions

Catalog 同 artifact reads 只會喺確實需要嘅 step，收到 job-scoped `secrets.GITHUB_TOKEN`。較闊嘅 `secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN` chain 只會出現喺 publication step。Credentials 永遠唔會印出或寫入 release evidence。Checkout steps 唔會保留 credentials。Build 同 in-workflow finalization jobs 只有 read-only contents 同 Actions access。只有 publication job 會得到 scoped contents write permission。獨立 post-run terminal operation 只會喺 run 完成後被刻意呼叫時，得到 release write access。

## Failure evidence

六份 bounded Actions artifacts 各有唔同角色。兩份必需 product transfers 包含已驗證 Windows 同 container 產品，只會喺 successful staging 之後執行，檔案缺失就失敗，而且唔會忽略 upload errors。四份 evidence uploads 用 `always()` 執行，容許 evidence 缺少時出 warning，保留資料七日，亦唔可以掩蓋較早 build result。Windows 同 container evidence collectors 只會複製 hand-written safe partial-output inventory 入面嘅項目，並記錄每份 copied file 嘅準確 source path、path class、byte count、SHA-256、run、attempt、commit 同 job outcome。Unknown files、symbolic links、dependency directories、source trees、caches、credentials，同超出已提交 byte 及 file-count bounds 嘅 outputs，全部永遠唔會被複製。咁樣 failed-job rerun 可以重建缺少嘅 product transfer，又唔會將 failure evidence 當成 publishable product。

兩個 packaging jobs 未成功，release 就唔會發佈。Packaging failure 可以令一次 push 冇 release。Test 或 lint verdict 唔會造成呢個結果，因為 Actions 根本唔會執行嗰啲 checks。

## 建議文章

- [Dependency inventory 同 bootstrap](dependency-inventory.md)
- [Provenance、完整性同程式碼行數證據](provenance-and-integrity.md)
- [Windows 程式同 Squirrel.Windows 封裝](windows-packaging.md)
