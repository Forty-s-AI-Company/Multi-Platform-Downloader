# Roadmap（建議節奏）

## Phase 0：定義與驗證（你現在正在做）
- PRD/架構/指令對照先補齊（✅）
- 先以 YouTube 做 end-to-end（格式清單、下載、字幕、區間）

## Phase 1：MVP 桌面版
- GUI：新增 Job、顯示進度、輸出路徑、錯誤訊息
- Worker：spawn `yt-dlp/ffmpeg`、解析進度、佇列控制
- 功能：影片/音訊/字幕/播放清單/區間/Cookies 匯入

## Phase 2：平台擴充與穩定性
- IG/TikTok/Douyin 的 cookies 與重試策略
- 格式選擇更友善（解析 `-F` 變成「1080p/720p」的選項）

## Phase 3：進階功能
- 下載續傳、斷點、歷史記錄
- 批次匯入 URL
- 下載後自動整理/命名規則模板

