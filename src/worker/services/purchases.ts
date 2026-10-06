// Nhập hàng: docs/DATABASE.md "Nhập hàng (purchase)" và "Hủy chứng từ".
import type { z } from "zod";
import { lineAmount, toBaseQty } from "../../shared/qty";
import type { createPurchaseSchema, updatePurchaseSchema } from "../../shared/schemas/document";
import type { StoreDb } from "../db/client";
import { isConstraintError } from "../lib/db-errors";
import { AppError } from "../lib/errors";
import { isGuardError } from "../lib/guard";
import { uuidv7 } from "../lib/uuid";
import type { SessionUser } from "../types";
import { type DocumentDetail, getDocument } from "./documents";
import {
  allocateDiscount,
  describeShortage,
  documentTotals,
  productOrThrow,
  replayDocument,
  resolveUnit,
  shortages,
  sumByProduct,
} from "./lines";

type PurchaseBody = z.output<typeof updatePurchaseSchema>;

interface PurchaseLine {
  lineId: string;
  productId: string;
  unitName: string;
  factor: number;
  qty: number;
  baseQty: number;
  unitPrice: number;
  lineTotal: number;
  /** giá nhập / đơn vị cơ bản sau khi phân bổ chiết khấu; lưu ở document_lines.cost_price */
  inUnitCost: number;
}

/** Tính toán và validate phiếu nhập (lượt đọc duy nhất trước batch). */
async function preparePurchase(db: StoreDb, input: PurchaseBody) {
  const productMap = await db.products.forDocument(input.lines.map((l) => l.productId));
  const raw = input.lines.map((l) => {
    const p = productOrThrow(productMap, l.productId);
    const unit = resolveUnit(p, l.unitName);
    return {
      productId: p.id,
      unitName: unit.name,
      factor: unit.factor,
      qty: l.qty,
      baseQty: toBaseQty(l.qty, unit.factor),
      unitPrice: l.unitPrice,
      lineTotal: lineAmount(l.qty, l.unitPrice),
    };
  });
  const totals = documentTotals(
    raw.map((l) => l.lineTotal),
    input.discount,
    input.paid,
  );
  // Chiết khấu phiếu chia theo tỷ lệ thành tiền dòng → giá nhập thực / đơn vị cơ bản.
  const shares = allocateDiscount(
    raw.map((l) => l.lineTotal),
    input.discount,
  );
  const lines: PurchaseLine[] = raw.map((l, i) => ({
    ...l,
    lineId: uuidv7(),
    inUnitCost: Math.round(((l.lineTotal - shares[i]!) * 1000) / l.baseQty),
  }));

  let contactId: string | null = null;
  if (input.contactId) {
    const contact = await db.contacts.findById(input.contactId);
    if (!contact || contact.type !== "supplier") {
      throw new AppError("INVALID_CONTACT", "Không tìm thấy nhà cung cấp");
    }
    if (!contact.isActive) {
      throw new AppError("INVALID_CONTACT", `${contact.name} đã ngừng giao dịch`);
    }
    contactId = contact.id;
  }
  if (totals.debtAmount > 0 && !contactId) {
    throw new AppError(
      "DEBT_REQUIRES_SUPPLIER",
      "Còn nợ nhà cung cấp: vui lòng chọn nhà cung cấp để ghi nợ",
    );
  }
  return {
    ...totals,
    discount: input.discount,
    contactId,
    paymentMethod: totals.paid > 0 ? input.paymentMethod : null,
    note: input.note,
    lines,
  };
}

function insertLines(db: StoreDb, documentId: string, lines: PurchaseLine[]) {
  return lines.map((l) =>
    db.documents.insertLine({
      id: l.lineId,
      documentId,
      productId: l.productId,
      unitName: l.unitName,
      factor: l.factor,
      qty: l.qty,
      baseQty: l.baseQty,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      costPrice: l.inUnitCost,
    }),
  );
}

/** Nhập kho + công nợ NCC của một phiếu (dùng khi tạo completed và khi hoàn thành phiếu nháp). */
function applyStatements(
  db: StoreDb,
  documentId: string,
  lines: { productId: string; baseQty: number; inUnitCost: number }[],
  debt: { contactId: string | null; amount: number },
  now: number,
) {
  return [
    ...lines.flatMap((l) =>
      db.stock.applyPurchaseStatements({
        documentId,
        productId: l.productId,
        baseQty: l.baseQty,
        inUnitCost: l.inUnitCost,
        movementId: uuidv7(),
        now,
      }),
    ),
    ...(debt.amount > 0 && debt.contactId
      ? db.debts.changeStatements({
          contactId: debt.contactId,
          amount: debt.amount,
          now,
          entryId: uuidv7(),
          documentId,
        })
      : []),
  ];
}

async function purchaseOrThrow(db: StoreDb, id: string) {
  const doc = await db.documents.findById(id);
  if (!doc || doc.type !== "purchase") throw new AppError("NOT_FOUND", "Không tìm thấy phiếu nhập");
  return doc;
}

export interface PurchaseResult {
  document: DocumentDetail;
  replayed: boolean;
}

/** Tạo phiếu nhập: nháp (chỉ lưu phiếu) hoặc hoàn thành (nhập kho, giá vốn, nợ NCC) trong MỘT batch. */
export async function createPurchase(
  db: StoreDb,
  actor: SessionUser,
  input: z.output<typeof createPurchaseSchema>,
): Promise<PurchaseResult> {
  const previous = await replayDocument(db, actor.role, input.idempotencyKey, "purchase");
  if (previous) return { document: previous, replayed: true };

  const p = await preparePurchase(db, input);
  const documentId = uuidv7();
  const now = Date.now();
  const completed = input.status === "completed";
  const pn = db.codes.next("PN");
  try {
    await db.batchAll([
      pn.bump,
      db.documents.insert({
        id: documentId,
        type: "purchase",
        code: pn.code,
        contactId: p.contactId,
        status: input.status,
        subtotal: p.subtotal,
        discount: p.discount,
        total: p.total,
        paid: p.paid,
        debtAmount: p.debtAmount,
        paymentMethod: p.paymentMethod,
        note: p.note,
        idempotencyKey: input.idempotencyKey,
        createdBy: actor.id,
        createdAt: now,
        completedAt: completed ? now : null,
      }),
      ...insertLines(db, documentId, p.lines),
      ...(completed
        ? applyStatements(
            db,
            documentId,
            p.lines,
            { contactId: p.contactId, amount: p.debtAmount },
            now,
          )
        : []),
    ]);
  } catch (err) {
    if (isConstraintError(err, "UNIQUE", "documents.idempotency_key")) {
      const again = await replayDocument(db, actor.role, input.idempotencyKey, "purchase");
      if (again) return { document: again, replayed: true };
    }
    throw err;
  }
  return { document: await getDocument(db, actor.role, documentId), replayed: false };
}

/** Sửa phiếu nháp: thay đầu phiếu và toàn bộ dòng. Phiếu đã hoàn thành/hủy thì không sửa được. */
export async function updatePurchase(
  db: StoreDb,
  actor: SessionUser,
  id: string,
  input: PurchaseBody,
) {
  const doc = await purchaseOrThrow(db, id);
  if (doc.status !== "draft") {
    throw new AppError("INVALID_STATUS", "Chỉ sửa được phiếu nhập nháp");
  }
  const p = await preparePurchase(db, input);
  try {
    await db.batchAll([
      db.documents.updateDraft(id, {
        contactId: p.contactId,
        subtotal: p.subtotal,
        discount: p.discount,
        total: p.total,
        paid: p.paid,
        debtAmount: p.debtAmount,
        paymentMethod: p.paymentMethod,
        note: p.note,
      }),
      db.guardChanges(1),
      db.documents.deleteLines(id),
      ...insertLines(db, id, p.lines),
    ]);
  } catch (err) {
    if (isGuardError(err)) throw new AppError("INVALID_STATUS", "Chỉ sửa được phiếu nhập nháp");
    throw err;
  }
  return getDocument(db, actor.role, id);
}

/** Hoàn thành phiếu nháp: nhập kho theo các dòng đã lưu. Câu chặn chống hoàn thành hai lần. */
export async function completePurchase(db: StoreDb, actor: SessionUser, id: string) {
  const doc = await purchaseOrThrow(db, id);
  if (doc.status !== "draft") {
    throw new AppError(
      "INVALID_STATUS",
      doc.status === "completed"
        ? `Phiếu ${doc.code} đã hoàn thành`
        : `Phiếu ${doc.code} đã bị hủy`,
    );
  }
  if (doc.debtAmount > 0 && doc.contactId) {
    const contact = await db.contacts.findById(doc.contactId);
    if (!contact || !contact.isActive) {
      throw new AppError("INVALID_CONTACT", "Nhà cung cấp của phiếu không còn giao dịch");
    }
  }
  const lines = await db.documents.lines(id);
  const now = Date.now();
  try {
    await db.batchAll([
      // Kèm điều kiện "dòng đã đọc vẫn còn": phiếu vừa bị sửa (PUT thay toàn bộ dòng) thì không
      // nhập kho theo dữ liệu cũ.
      db.documents.markCompleted(id, now, lines[0]?.id),
      db.guardChanges(1),
      ...applyStatements(
        db,
        id,
        lines.map((l) => ({ productId: l.productId, baseQty: l.baseQty, inUnitCost: l.costPrice })),
        { contactId: doc.contactId, amount: doc.debtAmount },
        now,
      ),
    ]);
  } catch (err) {
    if (isGuardError(err)) {
      const now = await purchaseOrThrow(db, id);
      if (now.status !== "draft") {
        throw new AppError("INVALID_STATUS", `Phiếu ${doc.code} đã hoàn thành hoặc đã bị hủy`);
      }
      throw new AppError("BAD_REQUEST", "Phiếu nhập vừa được sửa, vui lòng tải lại rồi thử lại");
    }
    throw err;
  }
  return getDocument(db, actor.role, id);
}

/**
 * Hủy phiếu nhập. Nháp: chỉ đổi trạng thái. Đã hoàn thành: trừ lại tồn, tính ngược giá vốn,
 * trừ nợ NCC. Hàng đã bán (tồn không đủ để trừ, không cho bán âm) → CANNOT_CANCEL_STOCK_USED.
 */
export async function cancelPurchase(
  db: StoreDb,
  actor: SessionUser,
  doc: { id: string; code: string; status: string; contactId: string | null; debtAmount: number },
) {
  const now = Date.now();
  if (doc.status === "draft") {
    try {
      await db.batchAll([
        db.documents.markCancelled(doc.id, actor.id, now, "draft"),
        db.guardChanges(1),
      ]);
    } catch (err) {
      if (isGuardError(err)) {
        throw new AppError("INVALID_STATUS", `Phiếu ${doc.code} đã hoàn thành hoặc đã bị hủy`);
      }
      throw err;
    }
    return;
  }

  const lines = await db.documents.lines(doc.id);
  const note = `Hủy ${doc.code}`;
  try {
    await db.batchAll([
      db.documents.markCancelled(doc.id, actor.id, now),
      db.guardChanges(1),
      ...lines.flatMap((l) =>
        db.stock.reversePurchaseStatements({
          documentId: doc.id,
          productId: l.productId,
          baseQty: l.baseQty,
          inUnitCost: l.costPrice,
          movementId: uuidv7(),
          note,
          now,
        }),
      ),
      ...(doc.debtAmount > 0 && doc.contactId
        ? db.debts.changeStatements({
            contactId: doc.contactId,
            amount: -doc.debtAmount,
            now,
            entryId: uuidv7(),
            documentId: doc.id,
            note,
          })
        : []),
    ]);
  } catch (err) {
    if (isGuardError(err)) {
      throw new AppError("ALREADY_CANCELLED", `Chứng từ ${doc.code} đã bị hủy trước đó`);
    }
    if (isConstraintError(err, "CHECK", "products_stock_check")) {
      const items = await shortages(db, sumByProduct(lines));
      throw new AppError(
        "CANNOT_CANCEL_STOCK_USED",
        items[0]
          ? `Không hủy được: hàng của phiếu đã bán bớt (${items.map(describeShortage).join("; ")})`
          : "Không hủy được: hàng của phiếu đã bán bớt",
        undefined,
        { items },
      );
    }
    throw err;
  }
}
