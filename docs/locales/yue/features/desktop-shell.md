# 桌面外殼同視窗控制

## 行為

主程序會建立一個無框架、1280 × 820、深色背景嘅桌面視窗。佢透過 preload bridge 提供隔離嘅最小化、最大化或還原，以及關閉操作。Node integration 已停用，context isolation 已啟用，renderer sandboxing 亦已啟用。

視窗會載入 `app/renderer/index.html`，但喺已檢查修訂入面搵唔到呢個路徑。因此，自訂標題列同控制元件結構仍然有待完成，個視窗暫時仲未有舞台可以正式開幕。

## 設定

目前最小尺寸係 900 × 650。視窗啟動時會隱藏，等到 `ready-to-show` 之後先顯示。產品喺 Windows 上所有視窗關閉時結束，亦可以喺啟用時重新建立主視窗。

## 失敗情況

- Renderer 路徑缺失會令視窗無法使用。
- 硬編碼最小尺寸仍然要喺細型顯示器同高顯示縮放下驗證。
- 自訂關閉控制必須保留未儲存工作，並喺關閉前記錄任何經使用者授權嘅放棄操作。已檢查原始碼未有呢項行為。

## 安全同私隱

有權限嘅能力會透過命名 preload 方法提供，而唔係直接開放原始 IPC。Renderer 無法直接使用 Node integration。每個新 bridge 方法仍然需要輸入限制同明確 allowlist。

## 驗證

原始碼檢查確認 BrowserWindow 安全設定同命名 IPC handlers。封裝後啟動、自訂標題列控制、焦點返回、細顯示器尺寸、高縮放版面、鍵盤操作，同成品擷取仍然有待完成。

## 建議文章

- [發佈、安裝同更新](../operations/release-install-and-updates.md)
- [版本同建置來源](../operations/version-provenance.md)
- [無障礙同響應式版面](../site/accessibility-and-responsive-layout.md)
