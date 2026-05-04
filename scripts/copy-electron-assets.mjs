import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const src = path.join(repoRoot, "electron", "preload.cjs");
const outDir = path.join(repoRoot, "dist-electron");
const dst = path.join(outDir, "preload.cjs");

if (!fs.existsSync(src)) {
  throw new Error(`找不到 preload：${src}`);
}
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.copyFileSync(src, dst);
