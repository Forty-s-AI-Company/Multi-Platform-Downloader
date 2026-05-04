import { tryParseUrl } from "../../shared/url.js";

export function detectPlatformFromUrl(url: string): string {
  const parsed = tryParseUrl(url);
  if (!parsed) {
    return "unknown";
  }

  const host = parsed.hostname.toLowerCase();

  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("douyin.com")) return "douyin";
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("skool.com")) return "skool";

  return host.replace(/[^a-z0-9.-]/g, "_");
}
