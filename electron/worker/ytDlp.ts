import { spawn } from "node:child_process";
import type { DownloadJobRequest } from "../../shared/types.js";
import { parseYtDlpProgressLine } from "./ytDlpProgress.js";
import { sanitizeFileComponent } from "./sanitize.js";

export type YtDlpProgress = {
  percent?: number;
  speed?: string;
  eta?: string;
  downloaded?: string;
  total?: string;
};

type RunYtDlpParams = {
  url: string;
  args: string[];
  onProgress: (p: YtDlpProgress) => void;
  onLog: (line: string) => void;
  signal?: AbortSignal;
};

export class YtDlpAbortedError extends Error {
  readonly reason: string;

  constructor(reason = "aborted") {
    super(reason === "paused" ? "下載已暫停。" : "下載已中止。");
    this.name = "YtDlpAbortedError";
    this.reason = reason;
  }
}

export function buildYtDlpArgs(params: {
  request: DownloadJobRequest;
  baseDir: string;
  titleOverride?: string | null;
}): string[] {
  const { request, baseDir, titleOverride } = params;

  // 重要：外部命令一定用 args array，不要拼字串（避免 injection）。
  const args: string[] = [];

  // 讓 yt-dlp 自己處理 Windows 不合法字元（避免檔名炸裂）。
  args.push("--windows-filenames");

  // 每行一筆進度，方便解析。
  args.push("--newline");
  args.push("--continue");

  // 輸出模板：依是否播放清單分層
  if (request.isPlaylist) {
    args.push(
      "-o",
      `${baseDir}/%(playlist_title)s/%(playlist_index)s - %(title)s.%(ext)s`
    );
    args.push("--yes-playlist");
  } else {
    if (titleOverride?.trim()) {
      const safe = sanitizeFileComponent(titleOverride);
      args.push("-o", `${baseDir}/${safe}/${safe}.%(ext)s`);
    } else {
      args.push("-o", `${baseDir}/%(title)s/%(title)s.%(ext)s`);
    }
    args.push("--no-playlist");
  }

  // Cookies（可選）
  if (request.cookiesFile) {
    args.push("--cookies", request.cookiesFile);
  }
  if (request.cookiesFromBrowser) {
    const profile = request.cookiesBrowserProfile?.trim() ? request.cookiesBrowserProfile.trim() : "Default";
    args.push("--cookies-from-browser", `${request.cookiesBrowser}:${profile}`);
  }

  // 字幕（可選）
  if (request.writeSubs) {
    args.push("--write-subs");
  }
  if (request.writeAutoSubs) {
    args.push("--write-auto-subs");
  }
  if (request.subLangs?.trim()) {
    args.push("--sub-langs", request.subLangs.trim());
  }
  if (request.convertSubsToSrt) {
    args.push("--convert-subs", "srt");
  }

  // 區間（可選）
  if (request.sectionStart && request.sectionEnd) {
    args.push("--download-sections", `*${request.sectionStart}-${request.sectionEnd}`);
  }

  // 只抓音訊（mp3）
  if (request.mode === "audio") {
    args.push("-x", "--audio-format", "mp3");
    args.push("--audio-quality", request.audioQuality === "best" ? "0" : "5");
  } else {
    // 影片：畫質/格式
    if (request.advancedFormat?.trim()) {
      args.push("-f", request.advancedFormat.trim());
    } else {
      // 簡單模式：用 selector 抽象畫質
      const selector = buildSimpleVideoSelector(request.videoQuality);
      args.push("-f", selector);
      args.push("--merge-output-format", "mp4");
    }
  }

  return args;
}

function buildSimpleVideoSelector(q: DownloadJobRequest["videoQuality"]): string {
  // 用 yt-dlp 的 format selector 來抽象「1080/720」。
  // 規則：優先 video+audio，fallback 到 best。
  switch (q) {
    case "1080p":
      return "bv*[height<=1080]+ba/b[height<=1080]/b";
    case "720p":
      return "bv*[height<=720]+ba/b[height<=720]/b";
    case "480p":
      return "bv*[height<=480]+ba/b[height<=480]/b";
    case "best":
    default:
      return "bv*+ba/b";
  }
}

export async function listFormats(url: string): Promise<string> {
  const result = await runYtDlpCapture(["-F", url]);
  return result;
}

export async function runYtDlp(params: RunYtDlpParams): Promise<void> {
  const child = spawn("yt-dlp", [...params.args, params.url], {
    shell: false,
    windowsHide: true
  });
  let abortedReason: string | null = null;

  const recentLines: string[] = [];
  const pushRecent = (line: string) => {
    recentLines.push(line);
    if (recentLines.length > 200) recentLines.shift();
  };

  // yt-dlp 的進度多數在 stderr，這裡兩邊都接，解析得到就送 progress。
  const onLine = (line: string) => {
    const trimmed = line.trimEnd();
    if (!trimmed) return;

    pushRecent(trimmed);
    params.onLog(trimmed);

    const parsed = parseYtDlpProgressLine(trimmed);
    if (parsed) params.onProgress(parsed);
  };

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk: string) => {
    chunk.split(/\\r?\\n/).forEach(onLine);
  });
  child.stderr.on("data", (chunk: string) => {
    chunk.split(/\\r?\\n/).forEach(onLine);
  });

  const abortHandler = () => {
    abortedReason =
      typeof params.signal?.reason === "string" && params.signal.reason.trim()
        ? params.signal.reason
        : "aborted";
    child.kill();
  };

  if (params.signal) {
    if (params.signal.aborted) {
      abortHandler();
    } else {
      params.signal.addEventListener("abort", abortHandler, { once: true });
    }
  }

  await new Promise<void>((resolve, reject) => {
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (params.signal) {
        params.signal.removeEventListener("abort", abortHandler);
      }

      if (abortedReason) {
        reject(new YtDlpAbortedError(abortedReason));
        return;
      }

      if (code === 0) resolve();
      else {
        const hint = buildFriendlyHint(recentLines);
        reject(
          new Error(
            hint ??
              `yt-dlp 結束碼 ${code ?? "unknown"}（可能需要 cookies 或網址已失效）。`
          )
        );
      }
    });
  });
}

function buildFriendlyHint(lines: string[]): string | null {
  const joined = lines.join("\n");

  if (joined.includes("Could not copy Chrome cookie database")) {
    return [
      "無法從瀏覽器讀取 cookies（Chrome cookie DB 無法複製/被鎖住）。",
      "解法：",
      "1) 完全關閉 Chrome（含背景程序），或在工作管理員結束所有 chrome.exe",
      "2) 再重試（或改用 Edge + Default/profile）",
      "3) 或改用匯入 cookies.txt 的方式"
    ].join("\n");
  }

  if (joined.includes("Fresh cookies (not necessarily logged in) are needed")) {
    return [
      "這支影片目前需要新鮮 cookies 才能下載。",
      "建議做法：",
      "1) 在 App 勾選「從瀏覽器讀取 cookies」後重試",
      "2) 若 Chrome/Edge cookie DB 被鎖住，先完全關閉瀏覽器再重試",
      "3) 或匯入剛匯出的 `cookies.txt`",
      "4) Douyin 的搜尋彈窗網址已會自動轉成作品頁，但 cookies 仍是必要條件"
    ].join("\n");
  }

  if (joined.includes("invalid Netscape format cookies file") || joined.includes("CookieLoadError")) {
    return [
      "你匯入的 cookies.txt 格式不符合 yt-dlp 期待的 Netscape cookies 格式，導致無法載入。",
      "常見原因：cookies 檔某些行的第 2 欄是 FALSE，但 domain 卻以「.」開頭（cookiejar 會直接報錯）。",
      "建議解法（擇一）：",
      "1) 重新用支援「Netscape cookies.txt」的擴充匯出（例如 Get cookies.txt / cookies.txt）",
      "2) 或手動修正：把 `.www.skool.com\\tFALSE` 改成 `www.skool.com\\tFALSE`（移除最前面的點）",
      "3) 或改用「從瀏覽器讀取 cookies」（但要先完全關閉瀏覽器避免 DB 被鎖）"
    ].join("\n");
  }

  if (joined.includes("Extracting cookies from edge") && joined.includes("Could not copy")) {
    return [
      "無法從 Edge 讀取 cookies（cookie DB 無法複製/被鎖住）。",
      "解法：完全關閉 Edge（含背景程序）後重試，或改用匯入 cookies.txt。"
    ].join("\n");
  }

  return null;
}

async function runYtDlpCapture(args: string[]): Promise<string> {
  const child = spawn("yt-dlp", args, {
    shell: false,
    windowsHide: true
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let out = "";
  child.stdout.on("data", (c: string) => (out += c));
  child.stderr.on("data", (c: string) => (out += c));

  await new Promise<void>((resolve, reject) => {
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp 結束碼 ${code ?? "unknown"}`));
    });
  });

  return out.trimEnd();
}
