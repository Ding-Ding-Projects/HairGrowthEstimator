# 分頁導覽

## 運作方式

網站每個 section 都必須可以透過 browser-style tab 到達。Tab strip 預設 dock 喺左邊，亦可以搬去右、上或下。Tab 支援 overflow、reorder、pinning、group、persisted order 同 membership，仲有四個互相獨立嘅 discovery search：current strip、每個 group、group name 同所有 open tab。

## 設定

Visitor choice 會儲存喺 browser-local state。Vertical strip 會公開 vertical orientation，並使用 up 同 down navigation。Narrow layout 會摺疊 strip，但唔會旋轉 label 或收埋 current destination。

Primary、Tools 同 Settings tab 使用完整 tab 同 tabpanel relationship、roving focus、orientation-aware Arrow key，以及 Home 同 End。Template 提供確實嘅 Tools 同 Settings tab ID、panel ID、`aria-controls`、`aria-labelledby`、selected state 同 roving tab index。`activateManagedTab` 同 `handleManagedTabKeydown` 提供共用 nested-tab path。`renderTabs` 重建 primary strip 之前，會先記錄 focused tab identifier。之後 `focusFilteredTabFallback` 會由重建後嘅 button 解析新 `focusTarget`：同一個 visible tab 仲喺度就恢復 focus，否則 focus 已選取嘅 visible tab 或第一個剩低嘅 tab，而且唔會亂改 selection 扮自己醒目。如果 filtering 後冇任何 visible tab，就會將 focus 搬去 current-strip search。Focused accessibility source test 涵蓋呢啲確實 anchor，而 composed website 嘅 behavioral proof 仍然 pending。

## 失效情況

- Overflow 必須提供可操作清單，唔可以直接 clip tab。
- Collapsed group 入面嘅 search result 必須揭示結果，但唔可以改動已儲存嘅 collapsed preference。
- Pinned 同 locked tab 預設會排除喺 bulk close 之外。
- 清除 browser storage 會重設 visitor tab preference。
- Filtering 唔可以令所有 visible tab 都變成 `tabindex="-1"`，亦唔可以錯誤標記另一個 tab 為 selected。
- Narrow icon-only strip 必須保留完整 accessible tab name 同 visible focus indicator。

## 保安同私隱

Tab state 只屬於本機 browser profile，唔係 authentication 或 synchronization。Search text 會留喺本機，唔可以記錄落 log 或傳送出去。

## 驗證

原始碼檢查確認 primary tab、persisted order、pinned-home region、drag reordering、axis-aware primary-tab arrow key、四個 dock position、overflow、close-containing 同 close-not-containing preview、預設 pinned exclusion、restore-all behavior、完整 Tools 同 Settings tab 及 tabpanel relationship、透過 `activateManagedTab` 同 `handleManagedTabKeydown` 共用嘅 nested Arrow、Home 同 End handling、透過 `focusFilteredTabFallback` 同佢嘅 `focusTarget` 完成嘅 rebuilt-button focus restoration，以及 narrow-layout 下對 discovery search 同 rail action 嘅存取。Pin 同 unpin control、group management、move picker、complete discovery result、built keyboard interaction、narrow-layout behavior 同 built-site capture 仍然 pending。

## 建議文章

- [搜尋同 regex 工作台](search-and-regex-workbench.md)
- [設定同外觀](settings-and-appearance.md)
- [瀏覽器儲存限制](../security/browser-storage-limitations.md)
