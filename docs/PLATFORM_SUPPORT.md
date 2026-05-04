# 平台支援與注意事項（以 yt-dlp 為主）

> 這份是「產品/工程都要看」的備忘錄：哪些平台通常可用、哪些常需要 cookies、哪些可能要另闢蹊徑（例如抓 m3u8）。

## YouTube（含 Shorts / Playlist）

- 常規下載：✅
- 播放清單：✅（`--yes-playlist`）
- 區間：✅（`--download-sections`）
- 字幕：✅（`--write-subs` / `--write-auto-subs`）
- 直播/會員內容：⚠️ 可能需要 cookies

## Instagram（Reels / 貼文影片）

- 常規下載：⚠️ 常需要 cookies/登入
- 建議 UI：提供「匯入 cookies / 從瀏覽器讀取」開關，並顯示提示

## TikTok / Douyin

- 常規下載：⚠️ 依地區/版本/反爬會變動
- 建議 UI：允許快速重試、可切換「使用 cookies」

## Skool

- `yt-dlp` 不一定能直接吃到資源：⚠️
- 你桌面參考做法：Playwright 監聽網路請求抓 `.m3u8` → `yt-dlp` 搭配 cookies 下載（見 `docs/REFERENCE_DESKTOP_YT_DLP.md`）

