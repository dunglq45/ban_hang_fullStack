// Báo cáo tổng quan (chỉ owner). Mọi "ngày", "tháng" theo giờ VN (shared/period.ts).
import type { z } from "zod";
import {
  DAY_MS,
  periodRange,
  type TimeRange,
  vnDateKey,
  vnDayStart,
  VN_OFFSET_MS,
} from "../../shared/period";
import type {
  periodQuerySchema,
  restockQuerySchema,
  topProductsQuerySchema,
} from "../../shared/schemas/report";
import type { StoreDb } from "../db/client";
import { OVERDUE_DAYS } from "./debts";

type PeriodQuery = z.output<typeof periodQuerySchema>;

function rangeOf(q: PeriodQuery, now: number): TimeRange {
  return q.from !== undefined && q.to !== undefined
    ? periodRange({ from: q.from, to: q.to }, now)
    : periodRange(q.period, now);
}

/**
 * Doanh thu = tổng tiền hóa đơn bán hoàn thành (đã trừ chiết khấu hóa đơn) − trả hàng;
 * lợi nhuận gộp = doanh thu − giá vốn đã chụp ở từng dòng lúc bán (nên đã tính phần chiết khấu).
 */
export async function overview(db: StoreDb, q: PeriodQuery, now = Date.now()) {
  const range = rangeOf(q, now);
  const [sales, cost, receivable, overdue, restock] = await Promise.all([
    db.reports.sales(range),
    db.reports.costOfGoods(range),
    db.debts.outstanding("customer"),
    db.debts.outstanding("customer", now - OVERDUE_DAYS * DAY_MS),
    db.reports.restock(1, 1),
  ]);
  const grossProfit = sales.revenue - cost;
  return {
    range,
    revenue: sales.revenue,
    orders: sales.orders,
    averageOrder: sales.orders > 0 ? Math.round(sales.revenue / sales.orders) : 0,
    costOfGoods: cost,
    grossProfit,
    /** Biên lợi nhuận gộp (%), 1 chữ số thập phân; null khi chưa có doanh thu. */
    margin: sales.revenue > 0 ? Math.round((grossProfit * 1000) / sales.revenue) / 10 : null,
    receivable: {
      amount: receivable.amount,
      customers: receivable.count,
      overdueAmount: overdue.amount,
      overdueCustomers: overdue.count,
    },
    restock: { total: restock.total, out: restock.out, low: restock.low },
  };
}

/** Doanh thu từng ngày của N ngày gần nhất (tính cả hôm nay), ngày không bán ra 0. */
export async function revenueDaily(db: StoreDb, days: number, now = Date.now()) {
  const today = vnDayStart(now);
  const range = { from: today - (days - 1) * DAY_MS, to: today + DAY_MS };
  const rows = await db.reports.daily(range);
  const byDay = new Map(rows.map((r) => [Number(r.day), r]));
  const items = Array.from({ length: days }, (_, i) => {
    const from = range.from + i * DAY_MS;
    const row = byDay.get((from + VN_OFFSET_MS) / DAY_MS);
    return {
      date: vnDateKey(from),
      from,
      revenue: row?.revenue ?? 0,
      orders: row?.orders ?? 0,
    };
  });
  return {
    range,
    items,
    total: items.reduce((s, d) => s + d.revenue, 0),
    orders: items.reduce((s, d) => s + d.orders, 0),
  };
}

export async function topProducts(
  db: StoreDb,
  q: z.output<typeof topProductsQuerySchema>,
  now = Date.now(),
) {
  const range = rangeOf(q, now);
  const rows = await db.reports.topProducts(range, q.sort, q.limit);
  return {
    range,
    items: rows.map((r, i) => ({
      rank: i + 1,
      productId: r.productId,
      code: r.code ?? "",
      name: r.name ?? "",
      baseUnit: r.baseUnit ?? "",
      qty: r.qty,
      revenue: r.revenue,
    })),
  };
}

export async function restock(db: StoreDb, q: z.output<typeof restockQuerySchema>) {
  const result = await db.reports.restock(q.page, q.pageSize);
  return {
    items: result.items,
    total: result.total,
    counts: { out: result.out, low: result.low },
    page: q.page,
    pageSize: q.pageSize,
  };
}
