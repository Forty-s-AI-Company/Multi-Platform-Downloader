# TikTok / Douyin Clean-Room 實作計畫

## 目標

在不碰 GPL 原始碼、不照搬第三方專案結構的前提下，為 `TikTok / Douyin` 建立我們自己的專用下載路線。

這份文件只定義：

- 功能範圍
- 路由策略
- adapter 介面
- cookies / session 原則
- 驗證方式

## 邊界

可以參考的內容：

- 產品功能方向
- 使用者流程
- 哪些情境需要 cookies / session

不能直接拿來用的內容：

- 第三方原始碼
- 第三方模組切法
- 第三方 API 路徑與參數設計

## 核心策略

1. 保留既有 `Electron + Node.js` GUI 與佇列系統
2. 只把 `TikTok / Douyin` 抽成專用 adapter
3. 每個 adapter 都遵守同一條下載路線：
   - 頁面直讀
   - 瀏覽器 request 擷取
   - `yt-dlp` fallback
4. 所有路線都要寫入 `job.route`
5. cookies 不寫進 log

## 平台路線

### Douyin

1. 先做網址正規化
2. 優先嘗試頁面直讀
3. 失敗後改走瀏覽器 request 擷取
4. 再失敗才 fallback `yt-dlp`

### TikTok

1. 先做網址正規化
2. 優先嘗試頁面直讀
3. 失敗後改走瀏覽器 request 擷取
4. 再失敗才 fallback `yt-dlp`

## Adapter 契約

每個 adapter 必須輸出：

- `actualDownloadUrl`
- `titleOverride`
- `thumbnailOverride`
- `prependArgs`
- `route label`

## 失敗處理

### 必須記錄

- 頁面直讀失敗原因
- 擷取 request 是否超時
- cookies 是否存在

### 不能記錄

- 完整 cookies 值
- 使用者本機敏感路徑
- 不必要的 `yt-dlp` / `ffmpeg` 參數細節

## 分階段落地

### Phase 1

- 抽出 `Douyin / TikTok` adapter 骨架
- 補上 clean-room 文件
- 保留既有 fallback

### Phase 2

- 補齊 `TikTok` request 擷取
- 補齊作者頁 / 列表頁批次收集
- 補齊縮圖與標題覆蓋

### Phase 3

- 補上更多錯誤分類
- 補上 cookies / headers / referer 微調
- 補上更完整的驗證案例

## 驗收條件

- 不能再把 `blob:` 當成可下載媒體網址
- Douyin 專用路線失敗時才進 `yt-dlp`
- TikTok 專用路線要先跑完，不能直接掉 generic
- 新增平台 adapter 時不需要改動主流程骨架

## 測試建議

- 建立 `fixtures/tiktok-douyin-cases.json`
- 至少覆蓋單支作品、作者頁、搜尋頁三類案例
- 若未來要跑 headless server mode，再把 adapter 抽到更乾淨的 service layer
