// eslint-disable-next-line no-control-regex
const INVALID_WIN_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;

export function sanitizeFileComponent(input: string): string {
  const s = input
    .replace(/\s+/g, " ")
    .replace(INVALID_WIN_CHARS, "")
    .trim()
    .replace(/[. ]+$/g, ""); // 避免 Windows 尾端是 "." 或空白

  // 避免太長（Windows 路徑/檔名很容易炸）
  if (s.length > 120) return s.slice(0, 120).trim();
  return s || "untitled";
}

export function normalizeWebTitle(raw: string): string {
  let s = raw.trim();
  // 常見網站會帶站名在尾巴：先做保守裁切（不硬猜太多）
  s = s.replace(/\s+\|\s+Skool\s*$/i, "");
  s = s.replace(/\s+-\s+Skool\s*$/i, "");
  return s.trim();
}
