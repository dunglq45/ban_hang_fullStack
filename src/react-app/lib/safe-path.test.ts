import { describe, expect, it } from "vitest";
import { isSafePath } from "./safe-path";

describe("isSafePath", () => {
  it("nhận đường dẫn nội bộ", () => {
    expect(isSafePath("/hang-hoa")).toBe(true);
    expect(isSafePath("/so-no/abc?tab=1")).toBe(true);
  });

  it("từ chối đường dẫn sang domain khác hoặc không bắt đầu bằng /", () => {
    for (const p of [
      undefined,
      "",
      "hang-hoa",
      "//evil.com",
      String.raw`/\evil.com`,
      "/\t/evil.com",
      "https://evil.com",
    ]) {
      expect(isSafePath(p), String(p)).toBe(false);
    }
  });
});
