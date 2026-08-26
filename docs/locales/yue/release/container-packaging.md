# OCI 容器封裝

頭髮長度服務會封裝成可重現嘅 Linux amd64 OCI image layout archive。呢個 archive 係畀支援 OCI archive 嘅容器工具下載同搬運用，預設唔會發佈去 registry。

## 原始碼同執行合約

Dockerfile 用以下不可變 base：

```text
node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
```

呢個值係 multi-platform index digest。揀中嘅 `linux/amd64` manifest digest 亦會獨立釘死做 `sha256:76789712cd1ae89a1225eac9077010d68987a423588042dac30446f502f1858c`。Buildx 開工之前會交返原始 base index bytes，build helper 會 hash 留底嘅 bytes、要求同宣告嘅 index digest 一致、揀啱 Linux amd64 descriptor，再要求同獨立宣告嘅 manifest digest 一致。Validator 會用保留嘅 raw proof 重新推導，唔會淨係信 labels。兩個 identity 都會寫入 image labels 同 release metadata，唔畀佢哋戴假鬚過關。

個 image 會：

- 只複製有界限嘅 `server/` build context；
- 用 `node:node` 執行；
- 將服務綁到 `0.0.0.0:4782`，方便 direct published-port run；
- 記錄 OCI source、version、revision、creation 同 base-digest labels；
- 只宣告服務 entry point 同 exposed port。

Compose definition 會再加以下營運限制：

- numeric non-root identity `1000:1000`；
- read-only root filesystem；
- 只有 service data named volume 可以寫入；
- `no-new-privileges:true`；
- 移除全部 Linux capabilities；
- 有界限嘅 health check 同 restart policy。

## Build 指令

兩次 no-cache build 開始之前，build path 會由 exact candidate Git blobs 將 `Dockerfile` 同完整 declared server input inventory 寫入 `dist/container-input`。兩次 build 都只會使用 staged Dockerfile 同 staged server context。Final validation 會重新讀取 staged inputs，並拒絕 checkout line-ending conversion、extra bytes、missing files，或者 build 途中任何 mutation，唔准啲 CRLF 靜雞雞搭順風車入 container。

準備好 release context 之後：

```text
node scripts/release/build-container.mjs
```

個 script 會叫 Docker Buildx 用 `--no-cache` 對 `linux/amd64` build 兩次。兩次 build 都會收到完全相同嘅 version、revision、creation timestamp、base index digest、selected manifest digest 同 `SOURCE_DATE_EPOCH`。額外 provenance 同 SBOM attachments 會停用，確保宣告嘅 output 精準。每個 OCI archive 都會將 outer tar ordering、ownership、modes 同 timestamps canonicalize。只有當兩個 canonical archive hashes、image digests、config digests 同 candidate source-binding records 全部一致，publication 先可以繼續，否則就請兩個 build 坐低對口供。

`linux-container` job 會明確 inventory GNU tar `>=1.35 <2.0`。Bootstrap 會喺容器工作之前先行 `tar --version`；只有當 command 缺失或者唔喺範圍內，先安裝已簽署嘅 Ubuntu 24.04 package fallback。Runner image 從來唔當成 archive tool 已經存在嘅證明，名牌唔等於工具箱。

## 驗證

Validator 會要求：

- 只有一個供 `linux/amd64` 使用嘅 OCI manifest；
- index、manifest、configuration 同 layer descriptors 嘅 media types 必須喺 allowlist，sizes 要等於 referenced blob lengths，而且 SHA-256 要同 referenced bytes 一致；
- image configuration 必須係 non-root；
- runtime environment 內有 `HAIR_HOST=0.0.0.0`；
- version、revision、source、creation 同 base-digest labels 必須完全一致；
- layer compression 必須受支援；
- 最終 `/opt/hair-growth/server/` file set 同 bytes 必須等於 exact candidate commit 入面嘅 Git blobs。

`container-manifest.json` 會記錄 outer archive hash、image 同 config digests、layer count、兩個 base identities、source binding inventory、runtime constraints、每個 declared build input hash，同埋兩次 build 嘅 reproducibility proof。

## 直接喺本機 build 同執行

由 source 做一般本機 hosting 時，Docker Compose 會套用已記錄嘅限制：

啟動服務之前，先喺 process environment 或未追蹤嘅 local environment file 設定 `HAIR_API_KEY`。唔好 commit 個值，亦唔好將佢擺入 shell history entry，費事條鎖匙自己上台唱歌。

```text
docker compose up --build -d
```

服務之後可以經 `docker-compose.yml` 設定嘅 published port 存取。除非 deployer 有意加入 authentication、TLS termination、rate limits 同經 review 嘅 public-network policy，否則應該維持 private-LAN 或 loopback exposure。

## 失敗情況

- Mutable 或 mismatched base image 會即時停止 source validation。
- 缺少 provenance label 會停止 archive validation。
- Root user 或 loopback-only container binding 會停止 validation。
- Actual image layer 入面有改動、缺少或額外 server file，會停止 source binding。
- Corrupt OCI blob 會喺 manifest 產生之前停低。
- Descriptor size 或 media type 錯誤，就算 digest 自己同自己夾得埋都會停止。
- 兩個 no-cache canonical builds 有任何差異，都會停止 reproducibility validation。
- Build 失敗時，絕對唔會產生 release-ready `container-manifest.json`。

## 建議文章

- [依賴清單同 bootstrap](dependency-inventory.md)
- [Provenance、integrity 同 line-count 證據](provenance-and-integrity.md)
