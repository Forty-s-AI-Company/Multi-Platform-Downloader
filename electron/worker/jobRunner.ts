import fs from "node:fs";
import path from "node:path";
import type { DownloadJobRequest, JobEvent } from "../../shared/types.js";
import { normalizeInputUrl } from "../../shared/url.js";
import { normalizeNetscapeCookiesIfNeeded, parseNetscapeCookiesFile } from "./cookiesNetscape.js";
import { detectPlatformFromUrl } from "./platform.js";
import { getPlatformStrategy } from "./platformStrategies.js";
import { buildYtDlpArgs, runYtDlp, type YtDlpProgress } from "./ytDlp.js";

type StartJobParams = {
  jobId: string;
  request: DownloadJobRequest;
  onEvent: (evt: JobEvent) => void;
  signal?: AbortSignal;
};

export async function startDownloadJob(params: StartJobParams) {
  const { jobId, request, onEvent, signal } = params;
  const normalizedRequest: DownloadJobRequest = {
    ...request,
    url: normalizeInputUrl(request.url)
  };

  if (!normalizedRequest.outputDir) {
    throw new Error("請先選擇輸出資料夾。");
  }

  if (!fs.existsSync(normalizedRequest.outputDir)) {
    fs.mkdirSync(normalizedRequest.outputDir, { recursive: true });
  }

  const platform = detectPlatformFromUrl(normalizedRequest.url);
  const baseDir = path.join(normalizedRequest.outputDir, platform);
  fs.mkdirSync(baseDir, { recursive: true });

  const normalizedCookiesFile = normalizedRequest.cookiesFile
    ? normalizeNetscapeCookiesIfNeeded(normalizedRequest.cookiesFile).path
    : null;
  const normalizedCookies = normalizedCookiesFile
    ? parseNetscapeCookiesFile(normalizedCookiesFile)
    : [];

  const strategy = getPlatformStrategy(platform);
  onEvent({
    jobId,
    type: "job.log",
    data: { line: `[router] 平台 ${platform} -> ${strategy.id}` }
  });

  const prepared = await strategy.prepare({
    jobId,
    platform,
    request: normalizedRequest,
    normalizedCookies,
    onEvent,
    emitRoute: (label: string) => {
      onEvent({ jobId, type: "job.route", data: { label } });
    }
  });

  onEvent({
    jobId,
    type: "job.started",
    data: {
      url: normalizedRequest.url,
      title: prepared.titleOverride,
      platform,
      thumbnail: prepared.thumbnailOverride
    }
  });

  const args = buildYtDlpArgs({
    request: { ...normalizedRequest, cookiesFile: normalizedCookiesFile },
    baseDir,
    titleOverride: prepared.titleOverride
  });

  onEvent({
    jobId,
    type: "job.command",
    data: { bin: "yt-dlp", args: redactArgs(args) }
  });

  const finalArgs =
    prepared.prependArgs && prepared.prependArgs.length > 0
      ? [...prepared.prependArgs, ...args]
      : args;

  await runYtDlp({
    url: prepared.actualDownloadUrl,
    args: finalArgs,
    signal,
    onProgress: (progress: YtDlpProgress) => {
      onEvent({ jobId, type: "job.progress", data: progress });
    },
    onLog: (line: string) => {
      onEvent({
        jobId,
        type: "job.log",
        data: { line: redactLine(line, normalizedRequest) }
      });
    }
  });

  onEvent({ jobId, type: "job.completed", data: { outputDir: baseDir } });
}

function redactArgs(args: string[]): string[] {
  const output = [...args];
  for (let index = 0; index < output.length; index++) {
    if (output[index] === "--cookies" && typeof output[index + 1] === "string") {
      output[index + 1] = "***";
    }
  }
  return output;
}

function redactLine(line: string, request: DownloadJobRequest): string {
  let sanitized = line;

  if (request.cookiesFile) {
    sanitized = sanitized.split(request.cookiesFile).join("***");
  }

  sanitized = sanitized.replace(/https?:\/\/\S+\?\S+/g, (match) => {
    const queryIndex = match.indexOf("?");
    return queryIndex === -1 ? match : `${match.slice(0, queryIndex)}?***`;
  });

  return sanitized;
}
