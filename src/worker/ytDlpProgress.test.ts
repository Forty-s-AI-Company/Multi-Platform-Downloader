import { describe, expect, it } from "vitest";
import { parseYtDlpProgressLine } from "../../electron/worker/ytDlpProgress";

describe("parseYtDlpProgressLine", () => {
  it("解析一般進度行", () => {
    const line = "[download]  12.3% of 10.00MiB at 1.23MiB/s ETA 00:12";
    const p = parseYtDlpProgressLine(line);
    expect(p?.percent).toBeCloseTo(12.3);
    expect(p?.total).toBe("10.00MiB");
    expect(p?.speed).toBe("1.23MiB/s");
    expect(p?.eta).toBe("00:12");
  });

  it("忽略非 download 行", () => {
    expect(parseYtDlpProgressLine("[info] something")).toBeNull();
  });
});

