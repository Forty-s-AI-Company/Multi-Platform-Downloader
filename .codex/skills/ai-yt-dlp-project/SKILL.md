---
name: ai-yt-dlp-project
description: 用於開發 ai_yt-dlp 跨平台下載/轉檔/字幕 GUI 工具的專案技能：包含 MVP 規格、指令對照、資料夾/檔名規範、worker 進度事件設計與安全注意事項。
---

# ai_yt-dlp Project Skill

## 何時使用

當使用者要你在這個 repo：
- 釐清需求、補文件、做工作切分
- 開始做 GUI/worker/下載流程
- 把 `yt-dlp`/`ffmpeg` 指令變成可維護的程式碼（並確保安全）

就啟用這個 skill。

## 快速開工流程（Agent）

1. 先讀：`AGENTS.md`
2. 再讀：`docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/CLI_MAPPING.md`
3. 以「YouTube 單支影片」做 end-to-end（最小可行）
4. 再擴充：字幕 → 播放清單 → 區間 → cookies

## 安全硬規則（很重要）

- 執行外部命令一律用「參數陣列」：不要用字串拼接（避免 injection）
- cookies 視為敏感：不寫 log、不提交、UI 需提示

## 輸出規範（MVP）

- 預設：`downloads/<platform>/<title>/<title>.<ext>`
- playlist：`downloads/<platform>/<playlist_title>/<index> - <title>.<ext>`
- 檔名淨化（Windows 兼容）：移除 `<>:\"/\\|?*`

## 參考資料（需要時才讀）

- `references/yt-dlp_flags.md`：常用旗標與 GUI 映射摘要
- `references/platform_notes.md`：平台注意事項（cookies/不穩定）

