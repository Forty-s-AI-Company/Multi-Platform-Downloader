import { app, BrowserWindow, session } from "electron";
import type { CookiesSetDetails } from "electron";
import type { Session } from "electron";

let skoolWindow: BrowserWindow | null = null;
const skoolPartition = "persist:skool";
let skoolSession: Session | null = null;

type CaptureState = {
  foundUrl: string | null;
  onLog: (line: string) => void;
};

let captureState: CaptureState | null = null;
let handlerInstalled = false;

async function getSkoolSession(): Promise<Session> {
  // Electron 規則：session 只能在 app ready 後取得（避免你看到的 crash）
  if (!app.isReady()) {
    await app.whenReady();
  }
  if (!skoolSession) {
    skoolSession = session.fromPartition(skoolPartition, { cache: true });
  }
  return skoolSession;
}

async function ensureRequestHandlerInstalled() {
  if (handlerInstalled) return;
  const ses = await getSkoolSession();
  handlerInstalled = true;

  const filter = { urls: ["*://*/*"] };
  ses.webRequest.onBeforeRequest(
    filter,
    (details: { url: string }, callback: (r: { cancel: boolean }) => void) => {
      try {
        if (captureState && !captureState.foundUrl) {
          const u = details.url;
          // Skool 常見：HLS（m3u8）或 DASH（mpd）。mpd 若是 DRM 仍可能無法下載，但至少可以更早判斷。
          if (u.includes(".m3u8") || u.includes(".mpd")) {
            captureState.foundUrl = u;
            const base = u.split("?")[0] ?? u;
            captureState.onLog(`[skool] 偵測到串流：${base}?***`);
          }
        }
      } finally {
        callback({ cancel: false });
      }
    }
  );
}

type GetSkoolM3u8Params = {
  url: string;
  jobId: string;
  cookies: CookiesSetDetails[];
  onLog: (line: string) => void;
  timeoutMs?: number;
};

export async function getSkoolM3u8(
  params: GetSkoolM3u8Params
): Promise<{ m3u8Url: string; pageTitle: string | null }> {
  const { url, cookies, onLog } = params;
  const timeoutMs = params.timeoutMs ?? 120_000;

  // 重要：Skool 用固定的 persist session，讓你「登入一次」後就能沿用，
  // 這樣體驗才會像你桌面的 skool_download（不會每次都像全新瀏覽器）。
  // 目前先假設同一時間只跑一個 Skool job；若未來要並行，再改成 job queue/互斥即可。
  const ses = await getSkoolSession();
  await ensureRequestHandlerInstalled();

  if (cookies.length) {
    onLog(`[skool] 載入 cookies（${cookies.length} 筆）`);
    for (const c of cookies) {
      try {
        await ses.cookies.set(c);
      } catch (e) {
        onLog(`[skool] cookies.set 失敗：${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else {
    onLog("[skool] 未提供 cookies：如果你第一次使用，請在視窗中先登入一次，之後就會記住登入狀態");
  }

  captureState = { foundUrl: null, onLog };

  const win =
    skoolWindow && !skoolWindow.isDestroyed()
      ? skoolWindow
      : new BrowserWindow({
          width: 1100,
          height: 760,
          title: "Skool 擷取模式（請按播放）",
          webPreferences: {
            session: ses,
            contextIsolation: true,
            nodeIntegration: false
          }
        });

  skoolWindow = win;

  win.setMenuBarVisibility(false);
  win.show();
  win.focus();

  onLog("[skool] 開啟頁面中…");
  await win.loadURL(url);

  onLog(
    "[skool] 請在 Skool 視窗中「按播放」。偵測到串流後會自動開始下載；此視窗會保留以便下一支 Skool 影片沿用登入。"
  );

  const pageTitle = safeGetTitle(win);

  const start = Date.now();
  let lastPing = 0;
  while (!captureState.foundUrl) {
    if (win.isDestroyed()) break;
    if (Date.now() - start > timeoutMs) break;
    const elapsed = Date.now() - start;
    if (elapsed - lastPing > 5000) {
      lastPing = elapsed;
      onLog("[skool] 等待播放器請求串流中…（請確認已按播放）");
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const found = captureState.foundUrl;
  captureState = null;

  if (!found) {
    throw new Error(
      [
        "Skool 擷取逾時：沒有偵測到串流請求（.m3u8/.mpd）。",
        "請確認：",
        "1) Skool 視窗已登入且你有權限觀看",
        "2) 你有按下播放（影片真的開始跑）",
        "3) 若影片是 DRM（Widevine）則通常無法用 yt-dlp 下載"
      ].join("\n")
    );
  }

  if (found.includes(".mpd")) {
    onLog("[skool] 這支影片是 .mpd（DASH）。如果是 DRM 影片，yt-dlp 仍可能下載失敗。");
  }

  return { m3u8Url: found, pageTitle };
}

function safeGetTitle(win: BrowserWindow): string | null {
  try {
    const t = win.webContents.getTitle();
    return t?.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}
