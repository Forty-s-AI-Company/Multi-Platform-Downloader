import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { CookiesSetDetails } from "electron";

export type NormalizedCookiesFileResult = {
  path: string;
  changed: boolean;
};

export function normalizeNetscapeCookiesIfNeeded(cookiesPath: string): NormalizedCookiesFileResult {
  if (!fs.existsSync(cookiesPath)) return { path: cookiesPath, changed: false };

  const raw = fs.readFileSync(cookiesPath);
  let text = raw.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM

  const lines = text.split(/\r?\n/);
  let looksLikeNetscape = false;
  let changed = false;

  const outLines = lines.map((line) => {
    if (!line || line.startsWith("#")) return line;
    if (!line.includes("\t")) return line;

    const parts = line.split("\t");
    if (parts.length < 7) return line;
    looksLikeNetscape = true;

    const domain = parts[0] ?? "";
    const includeSubdomains = (parts[1] ?? "").toUpperCase();

    // cookiejar 的坑：
    // - domain 以 "." 開頭 => includeSubdomains 必須 TRUE
    // - includeSubdomains 為 FALSE => domain 不該以 "." 開頭
    if (domain.startsWith(".") && includeSubdomains === "FALSE") {
      parts[0] = domain.slice(1);
      changed = true;
    }

    return parts.join("\t");
  });

  if (!looksLikeNetscape || !changed) return { path: cookiesPath, changed: false };

  const tmpDir = path.join(os.tmpdir(), "ai_yd_dlp");
  fs.mkdirSync(tmpDir, { recursive: true });

  const hash = crypto.createHash("sha1").update(text).digest("hex").slice(0, 10);
  const outPath = path.join(tmpDir, `cookies_normalized_${hash}.txt`);
  fs.writeFileSync(outPath, outLines.join("\n"), "utf8");

  return { path: outPath, changed: true };
}

export function parseNetscapeCookiesFile(cookiesPath: string): CookiesSetDetails[] {
  if (!fs.existsSync(cookiesPath)) return [];

  const raw = fs.readFileSync(cookiesPath);
  let text = raw.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const out: CookiesSetDetails[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length < 7) continue;

    const domainRaw = parts[0] ?? "";
    const domain = domainRaw.startsWith(".") ? domainRaw.slice(1) : domainRaw;
    const pathValue = parts[2] ?? "/";
    const secure = (parts[3] ?? "").toUpperCase() === "TRUE";
    const expiresRaw = parts[4] ?? "";
    const name = parts[5] ?? "";
    const value = parts[6] ?? "";

    if (!domain || !name) continue;

    const url = `${secure ? "https" : "http"}://${domain}${pathValue.startsWith("/") ? "" : "/"}${pathValue}`;

    const cookie: CookiesSetDetails = {
      url,
      name,
      value,
      domain,
      path: pathValue,
      secure,
      httpOnly: false
    };

    // Electron expects expirationDate in seconds since epoch (number).
    if (/^\d+$/.test(expiresRaw)) {
      cookie.expirationDate = Number(expiresRaw);
    }

    out.push(cookie);
  }

  return out;
}

