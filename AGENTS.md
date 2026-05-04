## Codex / AI Agent 指南（ai_yd-dlp）

> 這份是「給 AI 用的專案工作手冊」，目標是：之後你叫 Codex 做事，它能穩、快、少走冤枉路。

### 回覆語言

- 一律使用繁體中文（含 commit message 建議、文件、UI 文案草稿）

### 專案目標（不迷路版）

- 做跨平台 GUI：貼網址 → 選擇（清晰度/音質/字幕/播放清單/區間）→ 下載/轉檔 → 產出檔案
- 支援平台以 `yt-dlp` 能力為主，並提供「需要登入/可能失效」提示與 cookies 方案

### 建議技術假設（MVP）

- **核心下載/解析：** `yt-dlp`（以「呼叫外部 binary」為主，不直接重寫 extractor）
- **轉檔/切片：** `ffmpeg`
- **GUI（建議）：** Electron + React + Vite + TypeScript
- **本機工作器（worker）：** Node.js（spawn `yt-dlp`/`ffmpeg`），透過事件/JSON 進度回報給 UI

> 如果未來你想換成 Tauri 也行，但先把 MVP 跑起來最香（不然我們會在「選框架」裡老死）。

### 文件優先順序（Agent 開工順序）

1. `docs/PRD.md`
2. `docs/ARCHITECTURE.md`
3. `docs/CLI_MAPPING.md`
4. `docs/PLATFORM_SUPPORT.md`

### 重要需求（務必落地）

- **清晰度/音質可選**：至少提供「簡單模式（1080p/720p/最佳）」與「進階模式（格式碼/自訂 -f）」兩種
- **播放清單**：支援 `--yes-playlist`、與輸出資料夾以 playlist title 分層
- **區間下載**：支援 `--download-sections "*START-END"`（UI 以 `HH:MM:SS`）
- **字幕**：支援 `--write-subs --write-auto-subs --sub-langs ...` 與可選 `--convert-subs srt`
- **Cookies**：支援匯入 `cookies.txt` 與 `--cookies-from-browser`（至少 Chrome）

### 安全與隱私（做對比做多重要）

- cookies 檔案視同敏感資料：不得上傳、不寫進 log、不提交進 git
- 預設不開啟「從瀏覽器讀 cookies」；若開啟要明確提示與範圍（profile）
- 所有外部命令列呼叫要避免 shell injection：
  - Node 端用 `spawn` + args array（不要拼接字串）
  - 對使用者輸入的路徑/檔名做白名單化或安全轉義

### 輸出/檔名規範（MVP）

- 預設輸出：`downloads/<platform>/<title>/<title>.<ext>`
- 播放清單：`downloads/<platform>/<playlist_title>/<index> - <title>.<ext>`
- 檔名需移除不合法字元（Windows 保守處理 `<>:\"/\\|?*`）

