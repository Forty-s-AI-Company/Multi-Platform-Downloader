export function isUsableDouyinMediaUrl(input: unknown): input is string {
  if (typeof input !== "string") return false;
  const value = input.trim();
  if (!value) return false;
  if (value.startsWith("blob:")) return false;
  return /^https?:\/\//i.test(value);
}
