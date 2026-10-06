// Kiểm kho: docs/DATABASE.md "Kiểm kho (stock_count)".
import type { z } from "zod";
import { lineAmount } from "../../shared/qty";
import {
  type createStockCountSchema,
  MAX_DOCUMENT_LINES,
  type updateStockCountLinesSchema,
} from "../../shared/schemas/document";
import type { StoreDb } from "../db/client";
import type { UserRole } from "../db/schema";
import { AppError } from "../lib/errors";
import { isGuardError } from "../lib/guard";
import { uuidv7 } from "../lib/uuid";
import type { SessionUser } from "../types";

async function countOrThrow(db: StoreDb, id: string) {
  const doc = await db.documents.findById(id);
  if (!doc || doc.type !== "stock_count") {
    throw new AppError("NOT_FOUND", "Không tìm thấy phiếu kiểm kho");
  }
  return doc;
}

function assertDraft(doc: { code: string; status: string }) {
  if (doc.status !== "draft") {
    throw new AppError(
      "INVALID_STATUS",
      doc.status === "completed"
        ? `Phiếu ${doc.code} đã hoàn thành, không sửa được nữa`
        : `Phiếu ${doc.code} đã bị hủy`,
    );
  }
}

/**
 * Phiếu kiểm kho kèm từng dòng: tồn lúc tạo phiếu (systemQty), số đếm, tồn hiện tại, chênh lệch,
 * cờ \`stockChanged\` (tồn đã đổi kể từ lúc tạo phiếu vì có bán/nhập). Giá trị lệch chỉ owner thấy.
 */
export async function getStockCount(db: StoreDb, role: UserRole, id: string) {
  const header = await db.documents.header(id);
  if (!header || header.type !== "stock_count") {
    throw new AppError("NOT_FOUND", "Không tìm thấy phiếu kiểm kho");
  }
  const rows = await db.documents.countLines(id);
  const draft = header.status === "draft";
  const lines = rows.map((r) => {
    // Phiếu nháp: chênh lệch dự kiến theo tồn hiện tại; đã hoàn thành: chênh lệch đã ghi.
    const diff = r.actualQty === null ? null : draft ? r.actualQty - r.currentStock : r.qty;
    const value = diff === null ? null : draft ? lineAmount(diff, r.currentCost) : r.lineTotal;
    const line = {
      id: r.id,
      productId: r.productId,
      productCode: r.productCode,
      productName: r.productName,
      baseUnit: r.baseUnit,
      categoryId: r.categoryId,
      systemQty: r.systemQty ?? 0,
      currentStock: r.currentStock,
      stockChanged: draft && r.currentStock !== r.systemQty,
      actualQty: r.actualQty,
      diff,
      reason: r.reason,
    };
    return role === "owner" ? { ...line, diffValue: value } : line;
  });
  const counted = lines.filter((l) => l.diff !== null);
  const sumValue = (sign: 1 | -1) =>
    role === "owner"
      ? counted
          .filter((l) => (l.diff ?? 0) * sign > 0)
          .reduce((s, l) => s + ("diffValue" in l ? (l.diffValue ?? 0) : 0), 0)
      : undefined;
  return {
    id: header.id,
    code: header.code,
    status: header.status,
    note: header.note,
    createdAt: header.createdAt,
    completedAt: header.completedAt,
    cancelledAt: header.cancelledAt,
    createdBy: { id: header.createdById, name: header.createdByName ?? "" },
    summary: {
      total: lines.length,
      counted: counted.length,
      uncounted: lines.length - counted.length,
      matched: counted.filter((l) => l.diff === 0).length,
      increased: counted.filter((l) => (l.diff ?? 0) > 0).length,
      decreased: counted.filter((l) => (l.diff ?? 0) < 0).length,
      increaseValue: sumValue(1),
      decreaseValue: sumValue(-1),
    },
    lines,
  };
}

/** Tạo phiếu nháp theo nhóm hàng hoặc danh sách hàng (mặc định: mọi hàng đang bán), tối đa 200. */
export async function createStockCount(
  db: StoreDb,
  actor: SessionUser,
  input: z.output<typeof createStockCountSchema>,
) {
  let ids: string[];
  if (input.productIds && input.productIds.length > 0) {
    ids = [...new Set(input.productIds)];
  } else {
    if (input.categoryId && !(await db.categories.findById(input.categoryId))) {
      throw new AppError("INVALID_CATEGORY", "Nhóm hàng không tồn tại");
    }
    ids = await db.products.activeIds(input.categoryId);
  }
  if (ids.length === 0) {
    throw new AppError("BAD_REQUEST", "Không có mặt hàng nào để kiểm");
  }
  if (ids.length > MAX_DOCUMENT_LINES) {
    throw new AppError(
      "TOO_MANY_LINES",
      `Mỗi phiếu kiểm tối đa ${MAX_DOCUMENT_LINES} mặt hàng (đang chọn ${ids.length}). Hãy kiểm theo từng nhóm`,
    );
  }
  const productMap = await db.products.forDocument(ids);
  const missing = ids.find((id) => !productMap.has(id));
  if (missing) {
    throw new AppError("NOT_FOUND", "Không tìm thấy hàng hóa", undefined, { productId: missing });
  }

  const documentId = uuidv7();
  const now = Date.now();
  const kk = db.codes.next("KK");
  await db.batchAll([
    kk.bump,
    db.documents.insert({
      id: documentId,
      type: "stock_count",
      code: kk.code,
      status: "draft",
      note: input.note,
      createdBy: actor.id,
      createdAt: now,
    }),
    ...ids.map((productId) =>
      db.stock.insertCountLine({
        documentId,
        lineId: uuidv7(),
        productId,
        unitName: productMap.get(productId)!.baseUnit,
      }),
    ),
  ]);
  return getStockCount(db, actor.role, documentId);
}

/**
 * Ghi số đếm hàng loạt. Mỗi câu UPDATE có điều kiện "phiếu còn nháp" và một câu chặn ngay sau,
 * nên nếu phiếu vừa được hoàn thành thì cả lượt ghi bị hủy (không ghi nửa chừng).
 */
export async function updateStockCountLines(
  db: StoreDb,
  actor: SessionUser,
  id: string,
  input: z.output<typeof updateStockCountLinesSchema>,
) {
  const doc = await countOrThrow(db, id);
  assertDraft(doc);
  const known = new Set((await db.documents.countLines(id)).map((l) => l.id));
  const unknown = input.lines.find((l) => !known.has(l.lineId));
  if (unknown) {
    throw new AppError("NOT_FOUND", "Dòng không thuộc phiếu kiểm này", undefined, {
      lineId: unknown.lineId,
    });
  }
  try {
    await db.batchAll(
      input.lines.flatMap((l) => [
        db.documents.setCountLine(id, l.lineId, l.actualQty, l.reason),
        db.guardChanges(1),
      ]),
    );
  } catch (err) {
    if (isGuardError(err)) throw await explainGuard(db, id);
    throw err;
  }
  return getStockCount(db, actor.role, id);
}

/** Quét mã vạch: +1 đơn vị cơ bản, hoặc +factor nếu là mã vạch của đơn vị quy đổi (thùng). */
export async function scanStockCount(db: StoreDb, id: string, barcode: string) {
  const doc = await countOrThrow(db, id);
  assertDraft(doc);
  const found = await db.products.findByBarcode(barcode);
  if (!found) throw new AppError("NOT_FOUND", "Không tìm thấy hàng có mã vạch này");
  const factor = found.unit?.factor ?? 1;
  const added = 1000 * factor;
  const [row] = await db.documents.scanCount(id, found.product.id, added);
  if (!row) {
    const now = await countOrThrow(db, id);
    assertDraft(now);
    throw new AppError(
      "PRODUCT_NOT_IN_COUNT",
      `${found.product.name} không có trong phiếu kiểm này`,
      undefined,
      { productId: found.product.id },
    );
  }
  return {
    lineId: row.id,
    productId: found.product.id,
    productName: found.product.name,
    baseUnit: found.product.baseUnit,
    unitName: found.unit?.name ?? found.product.baseUnit,
    added,
    actualQty: row.actualQty ?? added,
  };
}

/**
 * Hoàn thành: mỗi dòng đã đếm → tồn = số đếm, chênh lệch tính theo tồn HIỆN TẠI. Dòng lệch phải
 * có lý do. Trả kèm cảnh báo những hàng mà tồn đã thay đổi kể từ lúc tạo phiếu.
 */
/** Dòng đã đếm, lệch so với tồn hiện tại mà chưa có lý do. */
function missingReasons(rows: Awaited<ReturnType<StoreDb["documents"]["countLines"]>>) {
  return rows.filter(
    (r) => r.actualQty !== null && r.actualQty !== r.currentStock && !r.reason?.trim(),
  );
}

function reasonRequired(rows: ReturnType<typeof missingReasons>) {
  return new AppError(
    "REASON_REQUIRED",
    `Vui lòng chọn lý do lệch cho ${rows.length} mặt hàng`,
    undefined,
    { lines: rows.map((r) => ({ lineId: r.id, productId: r.productId, name: r.productName })) },
  );
}

/**
 * Batch vấp câu chặn: đọc lại để báo đúng lý do (phiếu vừa được hoàn thành/hủy, hoặc vừa có dòng
 * lệch mới chưa có lý do).
 */
async function explainGuard(db: StoreDb, id: string): Promise<AppError> {
  const doc = await countOrThrow(db, id);
  try {
    assertDraft(doc);
  } catch (e) {
    return e as AppError;
  }
  const missing = missingReasons(await db.documents.countLines(id));
  if (missing.length > 0) return reasonRequired(missing);
  return new AppError("BAD_REQUEST", "Phiếu kiểm vừa thay đổi, vui lòng tải lại rồi thử lại");
}

/**
 * Hoàn thành: mỗi dòng đã đếm → tồn = số đếm, chênh lệch tính theo tồn HIỆN TẠI. Mọi giá trị
 * (số đếm, lý do, tồn) đọc trong batch; dòng lệch phải có lý do (câu chặn trong batch). Trả kèm
 * cảnh báo những hàng đã đếm mà tồn đã thay đổi kể từ lúc tạo phiếu.
 */
export async function completeStockCount(db: StoreDb, actor: SessionUser, id: string) {
  const doc = await countOrThrow(db, id);
  assertDraft(doc);
  const rows = await db.documents.countLines(id);
  // Kiểm tra sớm để báo lỗi rõ ràng; chốt thật nằm trong batch (guardCountReasons).
  const missing = missingReasons(rows);
  if (missing.length > 0) throw reasonRequired(missing);
  const warnings = rows
    .filter((r) => r.actualQty !== null && r.systemQty !== r.currentStock)
    .map((r) => ({
      productId: r.productId,
      name: r.productName,
      systemQty: r.systemQty ?? 0,
      currentStock: r.currentStock,
    }));

  const now = Date.now();
  try {
    await db.batchAll([
      db.documents.markCompleted(id, now),
      db.guardChanges(1),
      db.stock.guardCountReasons(id),
      ...rows.flatMap((r) =>
        db.stock.completeCountLineStatements({
          documentId: id,
          lineId: r.id,
          productId: r.productId,
          movementId: uuidv7(),
          now,
        }),
      ),
    ]);
  } catch (err) {
    if (isGuardError(err)) throw await explainGuard(db, id);
    throw err;
  }
  return { document: await getStockCount(db, actor.role, id), warnings };
}
