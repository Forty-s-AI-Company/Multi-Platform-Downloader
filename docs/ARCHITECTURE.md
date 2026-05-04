# 架構建議｜GUI + 本機工作器（worker）

## 核心想法

GUI 不直接「硬寫下載邏輯」，而是把工作交給一個本機 worker（Node.js），worker 負責：
- 呼叫 `yt-dlp` 取得格式/下載
- 呼叫 `ffmpeg` 合併/轉檔/切片
- 解析進度（標準化成 UI 能吃的事件）

這樣做的好處：
- UI/業務邏輯分離（之後換框架也不怕）
- 下載/轉檔的「難搞」都集中在 worker
- 更容易做佇列、重試、記錄

## 元件切分（MVP）

1. **GUI（Electron Renderer）**
   - URL 輸入、選項表單、下載清單、進度條、錯誤提示
2. **主程序（Electron Main）**
   - 檔案選擇器、路徑權限、與 worker 通訊（IPC）
3. **Worker（Node.js）**
   - `yt-dlp`/`ffmpeg` 執行器
   - Job queue（同時最多 N 個）
   - 進度解析（`--progress-template` 建議輸出 JSON）

## 進度建議（讓 UI 好做）

建議 worker 呼叫 `yt-dlp` 時加上：
- `--newline`（每行一個進度）
- 或用 `--progress-template` 統一輸出格式（最好 JSON）

然後 worker 解析後送出事件：
- `job.started`
- `job.progress`（percent/speed/eta/downloaded/total）
- `job.postprocess`
- `job.completed`
- `job.failed`（含 user-friendly message）

## 輸出路徑規則

請統一由 worker 生成，避免 UI 亂拼：
- 預設：`downloads/<platform>/<title>/<title>.<ext>`
- playlist：`downloads/<platform>/<playlist_title>/<index> - <title>.<ext>`

