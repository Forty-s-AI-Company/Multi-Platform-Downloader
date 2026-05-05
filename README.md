<div align="center">

# Multi-Platform Downloader

跨平台影音、音訊、字幕下載桌面工具  
基於 `Electron + React + Vite + TypeScript + yt-dlp + ffmpeg`

<p>
  <a href="https://github.com/Forty-s-AI-Company/Multi-Platform-Downloader/releases/latest">
    <img src="https://img.shields.io/github/v/release/Forty-s-AI-Company/Multi-Platform-Downloader?style=for-the-badge&label=version" alt="version" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge" alt="platform" />
  <img src="https://img.shields.io/badge/license-Private-6b7280?style=for-the-badge" alt="license" />
  <img src="https://img.shields.io/badge/PRs-welcome-22c55e?style=for-the-badge" alt="prs welcome" />
</p>

<p>
  <img src="https://img.shields.io/badge/Electron-Desktop-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-UI-61DAFB?style=flat-square&logo=react&logoColor=111827" alt="React" />
  <img src="https://img.shields.io/badge/Vite-Build-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TypeScript-Code-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/yt--dlp-Downloader-FF0000?style=flat-square" alt="yt-dlp" />
  <img src="https://img.shields.io/badge/ffmpeg-Transcoding-0ea5e9?style=flat-square" alt="ffmpeg" />
</p>

<p>
  <a href="https://github.com/Forty-s-AI-Company/Multi-Platform-Downloader/releases/latest"><strong>下載最新版本</strong></a>
  ·
  <a href="https://github.com/Forty-s-AI-Company/Multi-Platform-Downloader/releases">所有 Releases</a>
</p>

</div>

---

## 專案簡介

`Multi-Platform Downloader` 是一套本機桌面下載工具，目標是把 `yt-dlp` 的能力包裝成更直覺的 GUI 體驗。

目前支援：

- 多平台網址貼上與佇列下載
- 影片 / 音訊下載
- 字幕 / 自動字幕 / `srt` 轉換
- 播放清單下載
- 區間下載
- `cookies.txt` 與瀏覽器 cookies
- Douyin / Skool 專用擷取路線
- 單筆暫停 / 繼續 / 取消
- 失敗項目一鍵重跑

---

## 下載

- 最新版本下載頁：<https://github.com/Forty-s-AI-Company/Multi-Platform-Downloader/releases/latest>
- 所有 Release：<https://github.com/Forty-s-AI-Company/Multi-Platform-Downloader/releases>
- Windows 安裝版：`ai_yt-dlp Setup *.exe`
- Windows 免安裝版：`ai_yt-dlp-win-unpacked.zip`
- macOS 安裝版：`ai_yt-dlp-*.dmg`

---

## 介面截圖

### 主畫面

![主畫面](docs/screenshots/app-main.png)

### 下載列表

![下載列表](docs/screenshots/download-list.png)

---

## 快速開始

### 方式一：直接使用 Windows 打包版

1. 開啟 `release/win-unpacked/ai_yt-dlp.exe`
2. 貼上網址
3. 選擇輸出資料夾
4. 按右上角 `加入下載`

如果你要安裝版：

- `release/ai_yt-dlp Setup 0.0.1.exe`

### 方式二：從原始碼開發

#### 1. 安裝環境

- Node.js 20+
- `yt-dlp`
- `ffmpeg`

請先確認這兩個指令有在 PATH：

```bash
yt-dlp --version
ffmpeg -version
```

#### 2. 安裝套件

```bash
npm install
```

#### 3. 啟動開發模式

```bash
npm run dev
```

#### 4. 建置

```bash
npm run build
```

#### 5. 打包 Windows 版本

```bash
npm run dist:win
```

打包完成後會在：

- `release/win-unpacked/ai_yt-dlp.exe`
- `release/ai_yt-dlp Setup 0.0.1.exe`

#### 6. 打包 macOS DMG

如果你人在 macOS 本機：

```bash
npm run dist:mac
```

如果你現在是在 Windows 開發，專案也已經內建 GitHub Actions workflow，會用 macOS runner 產出 `.dmg` 並上傳到 Release。

---

## 使用教學

### 1. 一般影片下載

1. 把網址貼到左側 `網址`
2. 選擇 `輸出資料夾`
3. 按 `加入下載`
4. 任務會進入右側列表，依序下載

### 2. 只下載音訊

1. 展開 `進階設定`
2. 將 `下載模式` 改成 `音訊`
3. 選擇音質
4. 加入下載

### 3. 下載字幕

1. 展開 `進階設定`
2. 勾選 `下載字幕`
3. 如果需要自動字幕，再勾 `下載自動字幕`
4. 如果想轉成 `srt`，勾選 `轉成 SRT`

### 4. 下載播放清單

1. 展開 `進階設定`
2. 勾選 `下載播放清單`
3. 貼上播放清單網址
4. 加入下載

### 5. 下載指定區間

1. 展開 `進階設定`
2. 勾選 `下載指定區間`
3. 填入開始時間與結束時間
4. 時間格式使用 `HH:MM:SS`

### 6. Douyin 作者頁 / 搜尋頁批次下載

1. 切到 `抖音` 分頁
2. 貼上作者頁、搜尋頁或列表頁網址
3. 按 `加入下載`
4. 程式會打開 Douyin 視窗
5. 往下滑到你想收集的作品數量
6. 按右下角 `完成收集並開始下載`

### 7. 重跑失敗項目

如果某些任務失敗：

1. 看右側工具列的 `失敗` 計數
2. 直接按 `重跑失敗項目`
3. 所有失敗任務會重新排進佇列

---

## 平台注意事項

### Douyin

- 先走頁面直讀
- 抓不到實際媒體時，改走瀏覽器擷取
- 仍失敗才 fallback 到 `yt-dlp`
- 內建會攔掉 `bytedance://` 類 deep link

### Skool

- 有些內容需要登入
- 如果直連抓不到，會走瀏覽器擷取串流
- 建議搭配 cookies 或已登入 session

---

## 下載列表功能

- 暫停下載 / 繼續下載
- 單筆任務暫停 / 繼續 / 取消
- 刪除選取
- 清除已完成
- 清空列表
- 詳情展開
- 右鍵操作：重新下載 / 開啟資料夾 / 複製網址

---

## 技術棧

- Electron
- React 18
- Vite
- TypeScript
- Node.js
- `yt-dlp`
- `ffmpeg`
- Vitest
- ESLint

---

## 專案結構

```text
.
├─ build/                 # icon 與打包資產
├─ docs/                  # PRD / 架構 / 指令對照 / 截圖
├─ electron/              # main process / preload / worker
├─ scripts/               # 打包與輔助腳本
├─ shared/                # 共用型別與工具
├─ src/                   # renderer UI 與測試
├─ AGENTS.md              # Codex / AI Agent 專案規則
└─ README.md
```

---

## GitHub 上傳教學

這個專案目前對應的 repo：

- `git@github.com:Forty-s-AI-Company/Multi-Platform-Downloader.git`

### 第一次推上去

```bash
git add .
git commit -m "Initial project setup"
git push -u origin main
```

### 後續更新

```bash
git add .
git commit -m "Update downloader features"
git push
```

### 確認 remote

```bash
git remote -v
```

---

## 開發文件

- `AGENTS.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/CLI_MAPPING.md`
- `docs/PLATFORM_SUPPORT.md`
- `docs/TIKTOK_DOUYIN_CLEAN_ROOM_PLAN.md`

---

## License

目前未附授權條款；如果之後要公開協作，建議補上 `MIT` 或你自己的商業授權說明。
