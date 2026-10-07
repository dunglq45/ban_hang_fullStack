import { describe, expect, it } from "vitest";
import { parseVnDate } from "../../../shared/period";
import { barHeight, dayLabel, formatPercent, restockQty, shortMoney } from "./dashboard-utils";

describe("shortMoney", () => {
  it("rút gọn theo triệu/nghìn/tỷ như design", () => {
    expect(shortMoney(3_245_000)).toBe("3,2tr");
    expect(shortMoney(4_600_000)).toBe("4,6tr");
    expect(shortMoney(2_000_000)).toBe("2tr");
    expect(shortMoney(850_000)).toBe("850k");
    expect(shortMoney(999_600)).toBe("1tr");
    expect(shortMoney(1_250_000_000)).toBe("1,3 tỷ");
    expect(shortMoney(500)).toBe("500");
    expect(shortMoney(0)).toBe("0");
    expect(shortMoney(-1_500_000)).toBe("-1,5tr");
  });
});

describe("dayLabel", () => {
  it("thứ viết tắt + ngày/tháng theo giờ VN; hôm nay là 'Hôm nay'", () => {
    const tue = parseVnDate("2026-09-29")!;
    const sun = parseVnDate("2026-10-04")!;
    expect(dayLabel(tue, "2026-10-05")).toBe("T3 29/9");
    expect(dayLabel(sun, "2026-10-05")).toBe("CN 4/10");
    expect(dayLabel(parseVnDate("2026-10-05")!, "2026-10-05")).toBe("Hôm nay");
  });
});

describe("barHeight", () => {
  it("tỷ lệ theo giá trị lớn nhất, cột có doanh thu cao ít nhất 2px", () => {
    expect(barHeight(4_600_000, 4_600_000, 160)).toBe(160);
    expect(barHeight(2_300_000, 4_600_000, 160)).toBe(80);
    expect(barHeight(1, 4_600_000, 160)).toBe(2);
    expect(barHeight(0, 4_600_000, 160)).toBe(0);
    expect(barHeight(0, 0, 160)).toBe(0);
  });
});

describe("restockQty", () => {
  it("đủ lên mức tối thiểu, làm tròn lên đơn vị nguyên, ít nhất 1", () => {
    expect(restockQty(2_000, 6_000)).toBe(4_000);
    expect(restockQty(2_500, 6_000)).toBe(4_000);
    expect(restockQty(0, 0)).toBe(1_000);
    expect(restockQty(-3_000, 5_000)).toBe(8_000);
    expect(restockQty(9_000, 10_000)).toBe(1_000);
  });
});

describe("formatPercent", () => {
  it("dấu phẩy thập phân", () => {
    expect(formatPercent(21.9)).toBe("21,9%");
    expect(formatPercent(30)).toBe("30%");
    expect(formatPercent(-5.5)).toBe("-5,5%");
  });
});
