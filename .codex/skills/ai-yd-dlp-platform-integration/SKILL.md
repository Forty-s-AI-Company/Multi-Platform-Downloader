---
name: ai-yd-dlp-platform-integration
description: ai_yd-dlp 平台整合技能：針對需要登入/cookies 或需抓 m3u8 的平台（如 Skool）提供可重用的整合流程與注意事項。
---

# Platform Integration Skill

## 何時使用

當你要：
- 新增/強化某平台支援（IG/TikTok/Douyin/Skool…）
- 處理「需要 cookies 才能下載」或「yt-dlp 直抓不到」的案例
- 把 Playwright 抓 m3u8 的流程產品化

就用這個 skill。

## 整合策略（先選最省事的）

1. **能直接用 yt-dlp URL 就直接用**（最穩/最省）
2. 若失敗，提供 cookies 方案：
   - 匯入 `cookies.txt`
   - 或 `--cookies-from-browser chrome:Default`
3. 若仍失敗（例如資源藏在播放器裡），採用「抓 m3u8」：
   - Playwright 開頁面 → 監聽 request → 找到 `.m3u8` → 丟給 `yt-dlp` 下載

## 安全提醒

- Playwright 若要非 headless，UI/UX 要明確：這是為了取得串流 URL
- cookies 不得寫入 log；抓到的 m3u8 也可能帶 token，log 要遮罩

## 參考資料（需要時才讀）

- `references/cookies_and_auth.md`
- `references/skool_m3u8_playwright.md`

