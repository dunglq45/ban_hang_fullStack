// Ghi sổ kho (stock_movements) và phiếu kiểm kho. Giai đoạn 05–06 thêm bán, nhập, hủy vào đây.
import { and, eq, sql } from "drizzle-orm";
import { lineAmount } from "../../shared/qty";
import type { Database } from "../db/client";
import { documentLines, documents, products, stockMovements } from "../db/schema";
import { codeStatements } from "../lib/codes";

export const OPENING_STOCK_NOTE = "Tồn đầu kỳ";

export interface OpeningStockItem {
  productId: string;
  baseUnit: string;
  /** milli đơn vị cơ bản, > 0. Hàng phải được INSERT với stock = qty TRƯỚC các câu này trong batch. */
  qty: number;
  /** giá vốn / đơn vị cơ bản */
  unitCost: number;
  lineId: string;
  movementId: string;
}

export interface SaleLine {
  documentId: string;
  lineId: string;
  movementId: string;
  productId: string;
  unitName: string;
  factor: number;
  /** milli theo đơn vị đã chọn */
  qty: number;
  /** milli đơn vị cơ bản = qty × factor */
  baseQty: number;
  unitPrice: number;
  lineTotal: number;
  now: number;
}

export function stockRepository(db: Database, storeId: string) {
  // Subquery đọc trong cùng batch (thấy kết quả các câu chạy trước nó). Dùng alias "p" để cột
  // không bị hiểu nhầm sang bảng đang INSERT/UPDATE.
  /** Tồn hiện tại. */
  const currentStock = (productId: string) =>
    sql<number>`(SELECT p.stock FROM ${products} AS p WHERE p.store_id = ${storeId} AND p.id = ${productId})`;
  /** Giá vốn bình quân hiện tại / đơn vị cơ bản. */
  const currentCost = (productId: string) =>
    sql<number>`(SELECT p.cost_price FROM ${products} AS p WHERE p.store_id = ${storeId} AND p.id = ${productId})`;
  /** stock = stock + delta (delta âm khi xuất). CHECK products_stock_check chặn tồn âm. */
  const moveStock = (productId: string, delta: number, now: number) =>
    db
      .update(products)
      .set({ stock: sql`${products.stock} + ${delta}`, updatedAt: now })
      .where(and(eq(products.storeId, storeId), eq(products.id, productId)));

  return {
    /**
     * Phiếu kiểm kho KK (completed) ghi nhận tồn đầu kỳ của các mặt hàng vừa tạo:
     * mỗi hàng một dòng phiếu (system 0 → actual qty) và một dòng sổ kho `adjust`.
     * Trả về danh sách câu lệnh để đặt SAU các câu INSERT products trong cùng batch.
     */
    openingStockStatements(input: {
      documentId: string;
      createdBy: string;
      now: number;
      items: OpeningStockItem[];
    }) {
      const kk = codeStatements(db, storeId, "KK");
      return [
        kk.bump,
        db.insert(documents).values({
          id: input.documentId,
          storeId,
          type: "stock_count",
          code: kk.code,
          status: "completed",
          note: OPENING_STOCK_NOTE,
          createdBy: input.createdBy,
          createdAt: input.now,
          completedAt: input.now,
        }),
        ...input.items.flatMap((it) => [
          db.insert(documentLines).values({
            id: it.lineId,
            storeId,
            documentId: input.documentId,
            productId: it.productId,
            unitName: it.baseUnit,
            factor: 1,
            qty: it.qty,
            baseQty: it.qty,
            unitPrice: it.unitCost,
            lineTotal: lineAmount(it.qty, it.unitCost),
            costPrice: it.unitCost,
            systemQty: 0,
            actualQty: it.qty,
            reason: OPENING_STOCK_NOTE,
          }),
          db.insert(stockMovements).values({
            id: it.movementId,
            storeId,
            productId: it.productId,
            documentId: input.documentId,
            type: "adjust",
            qtyChange: it.qty,
            stockAfter: currentStock(it.productId),
            unitCost: it.unitCost,
            note: OPENING_STOCK_NOTE,
            createdAt: input.now,
          }),
        ]),
      ] as const;
    },

    /**
     * Một dòng hóa đơn bán: INSERT dòng (giá vốn chụp lại qua subquery), trừ tồn, ghi sổ kho
     * (stock_after và unit_cost qua subquery). Đặt sau câu INSERT documents trong cùng batch.
     */
    saleLineStatements(l: SaleLine) {
      return [
        db.insert(documentLines).values({
          id: l.lineId,
          storeId,
          documentId: l.documentId,
          productId: l.productId,
          unitName: l.unitName,
          factor: l.factor,
          qty: l.qty,
          baseQty: l.baseQty,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          costPrice: currentCost(l.productId),
        }),
        moveStock(l.productId, -l.baseQty, l.now),
        db.insert(stockMovements).values({
          id: l.movementId,
          storeId,
          productId: l.productId,
          documentId: l.documentId,
          type: "sale",
          qtyChange: -l.baseQty,
          stockAfter: currentStock(l.productId),
          unitCost: currentCost(l.productId),
          note: null,
          createdAt: l.now,
        }),
      ] as const;
    },

    /** Đảo một dòng chứng từ khi hủy: cộng/trừ lại tồn và ghi sổ kho loại `cancel`. */
    reverseLineStatements(r: {
      documentId: string;
      productId: string;
      /** milli đơn vị cơ bản cần cộng lại (âm nếu đảo phiếu nhập) */
      delta: number;
      unitCost: number;
      movementId: string;
      note: string;
      now: number;
    }) {
      return [
        moveStock(r.productId, r.delta, r.now),
        db.insert(stockMovements).values({
          id: r.movementId,
          storeId,
          productId: r.productId,
          documentId: r.documentId,
          type: "cancel",
          qtyChange: r.delta,
          stockAfter: currentStock(r.productId),
          unitCost: r.unitCost,
          note: r.note,
          createdAt: r.now,
        }),
      ] as const;
    },

    /** Số dòng sổ kho của một mặt hàng (dùng trong test đối chiếu sổ cái). */
    async movementSum(productId: string) {
      const row = await db
        .select({ sum: sql<number>`COALESCE(SUM(${stockMovements.qtyChange}), 0)` })
        .from(stockMovements)
        .where(and(eq(stockMovements.storeId, storeId), eq(stockMovements.productId, productId)))
        .get();
      return row?.sum ?? 0;
    },
  };
}
