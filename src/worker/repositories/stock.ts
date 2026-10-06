// Ghi sổ kho (stock_movements) và phiếu kiểm kho. Giai đoạn 05–06 thêm bán, nhập, hủy vào đây.
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { lineAmount } from "../../shared/qty";
import type { Database } from "../db/client";
import { documentLines, documents, products, stockMovements } from "../db/schema";
import { codeStatements } from "../lib/codes";
import { guardNotExists } from "../lib/guard";

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

    /**
     * Nhập kho một dòng phiếu nhập: giá vốn bình quân tính TRƯỚC khi cộng tồn, trong cùng câu
     * UPDATE (mọi biểu thức trong SET dùng giá trị cũ). Tồn âm coi như 0 (MAX(stock, 0)).
     * Sau đó ghi sổ kho `purchase` với stock_after qua subquery.
     */
    applyPurchaseStatements(r: {
      documentId: string;
      productId: string;
      /** milli đơn vị cơ bản */
      baseQty: number;
      /** giá nhập / đơn vị cơ bản sau phân bổ chiết khấu */
      inUnitCost: number;
      movementId: string;
      now: number;
    }) {
      const q = r.baseQty;
      const c = r.inUnitCost;
      const s = sql`MAX(${products.stock}, 0)`;
      return [
        db
          .update(products)
          .set({
            costPrice: sql`CASE WHEN ${s} + ${q} > 0
              THEN CAST(ROUND((${s} * ${products.costPrice} + ${q} * ${c}) * 1.0 / (${s} + ${q})) AS INTEGER)
              ELSE ${c} END`,
            stock: sql`${products.stock} + ${q}`,
            updatedAt: r.now,
          })
          .where(and(eq(products.storeId, storeId), eq(products.id, r.productId))),
        db.insert(stockMovements).values({
          id: r.movementId,
          storeId,
          productId: r.productId,
          documentId: r.documentId,
          type: "purchase",
          qtyChange: q,
          stockAfter: currentStock(r.productId),
          unitCost: c,
          note: null,
          createdAt: r.now,
        }),
      ] as const;
    },

    /**
     * Hủy một dòng phiếu nhập: trừ tồn (CHECK chặn nếu hàng đã bán và không cho bán âm) và tính
     * ngược giá vốn: tồn còn lại > 0 thì cost = (stock·cost − q·in_cost)/(stock − q), chặn dưới 0;
     * ngược lại giữ nguyên.
     */
    reversePurchaseStatements(r: {
      documentId: string;
      productId: string;
      baseQty: number;
      inUnitCost: number;
      movementId: string;
      note: string;
      now: number;
    }) {
      const q = r.baseQty;
      const c = r.inUnitCost;
      return [
        db
          .update(products)
          .set({
            costPrice: sql`CASE WHEN ${products.stock} - ${q} > 0
              THEN MAX(0, CAST(ROUND((${products.stock} * ${products.costPrice} - ${q} * ${c}) * 1.0
                / (${products.stock} - ${q})) AS INTEGER))
              ELSE ${products.costPrice} END`,
            stock: sql`${products.stock} - ${q}`,
            updatedAt: r.now,
          })
          .where(and(eq(products.storeId, storeId), eq(products.id, r.productId))),
        db.insert(stockMovements).values({
          id: r.movementId,
          storeId,
          productId: r.productId,
          documentId: r.documentId,
          type: "cancel",
          qtyChange: -q,
          stockAfter: currentStock(r.productId),
          unitCost: c,
          note: r.note,
          createdAt: r.now,
        }),
      ] as const;
    },

    /** Dòng phiếu kiểm kho mới: chụp tồn và giá vốn hiện tại qua subquery (đúng thời điểm ghi). */
    insertCountLine(r: {
      documentId: string;
      lineId: string;
      productId: string;
      unitName: string;
    }) {
      return db.insert(documentLines).values({
        id: r.lineId,
        storeId,
        documentId: r.documentId,
        productId: r.productId,
        unitName: r.unitName,
        factor: 1,
        qty: 0,
        baseQty: 0,
        unitPrice: 0,
        lineTotal: 0,
        costPrice: currentCost(r.productId),
        systemQty: currentStock(r.productId),
        actualQty: null,
        reason: null,
      });
    },

    /**
     * Hoàn thành một dòng kiểm kho. Số đếm và lý do đọc thẳng từ dòng phiếu TRONG batch (không dùng
     * giá trị đọc trước), nên lượt quét/sửa chen vào lúc bấm hoàn thành vẫn được tính đúng.
     * Chênh lệch = thực tế − tồn HIỆN TẠI (không phải system_qty, vì lúc đếm có thể đã bán).
     * Dòng chưa đếm (actual_qty NULL) không đổi gì. Thứ tự: ghi chênh lệch vào dòng → ghi sổ kho
     * `adjust` (xóa lại nếu chênh lệch 0) → đặt tồn = thực tế.
     */
    completeCountLineStatements(r: {
      documentId: string;
      lineId: string;
      productId: string;
      movementId: string;
      now: number;
    }) {
      const lineValue = (column: "actual_qty" | "reason") =>
        sql`(SELECT l.${sql.raw(column)} FROM ${documentLines} AS l
          WHERE l.store_id = ${storeId} AND l.id = ${r.lineId})`;
      const actual = lineValue("actual_qty");
      const stock = currentStock(r.productId);
      const cost = currentCost(r.productId);
      return [
        db
          .update(documentLines)
          .set({
            qty: sql`${documentLines.actualQty} - ${stock}`,
            baseQty: sql`${documentLines.actualQty} - ${stock}`,
            costPrice: cost,
            unitPrice: cost,
            lineTotal: sql`CAST(ROUND((${documentLines.actualQty} - ${stock}) * ${cost} / 1000.0) AS INTEGER)`,
          })
          .where(
            and(
              eq(documentLines.storeId, storeId),
              eq(documentLines.id, r.lineId),
              isNotNull(documentLines.actualQty),
            ),
          ),
        db.insert(stockMovements).values({
          id: r.movementId,
          storeId,
          productId: r.productId,
          documentId: r.documentId,
          type: "adjust",
          qtyChange: sql<number>`COALESCE(${actual} - ${stock}, 0)`,
          stockAfter: sql<number>`COALESCE(${actual}, ${stock})`,
          unitCost: cost,
          note: lineValue("reason"),
          createdAt: r.now,
        }),
        // Khớp hoặc chưa đếm thì không để lại dòng sổ kho 0.
        db
          .delete(stockMovements)
          .where(
            and(
              eq(stockMovements.storeId, storeId),
              eq(stockMovements.id, r.movementId),
              eq(stockMovements.qtyChange, 0),
            ),
          ),
        db
          .update(products)
          .set({ stock: sql`COALESCE(${actual}, ${products.stock})`, updatedAt: r.now })
          .where(and(eq(products.storeId, storeId), eq(products.id, r.productId))),
      ] as const;
    },

    /**
     * Câu chặn: lỗi nếu còn dòng đã đếm, lệch so với tồn HIỆN TẠI mà chưa có lý do. Đặt trước các
     * câu hoàn thành dòng trong cùng batch.
     */
    guardCountReasons(documentId: string) {
      return guardNotExists(
        db,
        storeId,
        sql`SELECT 1 FROM ${documentLines} AS l
          JOIN ${products} AS p ON p.id = l.product_id AND p.store_id = ${storeId}
          WHERE l.store_id = ${storeId} AND l.document_id = ${documentId}
            AND l.actual_qty IS NOT NULL AND l.actual_qty <> p.stock
            AND (l.reason IS NULL OR trim(l.reason) = '')`,
      );
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
