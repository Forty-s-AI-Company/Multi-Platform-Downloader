import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractTikTokVideoUrlsFromCandidates,
  shouldCollectDouyinBatch,
  shouldCollectTikTokBatch
} from "../../shared/platformCollection";

type FixtureCase = {
  platform: "douyin" | "tiktok";
  kind: string;
  url: string;
  shouldCollectBatch: boolean;
};

const fixturePath = path.resolve(process.cwd(), "fixtures", "tiktok-douyin-cases.json");
const fixtureCases = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as FixtureCase[];

describe("platform collection rules", () => {
  for (const entry of fixtureCases) {
    it(`${entry.platform} ${entry.kind} 批次判斷正確`, () => {
      const actual =
        entry.platform === "douyin"
          ? shouldCollectDouyinBatch(entry.url)
          : shouldCollectTikTokBatch(entry.url);

      expect(actual).toBe(entry.shouldCollectBatch);
    });
  }
});

describe("extractTikTokVideoUrlsFromCandidates", () => {
  it("只保留可用的 TikTok 作品網址並去重", () => {
    const urls = extractTikTokVideoUrlsFromCandidates(
      [
        "/@demo/video/1111111111111111111?lang=zh-Hant",
        "https://www.tiktok.com/@demo/video/1111111111111111111",
        "https://www.tiktok.com/@demo/video/2222222222222222222?is_copy_url=1",
        "https://www.tiktok.com/@demo",
        "https://example.com/not-tiktok"
      ],
      "https://www.tiktok.com/@demo"
    );

    expect(urls).toEqual([
      "https://www.tiktok.com/@demo/video/1111111111111111111",
      "https://www.tiktok.com/@demo/video/2222222222222222222"
    ]);
  });
});
