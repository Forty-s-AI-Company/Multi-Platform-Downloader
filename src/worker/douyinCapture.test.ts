import { describe, expect, it } from "vitest";
import { isUsableDouyinMediaUrl } from "../../electron/worker/douyinUrlGuards";

describe("isUsableDouyinMediaUrl", () => {
  it("會排除 blob URL", () => {
    expect(isUsableDouyinMediaUrl("blob:https://www.douyin.com/abc-123")).toBe(false);
  });

  it("會接受 http 與 https 媒體網址", () => {
    expect(isUsableDouyinMediaUrl("https://v3-web.douyinvod.com/video/tos/cn/test.mp4")).toBe(true);
    expect(isUsableDouyinMediaUrl("http://example.com/test.m3u8")).toBe(true);
  });
});
