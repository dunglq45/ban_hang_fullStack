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

export function stockRepository(db: Database, storeId: string) {
  /** Tồn hiện tại đọc trong cùng batch (sau các câu đã chạy trước nó). */
  const currentStock = (productId: string) =>
    sql<number>`(SELECT ${products.stock} FROM ${products} WHERE ${products.storeId} = ${storeId} AND ${products.id} = ${productId})`;

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
