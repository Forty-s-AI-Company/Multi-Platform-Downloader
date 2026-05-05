import { tryParseUrl } from "./url.js";

// 只要是單支作品頁，就直接下載；其他頁型才進批次收集流程。
export function shouldCollectDouyinBatch(url: string): boolean {
  const parsed = tryParseUrl(url);
  if (!parsed) return false;
  if (!parsed.hostname.includes("douyin.com")) return false;
  return !/^\/video\/\d+/.test(parsed.pathname) && !/^\/note\/\d+/.test(parsed.pathname);
}

// TikTok 的短網址與單支作品頁不應誤判成批次頁。
export function shouldCollectTikTokBatch(url: string): boolean {
  const parsed = tryParseUrl(url);
  if (!parsed) return false;

  const host = parsed.hostname.toLowerCase();
  if (!host.includes("tiktok.com")) return false;
  if (host.startsWith("vm.") || host.startsWith("vt.")) return false;
  if (/^\/t\/[A-Za-z0-9]+/.test(parsed.pathname)) return false;

  return !isTikTokSingleVideoPathname(parsed.pathname);
}

export function isTikTokSingleVideoPathname(pathname: string): boolean {
  return (
    /^\/@[^/]+\/video\/\d+/.test(pathname) ||
    /^\/embed\/v2\/\d+/.test(pathname) ||
    /^\/v\/\d+/.test(pathname)
  );
}

export function extractTikTokVideoUrlsFromCandidates(
  candidates: string[],
  baseUrl: string
): string[] {
  const result = new Set<string>();

  for (const candidate of candidates) {
    const normalized = normalizeTikTokVideoUrl(candidate, baseUrl);
    if (normalized) {
      result.add(normalized);
    }
  }

  return [...result];
}

function normalizeTikTokVideoUrl(candidate: string, baseUrl: string): string | null {
  try {
    const parsed = new URL(candidate, baseUrl);
    if (!parsed.hostname.toLowerCase().includes("tiktok.com")) return null;
    if (!isTikTokSingleVideoPathname(parsed.pathname)) return null;
    return `https://www.tiktok.com${parsed.pathname}`;
  } catch {
    return null;
  }
}
