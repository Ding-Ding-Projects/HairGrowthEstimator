# Startup surprise

## Behavior

After first run, the application makes one fresh cryptographic random draw per launch. Values from 0 inclusive through 0.1 exclusive select the surprise, which is exactly 10 percent of the normalized range. A launch never draws twice.

The card is non-blocking, does not take focus, makes no sound, and dismisses itself after eight seconds. It is suppressed during first run, School mode, an error path, an update flow, an active task, and low-stimulation presentation.

## Configuration

The draw probability and eight second presentation duration are fixed product behavior. There is no opt-out switch. The active language mode and funny levels style only the surrounding copy, while the dish name and public catalog identity remain factual.

## Public image boundary

Dish metadata is the public catalog record `hk-dish-0001`, Classic Har Gow · 蝦餃. The image is fetched only from the published `catalog-v1` release asset. It is validated as a bounded PNG and cached in private application data. No dim-sum image is committed to this repository, and a missing offline cache produces no substitute image or false success.

## Failure modes

An invalid draw, repeated draw, missing public asset, malformed image, unavailable network, absent cache, or active suppression condition produces no surprise. Startup continues normally and never reports a display that did not occur.

## Security and privacy

The feature uses no analytics or tracking. It fetches only the fixed published catalog asset, validates it before caching, and stores no user record, account identifier, credential, or behavioral history.

## Verification

Run `node --test tests/core/delight-attention.test.js tests/core/presentation-wave-integration.test.js`.

## 香港粵語

首次啟動之後，每次開應用只會抽一次加密亂數。由 0 開始到細過 0.1 就中，正正係一成範圍，唔會一開機抽幾次增加中獎率。卡片唔阻住開機、唔搶焦點、冇聲，八秒後自己收工。首次啟動、School mode、錯誤、更新、工作進行中同低刺激顯示期間都唔會出現。

相片只會由公開目錄已發布資產取得，通過 PNG 格式同大小驗證先放入私人快取。離線又冇快取就唔顯示，唔會用假相頂住個位。

## Suggested articles

- [Attention accommodations](attention-accommodations.md)
- [Shared School mode](shared-school-mode.md)
- [Language modes and funny levels](language-and-funny-levels.md)
