import type { PlatformStrategyContext, PlatformStrategyResult } from "./platformStrategyTypes.js";
import { resolveDouyinUrl } from "./douyin.js";
import { captureDouyinMedia, extractDouyinPageMedia } from "./douyinCapture.js";
import { getWebpageMetadata } from "./webMetadata.js";

export async function prepareDouyinDownload(
  context: PlatformStrategyContext
): Promise<PlatformStrategyResult> {
  const resolved = resolveDouyinUrl(context.request.url);
  const sourceUrl = resolved.url;
  const metadata = await getWebpageMetadata(sourceUrl);

  if (resolved.wasRewritten) {
    context.onEvent({
      jobId: context.jobId,
      type: "job.log",
      data: { line: `[douyin] 已將輸入網址轉成作品頁：${sourceUrl}` }
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
      data: { line: "[douyin] 已從瀏覽器 request 擷取到媒體網址" }
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
        line: `[douyin] 專用路線失敗，改走 yt-dlp fallback：${
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
