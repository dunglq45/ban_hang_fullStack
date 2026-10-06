import { describe, expect, it } from "vitest";
import { formatVnd, parseVnd } from "../../src/shared/money";

describe("money", () => {
  it("formatVnd theo vi-VN", () => {
    expect(formatVnd(100_000)).toBe("100.000");
    expect(formatVnd(1_180_000)).toBe("1.180.000");
    expect(formatVnd(0)).toBe("0");
    expect(formatVnd(4500)).toBe("4.500");
    expect(formatVnd(-21_000)).toBe("-21.000");
  });

  it("parseVnd bỏ dấu chấm, khoảng trắng, ký hiệu tiền", () => {
    expect(parseVnd("100.000")).toBe(100_000);
    expect(parseVnd("1.180.000 đ")).toBe(1_180_000);
    expect(parseVnd(" 4500 ")).toBe(4500);
    expect(parseVnd("-21.000")).toBe(-21_000);
    expect(parseVnd("0")).toBe(0);
    expect(parseVnd("50.000₫")).toBe(50_000);
    expect(parseVnd("1 000 000")).toBe(1_000_000);
  });

  it("parseVnd trả null khi không có số", () => {
    expect(parseVnd("")).toBeNull();
    expect(parseVnd("abc")).toBeNull();
    expect(parseVnd("-")).toBeNull();
  });

  it("parseVnd từ chối chuỗi gõ sai thay vì đoán ra số tiền khác", () => {
    expect(parseVnd("12.500,5")).toBeNull();
    expect(parseVnd("1,5tr")).toBeNull();
    expect(parseVnd("abc12x3")).toBeNull();
    expect(parseVnd("100-200")).toBeNull();
    expect(parseVnd("100k")).toBeNull();
  });

  it("formatVnd và parseVnd khớp nhau", () => {
    for (const n of [0, 500, 100_000, 48_620_000]) expect(parseVnd(formatVnd(n))).toBe(n);
  });
});
