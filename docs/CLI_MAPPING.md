# GUI 選項 ↔ yt-dlp/ffmpeg 指令對照

這份文件的目的很單純：之後做 UI 時，每個選項都能「直接對到一段指令」。

## 1) 先列出可用格式（給進階模式用）

- 顯示格式清單：`yt-dlp -F "<URL>"`

## 2) 影片下載（合併成 mp4）

- 使用者輸入格式碼（例 `399+140`）：
  - `yt-dlp -f 399+140 --merge-output-format mp4 -o "<OUTPUT_TEMPLATE>" "<URL>"`

## 3) 只抓音訊（mp3）

- 高音質（參考你桌面腳本的做法）：
  - `yt-dlp -x --audio-format mp3 --audio-quality 0 --yes-playlist -o "<OUTPUT_TEMPLATE>" "<URL>"`

> `--audio-quality 0` 通常代表最佳；UI 可以用「最佳/一般」做抽象，必要時再開進階。

## 4) 字幕（手動 + 自動）

- 下載字幕 + 自動字幕（預設語言 `zh-Hant,en`）：
  - `yt-dlp --write-subs --write-auto-subs --sub-langs "zh-Hant,en" "<URL>"`
- 轉成 srt（可選）：
  - `yt-dlp --convert-subs srt --write-subs --write-auto-subs --sub-langs "zh-Hant,en" "<URL>"`

## 5) 區間下載（開始/結束時間）

- 例：`00:01:10` 到 `00:03:40`：
  - `yt-dlp --download-sections "*00:01:10-00:03:40" -f "<FORMAT>" --merge-output-format mp4 -o "<OUTPUT_TEMPLATE>" "<URL>"`

## 6) Cookies（需要登入的平台）

- 匯入 cookies.txt：
  - `yt-dlp --cookies "<COOKIES_FILE>" "<URL>"`
- 從 Chrome 讀取（Windows 常用）：
  - `yt-dlp --cookies-from-browser chrome:Default "<URL>"`

> GUI 需要提醒：cookies 檔案是敏感資料，務必只存在本機、不上傳。

