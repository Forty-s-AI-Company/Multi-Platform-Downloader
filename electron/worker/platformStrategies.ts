import type { PlatformStrategy } from "./platformStrategyTypes.js";
import { prepareDouyinDownload } from "./douyinAdapter.js";
import { getSkoolM3u8 } from "./skoolM3u8.js";
import { normalizeWebTitle } from "./sanitize.js";
import { prepareTikTokDownload } from "./tiktokAdapter.js";
import { getWebpageMetadata } from "./webMetadata.js";

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
  prepare: prepareDouyinDownload
};

const tiktokStrategy: PlatformStrategy = {
  id: "tiktok-smart-route",
  supports: (platform) => platform === "tiktok",
  prepare: prepareTikTokDownload
};

const strategies: PlatformStrategy[] = [
  douyinStrategy,
  tiktokStrategy,
  skoolStrategy,
  defaultStrategy
];

export function getPlatformStrategy(platform: string): PlatformStrategy {
  return strategies.find((strategy) => strategy.supports(platform)) ?? defaultStrategy;
}
