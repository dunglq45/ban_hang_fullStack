// "Xuất báo cáo" ở Tổng quan: dựng các sheet Excel (mảng dòng) từ dữ liệu báo cáo. Hàm thuần,
// phần ghi file (SheetJS, tải động) nằm ở trang.
import { fromMilli } from "../../../shared/qty";
import type { Overview, Restock, RevenueDaily, TopProducts } from "../../api/reports";
import { formatDate, formatDateTime } from "../../lib/format";
import { restockQty } from "./dashboard-utils";

type Cell = string | number;
export interface ReportSheet {
  name: string;
  rows: Cell[][];
  /** Độ rộng cột (số ký tự). */
  widths: number[];
}

export interface ReportData {
  storeName: string;
  overview: Overview;
  daily: RevenueDaily;
  top: TopProducts;
  restock: Restock;
  now: number;
}

/** "01/10/2026 – 31/10/2026" (`to` của khoảng là mốc không bao gồm). */
export function rangeText(range: { from: number; to: number }): string {
  const from = formatDate(range.from);
  const to = formatDate(range.to - 1);
  return from === to ? from : `${from} – ${to}`;
}

export function reportSheets(d: ReportData): ReportSheet[] {
  const o = d.overview;
  const summary: Cell[][] = [
    ["Báo cáo tổng quan", d.storeName],
    ["Kỳ báo cáo", rangeText(o.range)],
    ["Xuất lúc", formatDateTime(d.now)],
    [],
    ["Chỉ tiêu", "Giá trị"],
    ["Doanh thu", o.revenue],
    ["Số đơn", o.orders],
    ["Trung bình / đơn", o.averageOrder],
    ["Giá vốn hàng bán", o.costOfGoods],
    ["Lợi nhuận gộp", o.grossProfit],
    ["Biên lợi nhuận (%)", o.margin ?? ""],
    [],
    ["Số hiện tại (không theo kỳ)"],
    ["Phải thu khách hàng", o.receivable.amount],
    ["Số khách đang nợ", o.receivable.customers],
    ["Nợ quá 30 ngày", o.receivable.overdueAmount],
    ["Số khách nợ quá 30 ngày", o.receivable.overdueCustomers],
    ["Hàng cần nhập", o.restock.total],
    ["Đã hết hàng", o.restock.out],
    ["Sắp hết hàng", o.restock.low],
  ];

  const daily: Cell[][] = [
    ["Ngày", "Doanh thu", "Số đơn"],
    ...d.daily.items.map((i) => [formatDate(i.from), i.revenue, i.orders]),
    ["Tổng", d.daily.total, d.daily.orders],
  ];

  const top: Cell[][] = [
    [`Bán chạy (${rangeText(d.top.range)})`],
    ["#", "Mã hàng", "Tên hàng", "Đơn vị", "Đã bán", "Doanh thu"],
    ...d.top.items.map((t) => [t.rank, t.code, t.name, t.baseUnit, fromMilli(t.qty), t.revenue]),
  ];

  const restock: Cell[][] = [
    ["Mã hàng", "Tên hàng", "Đơn vị", "Tồn", "Tối thiểu", "Trạng thái", "Gợi ý nhập"],
    ...d.restock.items.map((r) => [
      r.code,
      r.name,
      r.baseUnit,
      fromMilli(r.stock),
      fromMilli(r.minStock),
      r.status === "out" ? "Hết hàng" : "Sắp hết",
      fromMilli(restockQty(r.stock, r.minStock)),
    ]),
  ];
  if (d.restock.total > d.restock.items.length) {
    restock.push(
      [],
      [`Còn ${d.restock.total - d.restock.items.length} mặt hàng khác chưa liệt kê`],
    );
  }

  return [
    { name: "Tổng quan", rows: summary, widths: [28, 22] },
    { name: "Doanh thu 7 ngày", rows: daily, widths: [12, 14, 10] },
    { name: "Bán chạy", rows: top, widths: [5, 12, 36, 10, 10, 14] },
    { name: "Cần nhập thêm", rows: restock, widths: [12, 36, 10, 10, 10, 12, 12] },
  ];
}

/** "bao-cao-20261001-20261031.xlsx" (một ngày thì chỉ một mốc). */
export function reportFileName(range: { from: number; to: number }): string {
  const key = (ms: number) => formatDate(ms).split("/").reverse().join("");
  const from = key(range.from);
  const to = key(range.to - 1);
  return from === to ? `bao-cao-${from}.xlsx` : `bao-cao-${from}-${to}.xlsx`;
}
