# Multi Find v1.3

## 主要變更
- 預設不帶任何搜尋字元。
- 在 popup 輸入關鍵字後立即自動搜尋，不需按搜尋按鈕。
- 關鍵字會儲存在 `chrome.storage.local`。
- 重新整理頁面後會自動重新搜尋並標示。
- 開啟新分頁並完成載入後，也會自動搜尋並標示。
- 修改關鍵字後，所有已開啟分頁會自動重新套用。
- 清除關鍵字後，同步清除頁面上的標示。
- 支援多個 frame。
- 支援上一個 / 下一個命中位置。

## 安裝
1. 解壓縮 zip。
2. Chrome 開啟 `chrome://extensions/`
3. 開啟「開發人員模式」
4. 若已有舊版 Multi Find，建議先移除。
5. 點「載入未封裝項目」
6. 選擇 `multi_find_extension_v1_3` 資料夾。

## 使用
第一次開啟 extension 時輸入：
CTA, MRA, PTA

從此之後，同一個 Chrome profile：
- Refresh 頁面會自動標示
- 新開頁面也會自動標示
- 不需要再次點搜尋
