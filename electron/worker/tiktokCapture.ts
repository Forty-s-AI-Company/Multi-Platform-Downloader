import { app, BrowserWindow, session } from "electron";
import type { CookiesSetDetails, Session } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractTikTokVideoUrlsFromCandidates } from "../../shared/platformCollection.js";
import type { CollectedVideoEntry } from "../../shared/types.js";
import { normalizeWebTitle } from "./sanitize.js";

const tiktokPartition = "persist:tiktok";
const collectorDoneFlag = "__AI_YD_DLP_TIKTOK_COLLECT_DONE__";

let tiktokSession: Session | null = null;
let tiktokWindow: BrowserWindow | null = null;
let requestHandlerInstalled = false;

type CaptureState = {
  foundUrl: string | null;
  onLog: (line: string) => void;
};

let captureState: CaptureState | null = null;
const protectedWindows = new WeakSet<BrowserWindow>();
const windowLoggers = new WeakMap<BrowserWindow, (line: string) => void>();

export async function extractTikTokPageMedia(params: {
  url: string;
  cookies: CookiesSetDetails[];
  onLog: (line: string) => void;
  timeoutMs?: number;
}): Promise<{ mediaUrl: string; pageTitle: string | null; thumbnailUrl: string | null } | null> {
  const { url, cookies, onLog } = params;
  const timeoutMs = params.timeoutMs ?? 15_000;

  const ses = await getTikTokSession();
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
  protectTikTokWindow(win, onLog);

  try {
    await win.loadURL(url);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const extracted = await readTikTokPageMedia(win);
      if (extracted?.mediaUrl) {
        onLog("[tiktok] 已從頁面直接解析到媒體位址。");
        return extracted;
      }
      await sleep(700);
    }

    onLog("[tiktok] 頁面直接解析未取得媒體位址，改走瀏覽器 request 擷取。");
    return null;
  } finally {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
}

export async function captureTikTokMedia(params: {
  jobId: string;
  url: string;
  cookies: CookiesSetDetails[];
  onLog: (line: string) => void;
  timeoutMs?: number;
}): Promise<{ mediaUrl: string; pageTitle: string | null; thumbnailUrl: string | null }> {
  const { jobId, url, cookies, onLog } = params;
  const timeoutMs = params.timeoutMs ?? 35_000;

  const ses = await getTikTokSession();
  await ensureRequestHandlerInstalled();
  await applyCookies(ses, cookies, onLog);

  captureState = { foundUrl: null, onLog };

  const win = await ensureTikTokWindow({
    title: "TikTok 擷取模式",
    width: 1100,
    height: 760,
    onLog
  });

  onLog("[tiktok] 已打開 TikTok 頁面，請確認影片有真的開始播放。");
  await win.loadURL(url);

  const startedAt = Date.now();
  let lastPingAt = 0;

  while (!captureState.foundUrl) {
    if (win.isDestroyed()) break;

    const elapsed = Date.now() - startedAt;
    if (elapsed > timeoutMs) break;

    if (elapsed - lastPingAt >= 5000) {
      lastPingAt = elapsed;
      onLog("[tiktok] 等待影片請求中，請確認畫面已經開始播放。");
    }

    await sleep(500);
  }

  const foundUrl = captureState.foundUrl;
  captureState = null;

  if (!foundUrl) {
    throw new Error(
      [
        "TikTok 瀏覽器擷取逾時。",
        "請先確認：",
        "1) 影片頁面已完整載入，且畫面有真的開始播放。",
        "2) 若頁面需要登入，請改用 cookies.txt 或瀏覽器 cookies。",
        "3) 若仍失敗，才會交給 yt-dlp fallback。"
      ].join("\n")
    );
  }

  return {
    mediaUrl: foundUrl,
    pageTitle: safeGetTitle(win),
    thumbnailUrl: await captureTikTokThumbnail(win, jobId, onLog)
  };
}

export async function collectTikTokVideoUrls(params: {
  url: string;
  cookies: CookiesSetDetails[];
  onLog?: (line: string) => void;
}): Promise<string[]> {
  const { url, cookies } = params;
  const onLog = params.onLog ?? (() => {});

  const ses = await getTikTokSession();
  await ensureRequestHandlerInstalled();
  await applyCookies(ses, cookies, onLog);

  const win = await ensureTikTokWindow({
    title: "TikTok 批次收集",
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
    onLog("[tiktok] 已打開 TikTok 頁面，請往下滑到你要的作品數量。");
    onLog("[tiktok] 滑夠後按右下角「完成收集並開始下載」。");

    await win.loadURL(url);
    await injectCollectorOverlay(win);

    while (!closed) {
      const urlsOnPage = await readTikTokUrlsFromPage(win);
      for (const entry of urlsOnPage) {
        foundUrls.add(entry);
      }

      await updateCollectorOverlay(win, foundUrls.size);

      if (await readCollectorDone(win)) {
        onLog(`[tiktok] 已完成收集，共 ${foundUrls.size} 筆作品網址。`);
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

export async function collectTikTokVideoEntries(params: {
  url: string;
  cookies: CookiesSetDetails[];
  onLog?: (line: string) => void;
}): Promise<CollectedVideoEntry[]> {
  const { url, cookies } = params;
  const onLog = params.onLog ?? (() => {});

  const ses = await getTikTokSession();
  await ensureRequestHandlerInstalled();
  await applyCookies(ses, cookies, onLog);

  const win = await ensureTikTokWindow({
    title: "TikTok 批次收集",
    width: 1180,
    height: 820,
    onLog
  });

  const foundEntries = new Map<string, CollectedVideoEntry>();
  let closed = false;

  const handleClosed = () => {
    closed = true;
  };

  win.once("closed", handleClosed);

  try {
    onLog("[tiktok] 已打開 TikTok 頁面，請往下滑到你要的作品數量。");
    onLog("[tiktok] 滑夠後按右下角「完成收集並開始下載」。");

    await win.loadURL(url);
    await injectCollectorOverlay(win);

    while (!closed) {
      const entriesOnPage = await readTikTokEntriesFromPage(win);
      for (const entry of entriesOnPage) {
        const previous = foundEntries.get(entry.url);
        foundEntries.set(entry.url, {
          url: entry.url,
          title: entry.title ?? previous?.title ?? null,
          thumbnail: entry.thumbnail ?? previous?.thumbnail ?? null
        });
      }

      await updateCollectorOverlay(win, foundEntries.size);

      if (await readCollectorDone(win)) {
        onLog(`[tiktok] 已完成收集，共 ${foundEntries.size} 筆作品網址。`);
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

  return [...foundEntries.values()];
}

async function getTikTokSession(): Promise<Session> {
  if (!app.isReady()) {
    await app.whenReady();
  }

  if (!tiktokSession) {
    tiktokSession = session.fromPartition(tiktokPartition, { cache: true });
  }

  return tiktokSession;
}

async function ensureRequestHandlerInstalled() {
  if (requestHandlerInstalled) return;

  const ses = await getTikTokSession();
  requestHandlerInstalled = true;

  ses.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    try {
      if (captureState && !captureState.foundUrl) {
        const mediaUrl = extractTikTokMediaUrl(details.url);
        if (mediaUrl) {
          captureState.foundUrl = mediaUrl;
          captureState.onLog(`[tiktok] 偵測到媒體請求：${maskQuery(mediaUrl)}`);
        }
      }
    } finally {
      callback({ cancel: false });
    }
  });
}

async function applyCookies(
  ses: Session,
  cookies: CookiesSetDetails[],
  onLog: (line: string) => void
) {
  if (cookies.length === 0) return;

  onLog(`[tiktok] 已套用 cookies：${cookies.length} 筆`);
  for (const cookie of cookies) {
    try {
      await ses.cookies.set(cookie);
    } catch (error) {
      onLog(`[tiktok] cookies.set 失敗：${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function ensureTikTokWindow(options: {
  title: string;
  width: number;
  height: number;
  onLog?: (line: string) => void;
}): Promise<BrowserWindow> {
  const ses = await getTikTokSession();

  const win =
    tiktokWindow && !tiktokWindow.isDestroyed()
      ? tiktokWindow
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

  tiktokWindow = win;
  protectTikTokWindow(win, options.onLog);
  win.setTitle(options.title);
  win.setMenuBarVisibility(false);
  win.show();
  win.focus();

  return win;
}

function protectTikTokWindow(win: BrowserWindow, onLog?: (line: string) => void) {
  if (onLog) {
    windowLoggers.set(win, onLog);
  }

  if (protectedWindows.has(win)) return;
  protectedWindows.add(win);

  const blockIfNeeded = (targetUrl: string): boolean => {
    if (isAllowedNavigation(targetUrl)) {
      return false;
    }

    const logger = windowLoggers.get(win);
    logger?.(`[tiktok] 已攔截外部協定跳轉：${maskDangerousUrl(targetUrl)}`);
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
        const ROOT_ID = "ai-yt-dlp-tiktok-collector";
        const BADGE_ID = ROOT_ID + "-count";

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
            button.type = "button";
            button.textContent = "完成收集並開始下載";
            button.style.padding = "12px 18px";
            button.style.border = "none";
            button.style.borderRadius = "12px";
            button.style.cursor = "pointer";
            button.style.background = "#fe2c55";
            button.style.color = "#fff";
            button.style.fontSize = "14px";
            button.style.fontWeight = "700";
            button.style.boxShadow = "0 10px 24px rgba(254,44,85,0.35)";
            button.addEventListener("click", () => {
              window[FLAG_KEY] = true;
              button.textContent = "正在整理收集結果...";
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
    // 頁面還在跳轉時覆蓋層可能暫時注入不到，下一輪會再補一次。
  }
}

async function updateCollectorOverlay(win: BrowserWindow, count: number) {
  if (win.isDestroyed()) return;

  try {
    await win.webContents.executeJavaScript(
      `(() => {
        const badge = document.getElementById("ai-yt-dlp-tiktok-collector-count");
        if (badge) {
          badge.textContent = "已收集 ${count} 筆";
        }
      })()`,
      true
    );
  } catch {
    // 頁面重新渲染時會短暫找不到 badge，下一輪更新即可。
  }
}

async function readCollectorDone(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) return true;

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

async function captureTikTokThumbnail(
  win: BrowserWindow,
  jobId: string,
  onLog: (line: string) => void
): Promise<string | null> {
  const pageThumbnail = await readTikTokThumbnailFromPage(win);
  if (pageThumbnail) {
    onLog("[tiktok] 已抓到頁面縮圖來源。");
    return pageThumbnail;
  }

  const bounds = await readTikTokVideoBounds(win);
  if (!bounds) {
    onLog("[tiktok] 沒抓到可用的播放器範圍，略過截圖縮圖。");
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
    onLog("[tiktok] 已從播放器畫面截取縮圖。");
    return pathToFileURL(thumbnailPath).toString();
  } catch (error) {
    onLog(`[tiktok] 擷取縮圖失敗：${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function readTikTokThumbnailFromPage(win: BrowserWindow): Promise<string | null> {
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
          document.querySelector('img[src*="tiktokcdn"]')?.getAttribute('src')
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

async function readTikTokVideoBounds(
  win: BrowserWindow
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  if (win.isDestroyed()) return null;

  try {
    const result = await win.webContents.executeJavaScript(
      `(() => {
        const element =
          document.querySelector('video') ||
          document.querySelector('img[src*="tiktokcdn"]') ||
          document.querySelector('canvas');
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

async function readTikTokPageMedia(
  win: BrowserWindow
): Promise<{ mediaUrl: string; pageTitle: string | null; thumbnailUrl: string | null } | null> {
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
            .find((name) => /\\.mp4|\\.m3u8|\\.mpd|video\\/tos|tiktokcdn|playwm/i.test(name))
        ]);

        const thumbnailUrl = findFirst([
          video?.poster,
          video?.getAttribute?.("poster"),
          document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
          document.querySelector('meta[name="twitter:image"]')?.getAttribute("content"),
          document.querySelector('img[src*="tiktokcdn"]')?.getAttribute("src")
        ]);

        const pageTitle = document.title?.trim() || null;
        return { mediaUrl, pageTitle, thumbnailUrl };
      })()`,
      true
    );

    if (!result || typeof result !== "object") return null;
    return {
      mediaUrl: isUsableTikTokMediaUrl(result.mediaUrl) ? result.mediaUrl : null,
      pageTitle:
        typeof result.pageTitle === "string" && result.pageTitle.trim()
          ? normalizeWebTitle(result.pageTitle.trim())
          : null,
      thumbnailUrl: typeof result.thumbnailUrl === "string" ? result.thumbnailUrl : null
    };
  } catch {
    return null;
  }
}

async function readTikTokUrlsFromPage(win: BrowserWindow): Promise<string[]> {
  if (win.isDestroyed()) return [];

  try {
    const result = await win.webContents.executeJavaScript(
      `(() => {
        const values = new Set();

        for (const anchor of document.querySelectorAll("a[href]")) {
          values.add(anchor.href);
        }

        for (const item of document.querySelectorAll("[data-e2e='user-post-item'], [data-e2e='search-video-item'], [data-e2e='recommend-list-item-container']")) {
          const link = item.querySelector("a[href]");
          if (link?.href) {
            values.add(link.href);
          }
        }

        values.add(location.href);
        return Array.from(values);
      })()`,
      true
    );

    const rawUrls = Array.isArray(result) ? result.filter((value) => typeof value === "string") : [];
    return extractTikTokVideoUrlsFromCandidates(rawUrls, win.webContents.getURL());
  } catch {
    return [];
  }
}

async function readTikTokEntriesFromPage(win: BrowserWindow): Promise<CollectedVideoEntry[]> {
  if (win.isDestroyed()) return [];

  try {
    const result = await win.webContents.executeJavaScript(
      `(() => {
        const entries = new Map();

        const normalizeMedia = (value) => {
          if (!value || typeof value !== "string") return null;
          try {
            const url = new URL(value, location.href);
            if (url.protocol !== "http:" && url.protocol !== "https:") return null;
            return url.toString();
          } catch {
            return null;
          }
        };

        const cleanText = (value) => {
          if (!value || typeof value !== "string") return null;
          const normalized = value.replace(/\\s+/g, " ").trim();
          return normalized || null;
        };

        const pushEntry = (href, root) => {
          if (!href || typeof href !== "string") return;

          const previous = entries.get(href) || {
            url: href,
            title: null,
            thumbnail: null
          };

          entries.set(href, {
            url: href,
            title:
              cleanText(
                root?.querySelector?.("[title]")?.getAttribute?.("title") ||
                  root?.querySelector?.("img")?.getAttribute?.("alt") ||
                  root?.querySelector?.("h1, h2, h3")?.textContent ||
                  root?.innerText
              ) || previous.title || null,
            thumbnail:
              normalizeMedia(
                root?.querySelector?.("img")?.getAttribute?.("src") ||
                  root?.querySelector?.("img")?.getAttribute?.("data-src") ||
                  root?.querySelector?.("video")?.getAttribute?.("poster")
              ) || previous.thumbnail || null
          });
        };

        for (const anchor of document.querySelectorAll("a[href]")) {
          pushEntry(anchor.href, anchor.closest("a, article, li, div"));
        }

        pushEntry(location.href, document.body);
        return Array.from(entries.values());
      })()`,
      true
    );

    const rawEntries = Array.isArray(result)
      ? result.filter((value) => value && typeof value.url === "string")
      : [];

    const normalizedUrls = new Map(
      rawEntries
        .map((value) => String(value.url))
        .map((url) => [url, extractTikTokVideoUrlsFromCandidates([url], win.webContents.getURL())[0] ?? null])
    );

    const normalizedEntries: CollectedVideoEntry[] = [];

    for (const value of rawEntries) {
      const url = normalizedUrls.get(String(value.url)) ?? null;
      if (!url) continue;

      normalizedEntries.push({
        url,
        title:
          typeof value.title === "string" && value.title.trim()
            ? normalizeWebTitle(value.title.trim())
            : null,
        thumbnail:
          typeof value.thumbnail === "string" && value.thumbnail.trim() ? value.thumbnail : null
      });
    }

    return normalizedEntries;
  } catch {
    return [];
  }
}

function extractTikTokMediaUrl(input: string): string | null {
  const lower = input.toLowerCase();
  if (!lower.startsWith("http")) return null;
  if (lower.includes(".mp4")) return input;
  if (lower.includes(".m3u8") || lower.includes(".mpd")) return input;
  if (lower.includes("video/tos") || lower.includes("tiktokcdn")) return input;
  return null;
}

function isUsableTikTokMediaUrl(input: unknown): input is string {
  if (typeof input !== "string") return false;
  const value = input.trim();
  if (!value) return false;
  if (value.startsWith("blob:")) return false;
  return /^https?:\/\//i.test(value);
}

function safeGetTitle(win: BrowserWindow): string | null {
  try {
    const title = win.webContents.getTitle();
    return title?.trim() ? normalizeWebTitle(title.trim()) : null;
  } catch {
    return null;
  }
}

function isAllowedNavigation(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function maskQuery(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : `${url.slice(0, queryIndex)}?***`;
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
