# 參考：你桌面 `C:\Users\eden\Desktop\yt-dlp` 的腳本做法整理

我把你現有的工作流程「翻譯」成可讓 GUI/worker 直接採用的思路，避免重造輪子。

## download_video.bat（影片 + 字幕）

重點：
- 先 `yt-dlp -F` 讓人選格式碼（例 `399+140`）
- 下載時加字幕：
  - `--write-subs --write-auto-subs --sub-lang "zh-Hant,en"`
- 輸出分資料夾：
  - `download\\videos\\%(title)s\\%(title)s.%(ext)s`

## download_video-sections.bat（區間下載）

重點：
- `--download-sections "*START-END"`
- 一樣可先 `-F` 選格式碼

## download_music.bat（播放清單音訊 mp3）

重點：
- `-x --audio-format mp3 --audio-quality 0 --yes-playlist`
- 透過 `--parse-metadata` 取得 playlist title 來做資料夾分層（GUI 端也可以用 playlist_title 事件/欄位做）

## download_video_live_need_cookies.bat（cookies 下載 / 直播）

重點：
- 支援兩種 cookies 來源：
  - `--cookies "<cookies.txt>"`
  - `--cookies-from-browser chrome:Default`
- `--live-from-start`（直播從頭）

## skool_download（Playwright 抓 m3u8 + yt-dlp）

重點：
- Playwright 開瀏覽器（非 headless）監聽 request，抓到 `.m3u8` URL
- 再用 `yt-dlp --cookies <file> --referer https://www.skool.com/ -o <path> <m3u8_url>`

> 這套路很實用：當某些平台的直連被藏起來時，用「瀏覽器看得到的」方式先取到 m3u8，再交給 yt-dlp 下載。

