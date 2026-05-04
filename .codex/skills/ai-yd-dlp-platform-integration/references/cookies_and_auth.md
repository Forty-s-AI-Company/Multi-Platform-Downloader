# Cookies / 登入整合筆記

## 產品面（UI 應該怎麼呈現）

- 顯示：「此平台可能需要登入/cookies」提示
- 提供兩種方式：
  1) 匯入 `cookies.txt`（使用者自行用瀏覽器擴充匯出）
  2) 從瀏覽器讀取（例如 Chrome Default profile）
- 明確提示：cookies 是敏感資料，只留本機、不上傳、不會被分享

## 工程面（worker 怎麼做比較安全）

- Node/worker 執行時不要拼接字串
- cookies path 要做存在性檢查
- log 需要遮罩：
  - cookies 檔路徑只顯示檔名或以 `***` 隱藏
  - URL query token 不直接輸出

