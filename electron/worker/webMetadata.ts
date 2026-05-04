import { normalizeWebTitle } from "./sanitize.js";

export type WebpageMetadata = {
  title: string | null;
  thumbnail: string | null;
};

/**
 * 先用一般網頁請求抓 title / og:image。
 * 這層很便宜，適合在進 worker 前先拿一輪基礎中繼資料。
 */
export async function getWebpageMetadata(url: string): Promise<WebpageMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      return { title: null, thumbnail: null };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { title: null, thumbnail: null };
    }

    const html = await response.text();
    return {
      title: extractTitle(html),
      thumbnail: extractThumbnail(html, response.url)
    };
  } catch {
    return { title: null, thumbnail: null };
  } finally {
    clearTimeout(timeout);
  }
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]{1,500})<\/title>/i);
  if (!match?.[1]) return null;
  return normalizeWebTitle(decodeHtmlEntities(match[1]));
}

function extractThumbnail(html: string, baseUrl: string): string | null {
  const candidates = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
  ];

  for (const pattern of candidates) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;

    try {
      return new URL(decodeHtmlEntities(match[1]), baseUrl).toString();
    } catch {
      continue;
    }
  }

  return null;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, n) => String.fromCharCode(Number(n)));
}
