import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  parseVnDate,
  periodRange,
  vnDateKey,
  vnDayStart,
  vnMonthStart,
} from "../../src/shared/period";

// 00:00 ngày 06/10/2026 giờ VN = 17:00 ngày 05/10/2026 UTC.
const MIDNIGHT_VN = Date.UTC(2026, 9, 5, 17, 0, 0);

describe("khoảng thời gian theo giờ VN", () => {
  it("23:30 giờ VN vẫn thuộc ngày hôm đó; 00:00 sang ngày mới", () => {
    const at2330 = MIDNIGHT_VN - 30 * 60_000;
    expect(vnDateKey(at2330)).toBe("2026-10-05");
    expect(vnDayStart(at2330)).toBe(MIDNIGHT_VN - DAY_MS);
    expect(vnDateKey(MIDNIGHT_VN)).toBe("2026-10-06");
    expect(vnDayStart(MIDNIGHT_VN)).toBe(MIDNIGHT_VN);
    expect(vnDateKey(MIDNIGHT_VN - 1)).toBe("2026-10-05");
  });

  it("today, 7d: nửa mở [from, to), 7 ngày tính cả hôm nay", () => {
    const now = MIDNIGHT_VN + 9 * 3_600_000; // 09:00 ngày 06/10 giờ VN
    expect(periodRange("today", now)).toEqual({ from: MIDNIGHT_VN, to: MIDNIGHT_VN + DAY_MS });
    expect(periodRange("7d", now)).toEqual({
      from: MIDNIGHT_VN - 6 * DAY_MS,
      to: MIDNIGHT_VN + DAY_MS,
    });
    // 23:30 tối 05/10 giờ VN: "hôm nay" vẫn là 05/10 dù ngày UTC đã là 05/10 16:30.
    expect(periodRange("today", MIDNIGHT_VN - 30 * 60_000).from).toBe(MIDNIGHT_VN - DAY_MS);
  });

  it("month: từ 00:00 ngày 1 giờ VN tới đầu tháng sau (kể cả tháng 12 → năm sau)", () => {
    // 00:30 ngày 01/10 giờ VN = 17:30 ngày 30/09 UTC: đã là tháng 10 theo giờ VN.
    const earlyOct = Date.UTC(2026, 8, 30, 17, 30);
    expect(vnMonthStart(earlyOct)).toBe(Date.UTC(2026, 8, 30, 17, 0));
    expect(periodRange("month", earlyOct)).toEqual({
      from: Date.UTC(2026, 8, 30, 17, 0),
      to: Date.UTC(2026, 9, 31, 17, 0),
    });
    const dec = Date.UTC(2026, 11, 15);
    expect(periodRange("month", dec).to).toBe(Date.UTC(2026, 11, 31, 17, 0));
  });

  it("tùy chọn from–to: bao gồm cả ngày cuối; ngày sai → null", () => {
    expect(periodRange({ from: "2026-10-01", to: "2026-10-05" })).toEqual({
      from: Date.UTC(2026, 8, 30, 17),
      to: Date.UTC(2026, 9, 5, 17),
    });
    expect(parseVnDate("2026-02-30")).toBeNull();
    expect(parseVnDate("2026-1-5")).toBeNull();
    expect(parseVnDate("2028-02-29")).toBe(Date.UTC(2028, 1, 28, 17));
  });
});
