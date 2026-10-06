import { describe, expect, it } from "vitest";
import { DAY_MS } from "../../../shared/period";
import {
  debtAgeLabel,
  debtDays,
  debtQuickAmounts,
  isOverdue,
  ledgerFileName,
  ledgerSheetRows,
  shortDate,
} from "./debt-utils";

const NOW = Date.UTC(2026, 9, 5, 3); // 05/10/2026 10:00 giờ VN

describe("số ngày nợ", () => {
  it("tính số ngày từ ngày bắt đầu nợ, quá 30 ngày là quá hạn (khớp server)", () => {
    expect(debtDays(null, NOW)).toBeNull();
    expect(debtDays(NOW - 20 * DAY_MS - 1000, NOW)).toBe(20);
    expect(isOverdue(NOW - 30 * DAY_MS, NOW)).toBe(true);
    expect(isOverdue(NOW - 30 * DAY_MS + 1, NOW)).toBe(false);
    expect(isOverdue(null, NOW)).toBe(false);
  });

  it("nhãn: hôm nay / số ngày / quá hạn", () => {
    expect(debtAgeLabel(NOW - 1000, NOW)).toBe("Hôm nay");
    expect(debtAgeLabel(NOW - 8 * DAY_MS, NOW)).toBe("8 ngày");
    expect(debtAgeLabel(NOW - 41 * DAY_MS, NOW)).toBe("Quá hạn · 41 ngày");
    expect(debtAgeLabel(null, NOW)).toBeNull();
  });
});

describe("ngày trong sổ", () => {
  it("cùng năm bỏ năm, khác năm ghi 2 số cuối (theo giờ VN)", () => {
    expect(shortDate(NOW, NOW)).toBe("05/10");
    expect(shortDate(Date.UTC(2025, 11, 31, 18), NOW)).toBe("01/01");
    expect(shortDate(Date.UTC(2025, 11, 31, 16), NOW)).toBe("31/12/25");
  });
});

describe("nút thu nhanh", () => {
  it("các mức tròn nhỏ hơn số nợ, lớn trước", () => {
    expect(debtQuickAmounts(363_000)).toEqual([200_000, 100_000, 50_000]);
    expect(debtQuickAmounts(1_200_000)).toEqual([1_000_000, 500_000, 200_000]);
    expect(debtQuickAmounts(200_000)).toEqual([100_000, 50_000, 20_000]);
    expect(debtQuickAmounts(15_000)).toEqual([10_000]);
    expect(debtQuickAmounts(5_000)).toEqual([]);
  });
});

describe("xuất Excel", () => {
  it("thông tin đầu trang rồi sổ theo thứ tự thời gian (cũ trước), số giữ dạng số", () => {
    const rows = ledgerSheetRows(
      { code: "KH000027", name: "Chị Lan", phone: "0912345678", debt: 363_000 },
      [
        {
          createdAt: NOW,
          ref: { code: "HD000231" },
          description: "Bán hàng, trả thiếu",
          increase: 13_000,
          decrease: 0,
          balanceAfter: 363_000,
        },
        {
          createdAt: NOW - 7 * DAY_MS,
          ref: null,
          description: "Nợ cũ chuyển sang",
          increase: 350_000,
          decrease: 0,
          balanceAfter: 350_000,
        },
      ],
      NOW,
    );
    expect(rows[1]).toEqual(["Tên", "Chị Lan"]);
    expect(rows[4]).toEqual(["Dư nợ hiện tại", 363_000]);
    const header = rows.findIndex((r) => r[0] === "Ngày");
    expect(rows.slice(header + 1)).toEqual([
      ["28/09/2026", "", "Nợ cũ chuyển sang", 350_000, 0, 350_000],
      ["05/10/2026", "HD000231", "Bán hàng, trả thiếu", 13_000, 0, 363_000],
    ]);
    expect(ledgerFileName("KH000027", NOW)).toBe("so-no-KH000027-20261005.xlsx");
  });
});
