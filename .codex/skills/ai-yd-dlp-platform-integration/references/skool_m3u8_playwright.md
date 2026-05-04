# Skool：Playwright 抓 m3u8 → yt-dlp 下載（參考流程）

你桌面 `C:\Users\eden\Desktop\yt-dlp\skool_download\skool_auto.py` 的精華流程：

1. 開啟 Chromium（通常 `headless=false`）
2. 載入 cookies（Netscape 格式的 `cookies.txt`）
3. 監聽每個 request，抓到含 `.m3u8` 的 URL
4. 用 `yt-dlp --cookies <file> --referer https://www.skool.com/ <m3u8_url>` 下載

產品化時建議加：
- 找不到 m3u8 的 timeout（例如 60 秒）
- 多個 m3u8 時取「最像 master playlist」或讓使用者選

