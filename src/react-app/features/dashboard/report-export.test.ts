import { describe, expect, it } from "vitest";
import { DAY_MS } from "../../../shared/period";
import type { Overview, Restock, RevenueDaily, TopProducts } from "../../api/reports";
import { rangeText, reportFileName, reportSheets } from "./report-export";

const overview: Overview = {
  range: { from: Date.UTC(2026, 9, 1, -7), to: Date.UTC(2026, 9, 2, -7) },
  revenue: 3_245_000,
  orders: 42,
  averageOrder: 77_262,
  costOfGoods: 2_533_000,
  grossProfit: 712_000,
  margin: 21.9,
  receivable: { amount: 4_873_000, customers: 14, overdueAmount: 1_200_000, overdueCustomers: 2 },
  restock: { total: 2, out: 1, low: 1 },
};

const daily: RevenueDaily = {
  range: { from: overview.range.from - 6 * DAY_MS, to: overview.range.to },
  items: [{ date: "2026-10-01", from: overview.range.from, revenue: 3_245_000, orders: 42 }],
  total: 3_245_000,
  orders: 42,
};

const top: TopProducts = {
  range: overview.range,
  items: [
    {
      rank: 1,
      productId: "p-mi",
      code: "SP000001",
      name: "Mì gói tôm chua cay",
      baseUnit: "Gói",
      qty: 46_000,
      revenue: 207_000,
    },
  ],
};

const restock: Restock = {
  items: [
    {
      id: "p-bot",
      code: "SP000010",
      name: "Bột giặt 3kg",
      baseUnit: "Gói",
      stock: 0,
      minStock: 5_000,
      costPrice: 120_000,
      status: "out",
    },
  ],
  total: 1,
  counts: { out: 1, low: 0 },
  page: 1,
  pageSize: 100,
};

const data = {
  storeName: "Tạp hóa Minh Anh",
  overview,
  daily,
  top,
  restock,
  now: Date.UTC(2026, 9, 2),
};

describe("rangeText", () => {
  it("một ngày thì chỉ một mốc, nhiều ngày thì có gạch nối", () => {
    expect(rangeText(overview.range)).toBe("01/10/2026");
    expect(rangeText({ from: overview.range.from, to: overview.range.from + 5 * DAY_MS })).toBe(
      "01/10/2026 – 05/10/2026",
    );
  });
});

describe("reportSheets", () => {
  it("4 sheet: tổng quan, doanh thu 7 ngày, bán chạy, cần nhập thêm", () => {
    const sheets = reportSheets(data);
    expect(sheets.map((s) => s.name)).toEqual([
      "Tổng quan",
      "Doanh thu 7 ngày",
      "Bán chạy",
      "Cần nhập thêm",
    ]);
    expect(sheets[0]!.rows).toContainEqual(["Doanh thu", 3_245_000]);
    expect(sheets[0]!.rows).toContainEqual(["Biên lợi nhuận (%)", 21.9]);
    expect(sheets[1]!.rows[1]).toEqual(["01/10/2026", 3_245_000, 42]);
    expect(sheets[2]!.rows[2]).toEqual([1, "SP000001", "Mì gói tôm chua cay", "Gói", 46, 207_000]);
    // Số lượng quy về đơn vị (fromMilli), không phải milli thô.
    expect(sheets[3]!.rows[1]).toEqual(["SP000010", "Bột giặt 3kg", "Gói", 0, 5, "Hết hàng", 5]);
  });

  it("ghi chú khi restock còn hàng chưa liệt kê hết", () => {
    const sheets = reportSheets({
      ...data,
      restock: { ...restock, total: 10 },
    });
    expect(sheets[3]!.rows.at(-1)).toEqual(["Còn 9 mặt hàng khác chưa liệt kê"]);
  });
});

describe("reportFileName", () => {
  it("một ngày thì chỉ một mốc trong tên file", () => {
    expect(reportFileName(overview.range)).toBe("bao-cao-20261001.xlsx");
    expect(
      reportFileName({ from: overview.range.from, to: overview.range.from + 5 * DAY_MS }),
    ).toBe("bao-cao-20261001-20261005.xlsx");
  });
});
