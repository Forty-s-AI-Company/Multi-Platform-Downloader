import { normalizeInputUrl, tryParseUrl } from "../../shared/url.js";

export type DouyinResolvedUrl = {
  url: string;
  wasRewritten: boolean;
};

export function resolveDouyinUrl(input: string): DouyinResolvedUrl {
  const normalizedInput = normalizeInputUrl(input);
  const url = tryParseUrl(normalizedInput);
  if (!url) {
    return { url: normalizedInput, wasRewritten: normalizedInput !== input };
  }

  const host = url.hostname.toLowerCase();
  if (!host.includes("douyin.com")) {
    return { url: normalizedInput, wasRewritten: normalizedInput !== input };
  }

  const modalId = url.searchParams.get("modal_id")?.trim();
  const noteId = url.searchParams.get("note_id")?.trim();
  const itemId = url.searchParams.get("item_id")?.trim();
  const path = url.pathname;

  if (modalId && (path.startsWith("/search") || path.startsWith("/discover") || path.startsWith("/topic"))) {
    return {
      url: `https://www.douyin.com/video/${modalId}`,
      wasRewritten: true
    };
  }

  if (itemId && !path.startsWith("/video/")) {
    return {
      url: `https://www.douyin.com/video/${itemId}`,
      wasRewritten: true
    };
  }

  if (noteId && !path.startsWith("/note/")) {
    return {
      url: `https://www.douyin.com/note/${noteId}`,
      wasRewritten: true
    };
  }

  return { url: normalizedInput, wasRewritten: normalizedInput !== input };
}
