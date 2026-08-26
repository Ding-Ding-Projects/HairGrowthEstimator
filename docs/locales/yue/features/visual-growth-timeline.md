# 頭髮長度動畫時間線

## 行為

視覺化會將推算嘅男性頭髮長度，配對到八個攝影參考階段。階段長度大約係 0.3、1.5、3、5、9、14、20 同 28 厘米。呢啲係視覺參考，唔係醫療預測，亦唔代表每個人喺相同量度長度時都會有一模一樣嘅頭髮外觀，頭髮唔係八款預設造型嘅紙公仔。

網站模板宣告 `#hero-hair-stage`、`#timeline-progress`、`#hero-stage-caption`，以及 pause action `[data-action="toggle-animation"]`。Runtime `startHairAnimation` 只會使用 composed `#bundled-hair-assets` records，每 2.6 秒轉到下一個可用階段，支援 pause 同 resume，並會因應 reduced-motion preference 停止非必要動畫。喺 `assets/hair-growth/` 下面嘅正式檔案未齊之前，介面會顯示老實嘅文字 placeholder。即使所有圖片都載入失敗，數值估算仍然可以使用。

正式計算係 `365.2425 / 12 = 30.436875 days per estimate month`。目前長度計算會用呢個值將經過日數轉成估算月份。預計達標計算亦會用同一個值，將剩餘目標間距轉成預計日期。推出嘅規劃預設值維持可以調整嘅每月 1.0 cm 估算，唔係醫療事實。唔同人嘅頭髮生長速度可以有明顯分別，同一個人喺唔同時間亦會變。臨床邊界記錄喺 [Hair Growth Disorders, StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK499948/)。

## 設定

視覺化必須讀取正式厘米值、顯示已選單位、標示階段嘅約略量度長度，並提供無動畫嘅 reduced-motion state。圖片必須同產品一齊喺本機 bundled，亦要有具意義嘅 alt text。

精確轉換係 `inches = centimetres / 2.54`。階段配對同顯示值如下：

| 階段 | 約略厘米 | 精確英寸 | 顯示英寸 |
| --- | ---: | ---: | ---: |
| 1 | 0.3 cm | 15/127 in | 0.12 in |
| 2 | 1.5 cm | 75/127 in | 0.59 in |
| 3 | 3 cm | 150/127 in | 1.18 in |
| 4 | 5 cm | 250/127 in | 1.97 in |
| 5 | 9 cm | 450/127 in | 3.54 in |
| 6 | 14 cm | 700/127 in | 5.51 in |
| 7 | 20 cm | 1000/127 in | 7.87 in |
| 8 | 28 cm | 1400/127 in | 11.02 in |

Root `assets/hair-growth/stages.json` 檔案係約略厘米、filenames 同 SHA-256 digests 嘅唯一 mapping authority。佢引用嘅檔案會留喺同一個 root directory。解析 mapping 之前，composer 會拒絕大過 `MAX_HAIR_MANIFEST_BYTES`，即 65,536 bytes 嘅 manifest，亦會透過 fatal decoding 拒絕無效 UTF-8。網站 composition 之後會驗證 stage-owned files，再將佢哋複製到 output `assets/hair-growth/` directory，並將 records 注入 `#bundled-hair-assets`。Composer 會由每個精確 stage length 產生事實準確嘅英文 alt text。桌面 packaging 同樣只可以將 source 複製成 generated build output，並驗證 byte identity。文件、renderer code 同 release packaging 唔可以維護第二份 stage-to-file mapping，亦唔可以另起爐灶放第二套 source photographs。

`inspectPng` 係 media-validation boundary。Manifest entry 被接受之前，composer 會檢查實際 bytes，而唔係見到 `.png` extension 就點頭。佢會驗證 PNG signature、依序而且唯一嘅 header、chunk lengths 同 CRC-32 values、必需嘅 image-data 同 ending chunks、精確 1254 × 1254 dimensions、non-interlaced 8-bit grayscale、RGB、grayscale-alpha 或 RGBA layout、有上限 decompression 至精確 expected scanline length、有效 row filters，以及 ending chunk 後冇多餘 bytes，完成呢啲先再驗證 digest 同複製。

## 失敗情況

- 圖片資產缺失時，必須顯示老實嘅純文字狀態。
- 長度超出已拍攝範圍時，必須明確 clamp 或 extrapolate，唔可以靜靜揀一張無關圖片交差。
- 數值介乎兩個階段之間時，必須講明使用 nearest-stage selection 定 visual interpolation，唔可以暗示 interpolated picture 係量度結果。
- Reduced-motion settings 必須停止非必要動畫。
- Image decode failure 必須保留數值估算。
- 目前長度同預計達標計算如果使用唔同月份長度，或者使用唔係 30.436875 日嘅月份長度，就必須令驗證失敗。
- 就算檔案符合 manifest digest，只要唔係結構有效而且有 bounds 嘅 PNG，都必須維持不可用。
- 檔案宣告嘅 dimensions 如果係零、過大、截斷或互相矛盾，都必須維持不可用。

## 安全同私隱

參考圖片唔可以需要 runtime tracking 或 third-party requests。使用者量度值絕對唔可以放入 image URLs、telemetry 或 public captures。

## 驗證

網站 runtime 只會讀取 composed `#bundled-hair-assets` array，當 array 為空時會回退到數值文字狀態。已檢查 composer 會先套用 `MAX_HAIR_MANIFEST_BYTES` 同 fatal UTF-8 decoding，再驗證精確八個厘米階段同正式次序、安全 manifest basenames、unique stages、filenames 同 SHA-256 values、每個檔案嘅 source presence、1 KiB 至 12 MiB file-size range、透過 `inspectPng` 嘅 byte-level PNG structure、manifest SHA-256 digests、精確 source-directory file set，同精確 inch values，之後先複製正式 directory。呢個 checkout 未有八個 root source assets，所以針對真實 manifest 嘅 composition execution、真實 decoder results、copy 後 identity，同成品證據仍然有待完成。所需證據包括八個全部可解碼嘅正式檔案、一對一 manifest records、一致嘅 adult subject 同 lighting、可理解嘅 alt text、兩種單位數值標籤、reduced-motion behavior、missing-file fallback、composed copies 嘅 byte-identity proof，同成品擷取。Asset inventory 記錄喺 [頭髮參考資產權威清單](../inventory/hair-reference-assets.md)。

## 建議文章

- [厘米同英寸](measurements.md)
- [頭髮生長估算](hair-growth-estimation.md)
- [無障礙同響應式版面](../site/accessibility-and-responsive-layout.md)
