# 產品功能

呢批文章會講清楚已檢查原始碼入面見到嘅產品行為，亦會老實標明仲未完成嘅使用者介面邊界，唔會用「應該得」扮「已經得」。

## 功能文章

- [頭髮生長估算](hair-growth-estimation.md)
- [剪髮紀錄同重設行為](haircut-history.md)
- [厘米同英寸](measurements.md)
- [頭髮長度動畫時間線](visual-growth-timeline.md)
- [本機儲存同選用同步](data-storage-and-sync.md)
- [匯出行為](export.md)
- [桌面外殼同視窗控制](desktop-shell.md)

## 目前實作摘要

已檢查嘅原始碼包含桌面主程序、隔離嘅 preload bridge、本機 JSON 狀態儲存、HTTP 服務、Docker 部署檔案、嚴格嘅 SSH tunnel 程序管理，以及網站模板、樣式表、狀態合約、安全合約、Worker、Worker client 同瀏覽器執行檔案。瀏覽器執行層包含可調整嘅每月 1.0 cm 預設值、精確嘅厘米同英寸轉換、以最新剪髮紀錄重新協調基準並保留手動後備值、引導式拒絕未來日期、同源瀏覽器單調遞增修訂、拒絕過期寫入、可忠實重建嘅正規化 CSV 同 TSV 匯出、正面匯出 allowlist、嚴格瀏覽器狀態同外觀匯入、精確嘅上一版本 presentation migration，以及本機工具。聚焦原始碼測試涵蓋原有正確性行為，而完整聚焦強化測試喺還原後報告 12 passed、0 failed、0 skipped。網站原始碼嘅月份一致性已透過共用計算器同確定性向量實作。完整負面迴歸覆蓋、桌面同核心消費、整合跨介面證明、桌面互動紀錄，以及成品擷取仍然有待完成。原始碼存在唔會被當成成品已驗證，檔案企咗喺度唔代表成品已經識行。

## 建議閱讀

- [HTTP API](../api/README.md)
- [本機服務運作](../operations/local-service.md)
- [私隱同資料邊界](../security/privacy-and-data-boundaries.md)
