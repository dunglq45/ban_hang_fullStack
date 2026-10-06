import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatLongDate,
  formatMoney,
  formatQty,
  initials,
} from "./format";

// 2026-10-05 17:30 UTC = 06/10/2026 00:30 giờ VN.
const AFTER_MIDNIGHT_VN = Date.UTC(2026, 9, 5, 17, 30);

describe("format", () => {
  it("tiền và số lượng theo vi-VN", () => {
    expect(formatMoney(100000)).toBe("100.000");
    expect(formatMoney(-21000)).toBe("-21.000");
    expect(formatQty(1500, "Kg")).toBe("1,5 Kg");
  });

  it("ngày giờ theo giờ VN, dạng dd/MM/yyyy HH:mm", () => {
    expect(formatDateTime(AFTER_MIDNIGHT_VN)).toBe("06/10/2026 00:30");
    expect(formatDate(AFTER_MIDNIGHT_VN)).toBe("06/10/2026");
    expect(formatDateTime(Date.UTC(2026, 0, 1, 6, 5))).toBe("01/01/2026 13:05");
  });

  it("thứ trong tuần theo giờ VN", () => {
    expect(formatLongDate(Date.UTC(2026, 9, 5, 3))).toBe("Thứ Hai, 05/10/2026");
    expect(formatLongDate(AFTER_MIDNIGHT_VN)).toBe("Thứ Ba, 06/10/2026");
    expect(formatLongDate(Date.UTC(2026, 9, 4, 3))).toBe("Chủ nhật, 04/10/2026");
  });

  it("chữ viết tắt avatar", () => {
    expect(initials("Tạp hóa Minh Anh")).toBe("MA");
    expect(initials("lan")).toBe("LA");
    expect(initials("  ")).toBe("?");
  });
});
