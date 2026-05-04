import type { YtDlpProgress } from "./ytDlp.js";

// 解析 yt-dlp 常見進度行（例）：
// [download]  12.3% of 10.00MiB at 1.23MiB/s ETA 00:12
// [download]  99.9% of ~ 50.00MiB at 2.10MiB/s ETA 00:00
export function parseYtDlpProgressLine(line: string): YtDlpProgress | null {
  if (!line.includes("[download]")) return null;

  // percent
  const percentMatch = line.match(/(\d+(?:\.\d+)?)%/);
  const percent = percentMatch ? Number(percentMatch[1]) : undefined;

  // total
  const totalMatch = line.match(/of\s+~?\s*([0-9.]+\s*[KMGTP]?i?B)/i);
  const total = totalMatch ? totalMatch[1].replace(/\s+/g, "") : undefined;

  // speed
  const speedMatch = line.match(/at\s+([0-9.]+\s*[KMGTP]?i?B\/s)/i);
  const speed = speedMatch ? speedMatch[1].replace(/\s+/g, "") : undefined;

  // eta
  const etaMatch = line.match(/ETA\s+([0-9:]+)/i);
  const eta = etaMatch ? etaMatch[1] : undefined;

  if (percent === undefined && !speed && !eta) return null;
  return { percent, total, speed, eta };
}
