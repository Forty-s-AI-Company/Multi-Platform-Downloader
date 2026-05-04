import { app, BrowserWindow, session } from "electron";
import type { CookiesSetDetails, Session } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isUsableDouyinMediaUrl } from "./douyinUrlGuards.js";
import { normalizeWebTitle } from "./sanitize.js";

const douyinPartition = "persist:douyin";
const collectorDoneFlag = "__AI_YD_DLP_DOUYIN_COLLECT_DONE__";

let douyinSession: Session | null = null;
let douyinWindow: BrowserWindow | null = null;
let requestHandlerInstalled = false;

type CaptureState = {
  foundUrl: string | null;
  onLog: (line: string) => void;
};

let captureState: CaptureState | null = null;
const protectedWindows = new WeakSet<BrowserWindow>();
const windowLoggers = new WeakMap<BrowserWindow, (line: string) => void>();

export async function extractDouyinPageMedia(params: {
  url: string;
  cookies: CookiesSetDetails[];
  onLog: (line: string) => void;
  timeoutMs?: number;
}): Promise<{ mediaUrl: string; pageTitle: string | null; thumbnailUrl: string | null } | null> {
  const { url, cookies, onLog } = params;
  const timeoutMs = params.timeoutMs ?? 18_000;

  const ses = await getDouyinSession();
  await ensureRequestHandlerInstalled();
  await applyCookies(ses, cookies, onLog);

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  protectDouyinWindow(win, onLog);

  try {
    await win.loadURL(url);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const extracted = await readDouyinPageMedia(win);
      if (extracted?.mediaUrl) {
        onLog("[douyin] 已從頁面直接解析到媒體位址。");
        return {
          mediaUrl: extracted.mediaUrl,
          pageTitle: extracted.pageTitle,
          thumbnailUrl: extracted.thumbnailUrl
        };
      }
      await sleep(700);
    }

    onLog("[douyin] 頁面直接解析未取得媒體位址，改走瀏覽器 request 擷取。");
    return null;
  } finally {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
}

async function getDouyinSession(): Promise<Session> {
  if (!app.isReady()) {
    await app.whenReady();
  }

  if (!douyinSession) {
    douyinSession = session.fromPartition(douyinPartition, { cache: true });
  }

  return douyinSession;
}

async function ensureRequestHandlerInstalled() {
  if (requestHandlerInstalled) return;

  const ses = await getDouyinSession();
  requestHandlerInstalled = true;

  ses.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    try {
      if (captureState && !captureState.foundUrl) {
        const mediaUrl = extractDouyinMediaUrl(details.url);
        if (mediaUrl) {
          captureState.foundUrl = mediaUrl;
          captureState.onLog(`[douyin] 偵測到媒體請求：${maskQuery(mediaUrl)}`);
        }
      }
    } finally {
      callback({ cancel: false });
    }
  });
}

export async function captureDouyinMedia(params: {
  jobId: string;
  url: string;
  cookies: CookiesSetDetails[];
  onLog: (line: string) => void;
  timeoutMs?: number;
}): Promise<{ mediaUrl: string; pageTitle: string | null; thumbnailUrl: string | null }> {
  const { jobId, url, cookies, onLog } = params;
  const timeoutMs = params.timeoutMs ?? 45_000;

  const ses = await getDouyinSession();
  await ensureRequestHandlerInstalled();
  await applyCookies(ses, cookies, onLog);

  captureState = { foundUrl: null, onLog };

  const win = await ensureDouyinWindow({
    title: "Douyin 單支擷取",
    width: 1100,
    height: 760,
    onLog
  });

  onLog("[douyin] 已打開作品頁，請按播放讓頁面送出影片請求。");
  await win.loadURL(url);

  const startedAt = Date.now();
  let lastPingAt = 0;

  while (!captureState.foundUrl) {
    if (win.isDestroyed()) break;

    const elapsed = Date.now() - startedAt;
    if (elapsed > timeoutMs) break;

    if (elapsed - lastPingAt >= 5000) {
      lastPingAt = elapsed;
      onLog("[douyin] 等待影片請求中，請確認你已按播放，畫面有真的開始跑。");
    }

    await sleep(500);
  }

  const foundUrl = captureState.foundUrl;
  captureState = null;

  if (!foundUrl) {
    throw new Error(
      [
        "Douyin 專用擷取逾時，還沒抓到實際影片網址。",
        "請確認：",
        "1) 影片有真的開始播放。",
        "2) 如果頁面需要登入，session 裡已有可用 cookies。",
        "3) 如果這支仍抓不到，系統會改走 yt-dlp fallback。"
      ].join("\n")
    );
  }

  return {
    mediaUrl: foundUrl,
    pageTitle: safeGetTitle(win),
    thumbnailUrl: await captureDouyinThumbnail(win, jobId, onLog)
  };
}

export async function collectDouyinVideoUrls(params: {
  url: string;
  cookies: CookiesSetDetails[];
  onLog?: (line: string) => void;
}): Promise<string[]> {
  const { url, cookies } = params;
  const onLog = params.onLog ?? (() => {});

  const ses = await getDouyinSession();
  await ensureRequestHandlerInstalled();
  await applyCookies(ses, cookies, onLog);

  const win = await ensureDouyinWindow({
    title: "Douyin 批次收集",
    width: 1180,
    height: 820,
    onLog
  });

  const foundUrls = new Set<string>();
  let closed = false;

  const handleClosed = () => {
    closed = true;
  };

  win.once("closed", handleClosed);

  try {
    onLog("[douyin] 已打開抖音頁面，請往下滑到你要的作品數量。");
    onLog("[douyin] 滑夠後按右下角「完成收集並開始下載」。");

    await win.loadURL(url);
    await injectCollectorOverlay(win);

    while (!closed) {
      const urlsOnPage = await readDouyinUrlsFromPage(win);
      for (const entry of urlsOnPage) {
        foundUrls.add(entry);
      }

      await updateCollectorOverlay(win, foundUrls.size);

      if (await readCollectorDone(win)) {
        onLog(`[douyin] 已完成收集，共 ${foundUrls.size} 筆作品網址。`);
        break;
      }

      await sleep(800);
    }
  } finally {
    win.removeListener("closed", handleClosed);
    if (!win.isDestroyed()) {
      win.close();
    }
  }

  return [...foundUrls];
}

async function applyCookies(
  ses: Session,
  cookies: CookiesSetDetails[],
  onLog: (line: string) => void
) {
  if (cookies.length === 0) return;

  onLog(`[douyin] 已套用 cookies：${cookies.length} 筆`);
  for (const cookie of cookies) {
    try {
      await ses.cookies.set(cookie);
    } catch (error) {
      onLog(`[douyin] cookies.set 失敗：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function ensureDouyinWindow(options: {
  title: string;
  width: number;
  height: number;
  onLog?: (line: string) => void;
}): Promise<BrowserWindow> {
  const ses = await getDouyinSession();

  const win =
    douyinWindow && !douyinWindow.isDestroyed()
      ? douyinWindow
      : new BrowserWindow({
          width: options.width,
          height: options.height,
          title: options.title,
          show: true,
          webPreferences: {
            session: ses,
            contextIsolation: true,
            nodeIntegration: false
          }
        });

  douyinWindow = win;
  protectDouyinWindow(win, options.onLog);
  win.setTitle(options.title);
  win.setMenuBarVisibility(false);
  win.show();
  win.focus();

  return win;
}

function protectDouyinWindow(win: BrowserWindow, onLog?: (line: string) => void) {
  if (onLog) {
    windowLoggers.set(win, onLog);
  }

  if (protectedWindows.has(win)) return;
  protectedWindows.add(win);

  const blockIfNeeded = (targetUrl: string): boolean => {
    if (isAllowedDouyinNavigation(targetUrl)) {
      return false;
    }

    const logger = windowLoggers.get(win);
    logger?.(`[douyin] 已攔截外部協定跳轉：${maskDangerousUrl(targetUrl)}`);
    return true;
  };

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (blockIfNeeded(url)) {
      return { action: "deny" };
    }

    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, targetUrl) => {
    if (blockIfNeeded(targetUrl)) {
      event.preventDefault();
    }
  });

  win.webContents.on("will-redirect", (event, targetUrl) => {
    if (blockIfNeeded(targetUrl)) {
      event.preventDefault();
    }
  });

  const contentsWithExtraEvents = win.webContents as typeof win.webContents & {
    on: (eventName: string, listener: (...args: unknown[]) => void) => typeof win.webContents;
  };

  contentsWithExtraEvents.on("will-frame-navigate", (...args: unknown[]) => {
    const event = args[0] as { preventDefault: () => void };
    const targetUrl = typeof args[1] === "string" ? args[1] : "";
    if (targetUrl && blockIfNeeded(targetUrl)) {
      event.preventDefault();
    }
  });

  win.webContents.on("did-create-window", (childWindow, details) => {
    const targetUrl = details.url ?? "";
    if (blockIfNeeded(targetUrl)) {
      childWindow.close();
      return;
    }

    childWindow.close();
  });
}

async function injectCollectorOverlay(win: BrowserWindow) {
  if (win.isDestroyed()) return;

  try {
    await win.webContents.executeJavaScript(
      `(() => {
        const FLAG_KEY = ${JSON.stringify(collectorDoneFlag)};
        const ROOT_ID = "ai-yd-dlp-douyin-collector";
        const BADGE_ID = ROOT_ID + "-count";
        const BUTTON_ID = ROOT_ID + "-button";

        const mount = () => {
          let root = document.getElementById(ROOT_ID);
          if (!root) {
            root = document.createElement("div");
            root.id = ROOT_ID;
            root.style.position = "fixed";
            root.style.right = "20px";
            root.style.bottom = "20px";
            root.style.zIndex = "2147483647";
            root.style.display = "flex";
            root.style.flexDirection = "column";
            root.style.gap = "8px";
            root.style.alignItems = "flex-end";

            const badge = document.createElement("div");
            badge.id = BADGE_ID;
            badge.textContent = "已收集 0 筆";
            badge.style.padding = "8px 12px";
            badge.style.borderRadius = "999px";
            badge.style.background = "rgba(18, 33, 53, 0.88)";
            badge.style.color = "#fff";
            badge.style.fontSize = "13px";
            badge.style.fontWeight = "600";
            badge.style.boxShadow = "0 6px 18px rgba(0,0,0,0.28)";

            const button = document.createElement("button");
            button.id = BUTTON_ID;
            button.type = "button";
            button.textContent = "完成收集並開始下載";
            button.style.padding = "12px 18px";
            button.style.border = "none";
            button.style.borderRadius = "12px";
            button.style.cursor = "pointer";
            button.style.background = "#1677ff";
            button.style.color = "#fff";
            button.style.fontSize = "14px";
            button.style.fontWeight = "700";
            button.style.boxShadow = "0 10px 24px rgba(22,119,255,0.35)";
            button.addEventListener("click", () => {
              window[FLAG_KEY] = true;
              button.textContent = "已完成收集，準備返回程式...";
              button.disabled = true;
              button.style.opacity = "0.88";
            });

            root.appendChild(badge);
            root.appendChild(button);
            document.body.appendChild(root);
          }

          window[FLAG_KEY] = false;
        };

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", mount, { once: true });
        } else {
          mount();
        }
      })()`,
      true
    );
  } catch {
    // 頁面如果剛好在跳轉，下一輪更新時會再補一次。
  }
}

async function updateCollectorOverlay(win: BrowserWindow, count: number) {
  if (win.isDestroyed()) return;

  try {
    await win.webContents.executeJavaScript(
      `(() => {
        const badge = document.getElementById("ai-yd-dlp-douyin-collector-count");
        if (badge) {
          badge.textContent = ${JSON.stringify(`已收集 ${count} 筆`)};
        }
      })()`,
      true
    );
  } catch {
    // 忽略短暫導頁造成的例外。
  }
}

async function readCollectorDone(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) return false;

  try {
    const result = await win.webContents.executeJavaScript(
      `Boolean(window[${JSON.stringify(collectorDoneFlag)}])`,
      true
    );
    return Boolean(result);
  } catch {
    return false;
  }
}

function safeGetTitle(win: BrowserWindow): string | null {
  try {
    const title = win.webContents.getTitle();
    return title?.trim() ? normalizeWebTitle(title.trim()) : null;
  } catch {
    return null;
  }
}

function extractDouyinMediaUrl(input: string): string | null {
  const lower = input.toLowerCase();
  if (!lower.startsWith("http")) return null;
  if (lower.includes(".mp4")) return input;
  if (lower.includes("/play/") || lower.includes("/playwm/") || lower.includes("video/tos/")) {
    return input;
  }
  if (lower.includes(".m3u8") || lower.includes(".mpd")) return input;
  return null;
}

async function captureDouyinThumbnail(
  win: BrowserWindow,
  jobId: string,
  onLog: (line: string) => void
): Promise<string | null> {
  const domThumbnail = await readDouyinThumbnailFromPage(win);
  if (domThumbnail) {
    onLog("[douyin] 已抓到頁面縮圖來源。");
    return domThumbnail;
  }

  const bounds = await readDouyinVideoBounds(win);
  if (!bounds) {
    onLog("[douyin] 沒抓到可用的播放器範圍，略過截圖縮圖。");
    return null;
  }

  try {
    const image = await win.webContents.capturePage(bounds);
    if (image.isEmpty()) {
      return null;
    }

    const thumbnailDir = path.join(app.getPath("userData"), "thumbnails");
    fs.mkdirSync(thumbnailDir, { recursive: true });
    const thumbnailPath = path.join(thumbnailDir, `${jobId}.png`);
    fs.writeFileSync(thumbnailPath, image.toPNG());
    onLog("[douyin] 已從播放器畫面截取縮圖。");
    return pathToFileURL(thumbnailPath).toString();
  } catch (error) {
    onLog(`[douyin] 擷取縮圖失敗：${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function readDouyinThumbnailFromPage(win: BrowserWindow): Promise<string | null> {
  if (win.isDestroyed()) return null;

  try {
    const result = await win.webContents.executeJavaScript(
      `(() => {
        const normalize = (value) => {
          if (!value || typeof value !== "string") return null;
          try {
            const normalized = new URL(value, location.href);
            if (normalized.protocol === "blob:") return null;
            if (normalized.protocol !== "http:" && normalized.protocol !== "https:") return null;
            return normalized.toString();
          } catch {
            return null;
          }
        };

        const candidates = [
          document.querySelector('video')?.getAttribute('poster'),
          document.querySelector('video')?.poster,
          document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
          document.querySelector('meta[name="twitter:image"]')?.getAttribute('content'),
          document.querySelector('img[src*="douyinpic"]')?.getAttribute('src'),
          document.querySelector('img[src*="tos-cn-p"]')?.getAttribute('src')
        ];

        for (const item of candidates) {
          const normalized = normalize(item);
          if (normalized) return normalized;
        }

        return null;
      })()`,
      true
    );

    return typeof result === "string" && result.trim() ? result : null;
  } catch {
    return null;
  }
}

async function readDouyinVideoBounds(
  win: BrowserWindow
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  if (win.isDestroyed()) return null;

  try {
    const result = await win.webContents.executeJavaScript(
      `(() => {
        const element =
          document.querySelector('video') ||
          document.querySelector('img[src*="douyinpic"]') ||
          document.querySelector('img[src*="tos-cn-p"]');
        if (!element) return null;

        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        return {
          x: Math.max(0, Math.floor(rect.left)),
          y: Math.max(0, Math.floor(rect.top)),
          width: Math.max(1, Math.floor(rect.width)),
          height: Math.max(1, Math.floor(rect.height))
        };
      })()`,
      true
    );

    if (
      result &&
      typeof result.x === "number" &&
      typeof result.y === "number" &&
      typeof result.width === "number" &&
      typeof result.height === "number"
    ) {
      return result;
    }

    return null;
  } catch {
    return null;
  }
}

async function readDouyinPageMedia(
  win: BrowserWindow
): Promise<{ mediaUrl: string | null; pageTitle: string | null; thumbnailUrl: string | null } | null> {
  if (win.isDestroyed()) return null;

  try {
    const result = await win.webContents.executeJavaScript(
      `(() => {
        const normalize = (value) => {
          if (!value || typeof value !== "string") return null;
          try {
            const normalized = new URL(value, location.href);
            if (normalized.protocol === "blob:") return null;
            if (normalized.protocol !== "http:" && normalized.protocol !== "https:") return null;
            return normalized.toString();
          } catch {
            return null;
          }
        };

        const findFirst = (values) => {
          for (const value of values) {
            const normalized = normalize(value);
            if (normalized) return normalized;
          }
          return null;
        };

        const video = document.querySelector("video");
        const mediaUrl = findFirst([
          video?.currentSrc,
          video?.src,
          video?.querySelector?.("source")?.src,
          performance.getEntriesByType("resource")
            .map((entry) => entry.name)
            .find((name) => /\\.mp4|\\/play\\/|\\/playwm\\/|video\\/tos\\//i.test(name))
        ]);

        const thumbnailUrl = findFirst([
          video?.poster,
          video?.getAttribute?.("poster"),
          document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
          document.querySelector('meta[name="twitter:image"]')?.getAttribute("content"),
          document.querySelector('img[src*="douyinpic"]')?.getAttribute("src"),
          document.querySelector('img[src*="tos-cn-p"]')?.getAttribute("src")
        ]);

        const pageTitle = document.title?.trim() || null;
        return { mediaUrl, pageTitle, thumbnailUrl };
      })()`,
      true
    );

    if (!result || typeof result !== "object") return null;
    return {
      mediaUrl: isUsableDouyinMediaUrl(result.mediaUrl) ? result.mediaUrl : null,
      pageTitle: typeof result.pageTitle === "string" && result.pageTitle.trim() ? normalizeWebTitle(result.pageTitle.trim()) : null,
      thumbnailUrl: typeof result.thumbnailUrl === "string" ? result.thumbnailUrl : null
    };
  } catch {
    return null;
  }
}

async function readDouyinUrlsFromPage(win: BrowserWindow): Promise<string[]> {
  if (win.isDestroyed()) return [];

  try {
    const result = await win.webContents.executeJavaScript(
      `(() => {
        const urls = new Set();
        const normalize = (href) => {
          try {
            const url = new URL(href, location.href);
            if (!url.hostname.includes("douyin.com")) return null;
            if (/^\\/video\\/\\d+/.test(url.pathname)) return "https://www.douyin.com" + url.pathname;
            if (/^\\/note\\/\\d+/.test(url.pathname)) return "https://www.douyin.com" + url.pathname;
            return null;
          } catch {
            return null;
          }
        };

        for (const anchor of document.querySelectorAll("a[href]")) {
          const normalized = normalize(anchor.href);
          if (normalized) urls.add(normalized);
        }

        const current = normalize(location.href);
        if (current) urls.add(current);

        return Array.from(urls);
      })()`,
      true
    );

    return Array.isArray(result) ? result.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function maskQuery(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : `${url.slice(0, queryIndex)}?***`;
}

function isAllowedDouyinNavigation(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function maskDangerousUrl(targetUrl: string): string {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return maskQuery(targetUrl);
    }
    return `${parsed.protocol}//***`;
  } catch {
    return "***";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
