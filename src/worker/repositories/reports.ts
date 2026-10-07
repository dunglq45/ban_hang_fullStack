// Truy vấn báo cáo (chỉ owner). Doanh thu tính theo hóa đơn bán đã hoàn thành (hóa đơn bị hủy
// không tính), trừ phiếu khách trả hàng (sale_return) nếu có. Kỳ báo cáo là [from, to) theo created_at.
import { and, asc, count, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { DAY_MS, type TimeRange, VN_OFFSET_MS } from "../../shared/period";
import type { Database } from "../db/client";
import { documentLines, documents, products } from "../db/schema";
import { isLow, isOut } from "./products";

export type TopProductSort = "qty" | "revenue";

/** +1 với hóa đơn bán, −1 với phiếu khách trả hàng. */
const sign = sql<number>`(CASE WHEN ${documents.type} = 'sale_return' THEN -1 ELSE 1 END)`;

/**
 * Giá vốn của dòng = base_qty × cost_price / 1000, làm tròn tới đồng TỪNG DÒNG (như lineAmount),
 * nên tổng có thể lệch tối đa 0,5đ mỗi dòng so với làm tròn một lần trên tổng.
 */
const lineCost = sql<number>`CAST(ROUND(CAST(${documentLines.baseQty} AS REAL) * ${documentLines.costPrice} / 1000) AS INTEGER)`;

export function reportsRepository(db: Database, storeId: string) {
  const sold = (r: TimeRange) =>
    and(
      eq(documents.storeId, storeId),
      inArray(documents.type, ["sale", "sale_return"]),
      eq(documents.status, "completed"),
      gte(documents.createdAt, r.from),
      lt(documents.createdAt, r.to),
    );

  return {
    /** Doanh thu (sau chiết khấu hóa đơn) và số hóa đơn bán. */
    async sales(r: TimeRange) {
      const row = await db
        .select({
          revenue: sql<number>`COALESCE(SUM(${sign} * ${documents.total}), 0)`,
          orders: sql<number>`COALESCE(SUM(CASE WHEN ${documents.type} = 'sale' THEN 1 ELSE 0 END), 0)`,
        })
        .from(documents)
        .where(sold(r))
        .get();
      return { revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 };
    },

    /** Giá vốn hàng bán trong kỳ (theo giá vốn đã chụp ở từng dòng lúc bán). */
    async costOfGoods(r: TimeRange) {
      const row = await db
        .select({ cost: sql<number>`COALESCE(SUM(${sign} * ${lineCost}), 0)` })
        .from(documentLines)
        .innerJoin(
          documents,
          and(eq(documents.id, documentLines.documentId), eq(documents.storeId, storeId)),
        )
        .where(and(eq(documentLines.storeId, storeId), sold(r)))
        .get();
      return row?.cost ?? 0;
    },

    /** Doanh thu theo ngày giờ VN; chỉ có ngày có phát sinh (`day` = số ngày kể từ 1970-01-01 giờ VN). */
    daily(r: TimeRange) {
      // Hằng số ghi thẳng vào SQL: tham số bind từ JS là số thực, phép chia sẽ không còn là chia nguyên.
      const day = sql<number>`((${documents.createdAt} + ${sql.raw(String(VN_OFFSET_MS))}) / ${sql.raw(String(DAY_MS))})`;
      return db
        .select({
          day,
          revenue: sql<number>`COALESCE(SUM(${sign} * ${documents.total}), 0)`,
          orders: sql<number>`COALESCE(SUM(CASE WHEN ${documents.type} = 'sale' THEN 1 ELSE 0 END), 0)`,
        })
        .from(documents)
        .where(sold(r))
        .groupBy(day);
    },

    /** Hàng bán chạy: số lượng (milli đơn vị cơ bản) và doanh thu dòng (trước chiết khấu hóa đơn). */
    topProducts(r: TimeRange, sort: TopProductSort, limit: number) {
      const qty = sql<number>`SUM(${sign} * ${documentLines.baseQty})`;
      const revenue = sql<number>`SUM(${sign} * ${documentLines.lineTotal})`;
      return db
        .select({
          productId: documentLines.productId,
          code: sql<string | null>`MAX(${products.code})`,
          name: sql<string | null>`MAX(${products.name})`,
          baseUnit: sql<string | null>`MAX(${products.baseUnit})`,
          qty,
          revenue,
        })
        // CROSS JOIN buộc SQLite đi từ hóa đơn trong kỳ (idx_documents_list theo created_at) rồi
        // lấy dòng qua idx_lines_doc. Viết INNER JOIN thì planner chọn quét mọi dòng chứng từ của
        // cửa hàng theo idx_lines_product (để khỏi sắp xếp cho GROUP BY), chậm dần theo thời gian.
        .from(documents)
        .crossJoin(documentLines)
        .leftJoin(
          products,
          and(eq(products.id, documentLines.productId), eq(products.storeId, storeId)),
        )
        .where(
          and(
            sold(r),
            eq(documentLines.storeId, storeId),
            eq(documentLines.documentId, documents.id),
          ),
        )
        .groupBy(documentLines.productId)
        .having(sql`${qty} > 0`)
        .orderBy(
          ...(sort === "qty" ? [desc(qty), desc(revenue)] : [desc(revenue), desc(qty)]),
          asc(documentLines.productId),
        )
        .limit(limit);
    },

    /** Hàng cần nhập (đang bán, hết hoặc sắp hết): hết hàng trước, rồi tỷ lệ tồn / tối thiểu thấp nhất. */
    async restock(page: number, pageSize: number) {
      const where = and(eq(products.storeId, storeId), or(isLow, isOut));
      const [items, counts] = await Promise.all([
        db
          .select({
            id: products.id,
            code: products.code,
            name: products.name,
            baseUnit: products.baseUnit,
            stock: products.stock,
            minStock: products.minStock,
            costPrice: products.costPrice,
            isOut: sql<number>`${isOut}`,
          })
          .from(products)
          .where(where)
          .orderBy(
            sql`${products.stock} > 0`,
            sql`CAST(${products.stock} AS REAL) / MAX(${products.minStock}, 1)`,
            asc(products.nameSearch),
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db
          .select({
            total: count(),
            out: sql<number>`COALESCE(SUM(CASE WHEN ${isOut} THEN 1 ELSE 0 END), 0)`,
          })
          .from(products)
          .where(where)
          .get(),
      ]);
      const total = counts?.total ?? 0;
      const out = counts?.out ?? 0;
      return {
        items: items.map(({ isOut: o, ...p }) => ({
          ...p,
          status: o ? ("out" as const) : ("low" as const),
        })),
        total,
        out,
        low: total - out,
      };
    },
  };
}
