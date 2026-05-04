export function normalizeInputUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^(www\.)?[a-z0-9.-]+\.[a-z]{2,}(\/|$|\?)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

export function tryParseUrl(input: string): URL | null {
  try {
    return new URL(normalizeInputUrl(input));
  } catch {
    return null;
  }
}
