import { Notification, app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import crypto from "node:crypto";
import path from "node:path";
import type { DownloadJobRequest, JobEvent } from "../shared/types.js";
import { normalizeInputUrl } from "../shared/url.js";
import { JobsStore, type StoredJob } from "./store/jobsStore.js";
import { normalizeNetscapeCookiesIfNeeded, parseNetscapeCookiesFile } from "./worker/cookiesNetscape.js";
import { collectDouyinVideoUrls } from "./worker/douyinCapture.js";
import { resolveDouyinUrl } from "./worker/douyin.js";
import { startDownloadJob } from "./worker/jobRunner.js";
import { detectPlatformFromUrl } from "./worker/platform.js";
import { YtDlpAbortedError, listFormats } from "./worker/ytDlp.js";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const jobQueue: Array<{ jobId: string; request: DownloadJobRequest }> = [];

let isQueuePaused = false;
let isJobRunning = false;
let currentJob: { jobId: string; request: DownloadJobRequest } | null = null;
let currentJobController: AbortController | null = null;
let jobsStore: JobsStore | null = null;

async function drainQueue(win: BrowserWindow) {
  if (isQueuePaused || isJobRunning) return;

  const next = jobQueue.shift();
  if (!next) return;

  currentJob = next;
  currentJobController = new AbortController();
  isJobRunning = true;
  jobsStore?.update(next.jobId, { status: "running" });
  syncQueuePositions(win);

  try {
    await startDownloadJob({
      jobId: next.jobId,
      request: next.request,
      signal: currentJobController.signal,
      onEvent: (event: JobEvent) => {
        jobsStore?.applyEvent(next.jobId, event);
        win.webContents.send("jobs:event", event);
        maybeNotifyJob(event, next.jobId);
      }
    });
  } catch (error) {
    if (error instanceof YtDlpAbortedError) {
      handleAbortedJob(win, next, error.reason);
    } else {
      const failedEvent: JobEvent = {
        jobId: next.jobId,
        type: "job.failed",
        data: { message: error instanceof Error ? error.message : String(error) }
      };
      jobsStore?.applyEvent(next.jobId, failedEvent);
      win.webContents.send("jobs:event", failedEvent);
      maybeNotifyJob(failedEvent, next.jobId);
    }
  } finally {
    currentJob = null;
    currentJobController = null;
    isJobRunning = false;
    if (!isQueuePaused) {
      void drainQueue(win);
    }
  }
}

function handleAbortedJob(
  win: BrowserWindow,
  job: { jobId: string; request: DownloadJobRequest },
  reason: string
) {
  if (reason === "queue-paused") {
    jobQueue.unshift(job);
    const event: JobEvent = {
      jobId: job.jobId,
      type: "job.paused",
      data: { message: "已暫停下載佇列。" }
    };
    jobsStore?.applyEvent(job.jobId, event);
    win.webContents.send("jobs:event", event);
    syncQueuePositions(win);
    return;
  }

  if (reason === "job-paused") {
    const event: JobEvent = {
      jobId: job.jobId,
      type: "job.paused",
      data: { message: "任務已暫停，可隨時繼續。" }
    };
    jobsStore?.applyEvent(job.jobId, event);
    win.webContents.send("jobs:event", event);
    syncQueuePositions(win);
    return;
  }

  if (reason === "canceled") {
    const event: JobEvent = {
      jobId: job.jobId,
      type: "job.canceled",
      data: { message: "任務已取消。" }
    };
    jobsStore?.applyEvent(job.jobId, event);
    win.webContents.send("jobs:event", event);
  }
}

function syncQueuePositions(win: BrowserWindow) {
  jobQueue.forEach((job, index) => {
    const event: JobEvent = {
      jobId: job.jobId,
      type: "job.queued",
      data: { position: index + 1 }
    };
    jobsStore?.applyEvent(job.jobId, event);
    win.webContents.send("jobs:event", event);
  });
}

function createWindow() {
  const preloadPath = devServerUrl
    ? path.join(process.cwd(), "electron", "preload.cjs")
    : path.join(app.getAppPath(), "dist-electron", "preload.cjs");
  const appIconPath = devServerUrl ? path.join(process.cwd(), "build", "icon.png") : undefined;

  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    icon: appIconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();

  jobsStore = new JobsStore(app.getPath("userData"));
  jobsStore.load();
  jobsStore.requeueUnfinished();

  const queuedJobs = jobsStore
    .getAll()
    .filter((job) => job.status === "queued")
    .slice()
    .reverse();

  for (const job of queuedJobs) {
    jobQueue.push({ jobId: job.jobId, request: job.request });
  }

  syncQueuePositions(win);
  void drainQueue(win);

  ipcMain.handle("dialog:pickFolder", async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("ytDlp:listFormats", async (_event, url: string) => {
    const resolvedUrl =
      detectPlatformFromUrl(url) === "douyin" ? resolveDouyinUrl(url).url : url;
    return await listFormats(resolvedUrl);
  });

  ipcMain.handle(
    "douyin:collectUrls",
    async (_event, params: { url: string; cookiesFile: string | null }) => {
      const normalizedCookiesFile = params.cookiesFile
        ? normalizeNetscapeCookiesIfNeeded(params.cookiesFile).path
        : null;
      const cookies = normalizedCookiesFile
        ? parseNetscapeCookiesFile(normalizedCookiesFile)
        : [];

      return await collectDouyinVideoUrls({
        url: params.url,
        cookies,
        onLog: (line) => {
          win.webContents.send("jobs:event", {
            jobId: "douyin-collector",
            type: "job.log",
            data: { line }
          } satisfies JobEvent);
        }
      });
    }
  );

  ipcMain.handle("jobs:getState", async () => jobsStore?.getAll() ?? []);

  ipcMain.handle("jobs:getQueueState", async () => ({
    paused: isQueuePaused,
    runningJobId: currentJob?.jobId ?? null
  }));

  ipcMain.handle("jobs:start", async (_event, request: DownloadJobRequest) => {
    const jobId = crypto.randomUUID();
    const normalizedRequest: DownloadJobRequest = {
      ...request,
      url: normalizeInputUrl(request.url)
    };

    jobQueue.push({ jobId, request: normalizedRequest });
    jobsStore?.add(toStoredJob(jobId, normalizedRequest, jobQueue.length));
    syncQueuePositions(win);
    void drainQueue(win);

    return { jobId };
  });

  ipcMain.handle("jobs:pauseQueue", async () => {
    isQueuePaused = true;
    if (currentJobController && !currentJobController.signal.aborted) {
      currentJobController.abort("queue-paused");
    }
    return { paused: true, runningJobId: currentJob?.jobId ?? null };
  });

  ipcMain.handle("jobs:resumeQueue", async () => {
    isQueuePaused = false;
    syncQueuePositions(win);
    void drainQueue(win);
    return { paused: false, runningJobId: currentJob?.jobId ?? null };
  });

  ipcMain.handle("jobs:pauseOne", async (_event, jobId: string) => {
    if (currentJob?.jobId === jobId && currentJobController && !currentJobController.signal.aborted) {
      currentJobController.abort("job-paused");
      return { ok: true };
    }

    const queueIndex = jobQueue.findIndex((job) => job.jobId === jobId);
    if (queueIndex !== -1) {
      jobQueue.splice(queueIndex, 1);
      const event: JobEvent = {
        jobId,
        type: "job.paused",
        data: { message: "任務已暫停，可隨時繼續。" }
      };
      jobsStore?.applyEvent(jobId, event);
      win.webContents.send("jobs:event", event);
      syncQueuePositions(win);
    }

    return { ok: true };
  });

  ipcMain.handle("jobs:resumeOne", async (_event, jobId: string) => {
    const storedJob = jobsStore?.getById(jobId);
    if (!storedJob) return { ok: false };
    if (jobQueue.some((job) => job.jobId === jobId)) return { ok: true };

    jobQueue.unshift({ jobId, request: storedJob.request });
    syncQueuePositions(win);
    if (!isQueuePaused) {
      void drainQueue(win);
    }
    return { ok: true };
  });

  ipcMain.handle("jobs:cancelOne", async (_event, jobId: string) => {
    if (currentJob?.jobId === jobId && currentJobController && !currentJobController.signal.aborted) {
      currentJobController.abort("canceled");
      return { ok: true };
    }

    const queueIndex = jobQueue.findIndex((job) => job.jobId === jobId);
    if (queueIndex !== -1) {
      jobQueue.splice(queueIndex, 1);
      const event: JobEvent = {
        jobId,
        type: "job.canceled",
        data: { message: "任務已取消。" }
      };
      jobsStore?.applyEvent(jobId, event);
      win.webContents.send("jobs:event", event);
      syncQueuePositions(win);
      return { ok: true };
    }

    const pausedJob = jobsStore?.getById(jobId);
    if (pausedJob?.status === "paused") {
      const event: JobEvent = {
        jobId,
        type: "job.canceled",
        data: { message: "任務已取消。" }
      };
      jobsStore?.applyEvent(jobId, event);
      win.webContents.send("jobs:event", event);
    }

    return { ok: true };
  });

  ipcMain.handle("jobs:removeMany", async (_event, jobIds: string[]) => {
    const runningIds = new Set(
      (jobsStore?.getAll() ?? []).filter((job) => job.status === "running").map((job) => job.jobId)
    );
    const blocked = jobIds.filter((jobId) => runningIds.has(jobId));
    if (blocked.length > 0) {
      throw new Error("下載中的任務不能刪除，請先暫停或取消。");
    }

    const removeSet = new Set(jobIds);
    for (let index = jobQueue.length - 1; index >= 0; index--) {
      if (removeSet.has(jobQueue[index].jobId)) {
        jobQueue.splice(index, 1);
      }
    }

    jobsStore?.removeMany(jobIds);
    syncQueuePositions(win);
    return { ok: true };
  });

  ipcMain.handle("jobs:clearAll", async () => {
    const hasRunning = (jobsStore?.getAll() ?? []).some((job) => job.status === "running");
    if (hasRunning) {
      throw new Error("還有任務正在下載中，先暫停或取消後再清空列表。");
    }

    jobQueue.length = 0;
    jobsStore?.clearAll();
    return { ok: true };
  });

  ipcMain.handle("shell:openPath", async (_event, targetPath: string) => {
    const result = await shell.openPath(targetPath);
    if (result) throw new Error(result);
    return { ok: true };
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function toStoredJob(jobId: string, request: DownloadJobRequest, position: number): StoredJob {
  const now = Date.now();
  return {
    jobId,
    request,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    platform: detectPlatformFromUrl(request.url),
    queuePosition: position,
    progress: { percent: 0 },
    logs: []
  };
}

function maybeNotifyJob(event: JobEvent, jobId: string) {
  if (!Notification.isSupported()) return;
  if (event.type !== "job.completed" && event.type !== "job.failed") return;

  const storedJob = jobsStore?.getById(jobId);
  const label = storedJob?.title ?? storedJob?.request.url ?? "下載任務";

  if (event.type === "job.completed") {
    const notification = new Notification({
      title: "下載完成",
      body: label,
      silent: false
    });
    notification.on("click", () => {
      void shell.openPath(event.data.outputDir);
    });
    notification.show();
    return;
  }

  const notification = new Notification({
    title: "下載失敗",
    body: `${label}\n${event.data.message}`,
    silent: false
  });
  notification.show();
}
