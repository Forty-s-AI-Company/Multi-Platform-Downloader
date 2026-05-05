import type { PlatformStrategyContext, PlatformStrategyResult } from "./platformStrategyTypes.js";
import { extractTikTokPageMedia, captureTikTokMedia } from "./tiktokCapture.js";
import { getWebpageMetadata } from "./webMetadata.js";

export async function prepareTikTokDownload(
  context: PlatformStrategyContext
): Promise<PlatformStrategyResult> {
  const sourceUrl = context.request.url;
  const metadata = await getWebpageMetadata(sourceUrl);

  try {
    context.emitRoute("TikTok 頁面直讀");
    const direct = await extractTikTokPageMedia({
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

    context.emitRoute("TikTok 瀏覽器擷取");
    const captured = await captureTikTokMedia({
      jobId: context.jobId,
      url: sourceUrl,
      cookies: context.normalizedCookies,
      onLog: (line) =>
        context.onEvent({ jobId: context.jobId, type: "job.log", data: { line } })
    });

    context.onEvent({
      jobId: context.jobId,
      type: "job.log",
      data: { line: "[tiktok] 已從瀏覽器 request 擷取到媒體網址" }
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
        line: `[tiktok] 專用路線失敗，改走 yt-dlp fallback：${
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
