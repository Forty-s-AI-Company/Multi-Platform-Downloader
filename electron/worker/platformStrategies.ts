import type { CookiesSetDetails } from "electron";
import type { DownloadJobRequest, JobEvent } from "../../shared/types.js";
import { resolveDouyinUrl } from "./douyin.js";
import { captureDouyinMedia, extractDouyinPageMedia } from "./douyinCapture.js";
import { getSkoolM3u8 } from "./skoolM3u8.js";
import { normalizeWebTitle } from "./sanitize.js";
import { getWebpageMetadata } from "./webMetadata.js";

export type PlatformStrategyContext = {
  jobId: string;
  platform: string;
  request: DownloadJobRequest;
  normalizedCookies: CookiesSetDetails[];
  onEvent: (evt: JobEvent) => void;
  emitRoute: (label: string) => void;
};

export type PlatformStrategyResult = {
  actualDownloadUrl: string;
  titleOverride: string | null;
  thumbnailOverride?: string | null;
  prependArgs?: string[];
};

export type PlatformStrategy = {
  id: string;
  supports: (platform: string) => boolean;
  prepare: (context: PlatformStrategyContext) => Promise<PlatformStrategyResult>;
};

const defaultStrategy: PlatformStrategy = {
  id: "default-yt-dlp",
  supports: () => true,
  async prepare(context) {
    context.emitRoute("yt-dlp 直接下載");
    const metadata = await getWebpageMetadata(context.request.url);
    return {
      actualDownloadUrl: context.request.url,
      titleOverride: metadata.title,
      thumbnailOverride: metadata.thumbnail,
      prependArgs: []
    };
  }
};

const skoolStrategy: PlatformStrategy = {
  id: "skool-browser-capture",
  supports: (platform) => platform === "skool",
  async prepare(context) {
    context.emitRoute("Skool 瀏覽器擷取");
    const metadata = await getWebpageMetadata(context.request.url);
    const result = await getSkoolM3u8({
      url: context.request.url,
      jobId: context.jobId,
      cookies: context.normalizedCookies,
      onLog: (line) =>
        context.onEvent({ jobId: context.jobId, type: "job.log", data: { line } })
    });

    return {
      actualDownloadUrl: result.m3u8Url,
      titleOverride: result.pageTitle ? normalizeWebTitle(result.pageTitle) : metadata.title,
      thumbnailOverride: metadata.thumbnail,
      prependArgs: ["--referer", "https://www.skool.com/"]
    };
  }
};

const douyinStrategy: PlatformStrategy = {
  id: "douyin-smart-route",
  supports: (platform) => platform === "douyin",
  async prepare(context) {
    const resolved = resolveDouyinUrl(context.request.url);
    const sourceUrl = resolved.url;
    const metadata = await getWebpageMetadata(sourceUrl);

    if (resolved.wasRewritten) {
      context.onEvent({
        jobId: context.jobId,
        type: "job.log",
        data: { line: `[douyin] 已將搜尋/彈窗網址改寫為作品頁：${sourceUrl}` }
      });
    }

    try {
      context.emitRoute("抖音頁面直讀");
      const direct = await extractDouyinPageMedia({
        url: sourceUrl,
        cookies: context.normalizedCookies,
        onLog: (line) =>
          context.onEvent({ jobId: context.jobId, type: "job.log", data: { line } })
      });

      if (direct?.mediaUrl) {
        return {
          actualDownloadUrl: direct.mediaUrl,
          titleOverride: direct.pageTitle ?? metadata.title,
          thumbnailOverride: direct.thumbnailUrl ?? metadata.thumbnail,
          prependArgs: ["--referer", sourceUrl]
        };
      }

      context.emitRoute("抖音瀏覽器擷取");
      const captured = await captureDouyinMedia({
        jobId: context.jobId,
        url: sourceUrl,
        cookies: context.normalizedCookies,
        onLog: (line) =>
          context.onEvent({ jobId: context.jobId, type: "job.log", data: { line } })
      });

      context.onEvent({
        jobId: context.jobId,
        type: "job.log",
        data: { line: "[douyin] 已改用瀏覽器 request 擷取媒體位址。" }
      });

      return {
        actualDownloadUrl: captured.mediaUrl,
        titleOverride: captured.pageTitle ?? metadata.title,
        thumbnailOverride: captured.thumbnailUrl ?? metadata.thumbnail,
        prependArgs: ["--referer", sourceUrl]
      };
    } catch (error) {
      context.emitRoute("yt-dlp fallback");
      context.onEvent({
        jobId: context.jobId,
        type: "job.log",
        data: {
          line: `[douyin] 專用擷取失敗，改走 yt-dlp extractor：${
            error instanceof Error ? error.message : String(error)
          }`
        }
      });

      return {
        actualDownloadUrl: sourceUrl,
        titleOverride: metadata.title,
        thumbnailOverride: metadata.thumbnail,
        prependArgs: []
      };
    }
  }
};

const strategies: PlatformStrategy[] = [douyinStrategy, skoolStrategy, defaultStrategy];

export function getPlatformStrategy(platform: string): PlatformStrategy {
  return strategies.find((strategy) => strategy.supports(platform)) ?? defaultStrategy;
}
