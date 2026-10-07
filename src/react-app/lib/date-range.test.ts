import { describe, expect, it } from "vitest";
import { customRangeError } from "./date-range";

describe("customRangeError", () => {
  it("giống kiểm tra của server", () => {
    expect(customRangeError("2026-10-01", "2026-10-05")).toBeNull();
    expect(customRangeError("2026-10-05", "2026-10-05")).toBeNull();
    expect(customRangeError("2026-10-06", "2026-10-05")).toMatch(/sau ngày bắt đầu/);
    expect(customRangeError("2025-01-01", "2026-10-05")).toMatch(/tối đa 366 ngày/);
    expect(customRangeError("", "2026-10-05")).toMatch(/Chọn đủ/);
  });
});
