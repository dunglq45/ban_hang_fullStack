// Bán hàng: docs/DATABASE.md "Bán hàng (sale)". Lõi nghiệp vụ quan trọng nhất.
import type { z } from "zod";
import { lineAmount, toBaseQty } from "../../shared/qty";
import { formatVnd } from "../../shared/money";
import type { createSaleSchema } from "../../shared/schemas/document";
import type { StoreDb } from "../db/client";
import { isConstraintError } from "../lib/db-errors";
import { isGuardError } from "../lib/guard";
import { AppError } from "../lib/errors";
import { uuidv7 } from "../lib/uuid";
import type { SaleLine } from "../repositories/stock";
import type { SessionUser } from "../types";
import { type DocumentDetail, getDocument } from "./documents";
import {
  describeShortage,
  documentTotals,
  productOrThrow,
  replayDocument,
  resolveUnit,
  shortages,
  sumByProduct,
} from "./lines";

type SaleInput = z.output<typeof createSaleSchema>;

export interface SaleResult {
  document: DocumentDetail;
  /** true: idempotencyKey đã dùng trước đó, trả lại hóa đơn cũ, không ghi gì thêm. */
  replayed: boolean;
}

async function replay(db: StoreDb, actor: SessionUser, key: string): Promise<SaleResult | null> {
  const document = await replayDocument(db, actor.role, key, "sale");
  return document ? { document, replayed: true } : null;
}

/** Sau khi batch lỗi CHECK tồn kho: chỉ ra mặt hàng thiếu. */
async function outOfStockError(db: StoreDb, required: Map<string, number>): Promise<AppError> {
  const items = await shortages(db, required);
  const first = items[0];
  return new AppError(
    "OUT_OF_STOCK",
    first ? `Không đủ hàng trong kho: ${describeShortage(first)}` : "Không đủ hàng trong kho",
    undefined,
    {
      ...(first
        ? {
            productId: first.productId,
            name: first.name,
            stock: first.stock,
            requested: first.requested,
          }
        : {}),
      items,
    },
  );
}

function debtLimitError(
  contact: { name: string; debt: number; debtLimit: number | null },
  debtAmount: number,
) {
  return new AppError(
    "DEBT_LIMIT_EXCEEDED",
    `Vượt hạn mức nợ của ${contact.name} (${formatVnd(contact.debtLimit ?? 0)})`,
    undefined,
    { debt: contact.debt, debtLimit: contact.debtLimit, debtAmount },
  );
}

export async function createSale(
  db: StoreDb,
  actor: SessionUser,
  input: SaleInput,
): Promise<SaleResult> {
  // 1. Idempotency.
  const previous = await replay(db, actor, input.idempotencyKey);
  if (previous) return previous;

  // 2. Lượt đọc duy nhất trước batch: hàng (giá vốn, đơn vị, trạng thái) để tính toán và validate.
  const productMap = await db.products.forDocument(input.lines.map((l) => l.productId));
  const documentId = uuidv7();
  const now = Date.now();
  const lines: SaleLine[] = input.lines.map((l) => {
    const p = productOrThrow(productMap, l.productId);
    if (!p.isActive) {
      throw new AppError("PRODUCT_INACTIVE", `${p.name} đã ngừng bán`, undefined, {
        productId: p.id,
        name: p.name,
      });
    }
    const unit = resolveUnit(p, l.unitName);
    // Quy tắc 4 của prompt: cho bán giá khác giá niêm yết, nhưng staff không bán dưới giá vốn.
    if (actor.role !== "owner" && l.unitPrice < p.costPrice * unit.factor) {
      throw new AppError(
        "PRICE_BELOW_COST",
        `Giá bán ${p.name} thấp hơn giá vốn. Chỉ chủ cửa hàng được bán giá này`,
        undefined,
        { productId: p.id, name: p.name },
      );
    }
    const baseQty = toBaseQty(l.qty, unit.factor);
    return {
      documentId,
      lineId: uuidv7(),
      movementId: uuidv7(),
      productId: p.id,
      unitName: unit.name,
      factor: unit.factor,
      qty: l.qty,
      baseQty,
      unitPrice: l.unitPrice,
      lineTotal: lineAmount(l.qty, l.unitPrice),
      now,
    };
  });

  // 3. Tiền.
  const { subtotal, total, paid, debtAmount } = documentTotals(
    lines.map((l) => l.lineTotal),
    input.discount,
    input.paid,
  );
  // Chiết khấu cả hóa đơn cũng không được kéo tổng xuống dưới giá vốn khi người bán là staff.
  if (actor.role !== "owner") {
    const cost = lines.reduce((sum, l) => {
      const p = productMap.get(l.productId)!;
      return sum + lineAmount(l.baseQty, p.costPrice);
    }, 0);
    if (total < cost) {
      throw new AppError(
        "PRICE_BELOW_COST",
        "Tổng hóa đơn sau chiết khấu thấp hơn giá vốn. Chỉ chủ cửa hàng được bán giá này",
      );
    }
  }

  const overrideLimit = input.force && actor.role === "owner";
  let contactId: string | null = null;
  if (input.contactId) {
    const contact = await db.contacts.findById(input.contactId);
    if (!contact || contact.type !== "customer") {
      throw new AppError("INVALID_CONTACT", "Không tìm thấy khách hàng");
    }
    if (!contact.isActive) {
      throw new AppError("INVALID_CONTACT", `${contact.name} đã ngừng giao dịch`);
    }
    contactId = contact.id;
    if (
      debtAmount > 0 &&
      contact.debtLimit !== null &&
      contact.debt + debtAmount > contact.debtLimit &&
      !overrideLimit
    ) {
      throw debtLimitError(contact, debtAmount);
    }
  }
  if (debtAmount > 0 && !contactId) {
    throw new AppError(
      "DEBT_REQUIRES_CUSTOMER",
      "Khách trả thiếu: vui lòng chọn khách hàng để ghi nợ",
    );
  }

  // 4. Một batch: bộ đếm → hóa đơn → từng dòng (dòng, trừ tồn, sổ kho) → công nợ.
  const hd = db.codes.next("HD");
  try {
    await db.batchAll([
      hd.bump,
      db.documents.insert({
        id: documentId,
        type: "sale",
        code: hd.code,
        contactId,
        status: "completed",
        subtotal,
        discount: input.discount,
        total,
        paid,
        debtAmount,
        // Ghi nợ toàn bộ thì không có tiền thu, không có phương thức thanh toán.
        paymentMethod: paid > 0 ? input.paymentMethod : null,
        note: input.note,
        idempotencyKey: input.idempotencyKey,
        createdBy: actor.id,
        createdAt: now,
        completedAt: now,
      }),
      ...lines.flatMap((l) => db.stock.saleLineStatements(l)),
      ...(debtAmount > 0 && contactId
        ? db.debts.changeStatements({
            contactId,
            amount: debtAmount,
            now,
            entryId: uuidv7(),
            documentId,
            // Kiểm tra trước chỉ để báo lỗi sớm; chốt hạn mức thật nằm trong batch.
            enforceLimit: !overrideLimit,
          })
        : []),
    ]);
  } catch (err) {
    // 5. Hai request cùng key gần như đồng thời: request sau vấp UNIQUE → trả hóa đơn đã có.
    if (isConstraintError(err, "UNIQUE", "documents.idempotency_key")) {
      const again = await replay(db, actor, input.idempotencyKey);
      if (again) return again;
    }
    if (isConstraintError(err, "CHECK", "products_stock_check")) {
      throw await outOfStockError(db, sumByProduct(lines));
    }
    // Câu chặn hạn mức nợ: có hóa đơn khác vừa ghi nợ cho cùng khách.
    if (isGuardError(err) && contactId) {
      const contact = await db.contacts.findById(contactId);
      if (contact) throw debtLimitError(contact, debtAmount);
    }
    throw err;
  }

  return { document: await getDocument(db, actor.role, documentId), replayed: false };
}
