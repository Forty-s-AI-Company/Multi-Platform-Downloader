# yt-dlp 常用旗標（GUI 映射用）

> 這份放「夠用就好」的常見旗標，避免 SKILL.md 太肥。

## 格式/畫質

- 列出格式：`-F`
- 指定格式：`-f <FORMAT>`（例 `399+140`）
- 合併輸出：`--merge-output-format mp4`

## 音訊

- 抽取音訊：`-x`
- 音訊格式：`--audio-format mp3`
- 音訊品質：`--audio-quality 0`（通常最佳）

## 字幕

- 寫字幕：`--write-subs`
- 自動字幕：`--write-auto-subs`
- 語言：`--sub-langs "zh-Hant,en"`
- 轉檔字幕：`--convert-subs srt`
-（可選）內嵌字幕：`--embed-subs`

## 播放清單

- 允許 playlist：`--yes-playlist`
- 不下載 playlist：`--no-playlist`

## 區間

- `--download-sections "*HH:MM:SS-HH:MM:SS"`

## Cookies

- cookies 檔：`--cookies "<path>"`
- 從瀏覽器讀：`--cookies-from-browser chrome:Default`

