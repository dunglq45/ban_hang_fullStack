// Thu nợ khách (phiếu thu PT) và trả nợ nhà cung cấp (phiếu chi PC): docs/DATABASE.md
// "Thu nợ / trả nợ NCC". Mỗi thao tác là MỘT batch: bộ đếm → phiếu → giảm nợ có điều kiện + câu chặn
// → sổ nợ. Hủy phiếu: đổi trạng thái có điều kiện + câu chặn → cộng lại nợ → sổ nợ.
import type { z } from "zod";
import { formatVnd } from "../../shared/money";
import type { createPaymentSchema } from "../../shared/schemas/payment";
import type { StoreDb } from "../db/client";
import type { ContactType, CounterKind, PaymentType } from "../db/schema";
import { isConstraintError } from "../lib/db-errors";
import { AppError } from "../lib/errors";
import { isGuardError } from "../lib/guard";
import { uuidv7 } from "../lib/uuid";
import type { SessionUser } from "../types";

type PaymentInput = z.output<typeof createPaymentSchema>;

const CONTACT_OF: Record<PaymentType, ContactType> = {
  receipt: "customer",
  disbursement: "supplier",
};
const CODE_KIND: Record<PaymentType, CounterKind> = { receipt: "PT", disbursement: "PC" };

/** Phiếu đầy đủ để hiển thị và in: đối tác (nợ hiện tại), người lập, dư nợ ngay sau phiếu, cửa hàng. */
export async function getPayment(db: StoreDb, id: string) {
  const row = await db.payments.detail(id);
  if (!row) throw new AppError("NOT_FOUND", "Không tìm thấy phiếu thu / chi");
  const store = await db.store.get();
  const {
    contactCode,
    contactName,
    contactPhone,
    contactAddress,
    contactDebt,
    createdById,
    createdByName,
    ...payment
  } = row;
  return {
    ...payment,
    contact: {
      id: payment.contactId,
      code: contactCode ?? "",
      name: contactName ?? "",
      phone: contactPhone,
      address: contactAddress,
      debt: contactDebt ?? 0,
    },
    createdBy: { id: createdById, name: createdByName ?? "" },
    store: store
      ? {
          name: store.name,
          phone: store.phone,
          address: store.address,
          receiptFooter: store.receiptFooter,
        }
      : null,
  };
}

export type PaymentDetail = Awaited<ReturnType<typeof getPayment>>;

export interface PaymentResult {
  payment: PaymentDetail;
  /** true: idempotencyKey đã dùng trước đó, trả lại phiếu cũ, không ghi gì thêm. */
  replayed: boolean;
}

async function replay(db: StoreDb, key: string, type: PaymentType): Promise<PaymentResult | null> {
  const existing = await db.payments.findByIdempotencyKey(key);
  if (existing) {
    if (existing.type !== type) {
      throw new AppError("IDEMPOTENCY_CONFLICT", "Mã chống gửi trùng đã dùng cho phiếu khác");
    }
    return { payment: await getPayment(db, existing.id), replayed: true };
  }
  // Khóa của client là duy nhất cho mọi thao tác ghi: trùng với một chứng từ là lỗi phía client.
  if (await db.documents.findByIdempotencyKey(key)) {
    throw new AppError("IDEMPOTENCY_CONFLICT", "Mã chống gửi trùng đã dùng cho chứng từ khác");
  }
  return null;
}

function exceedsDebtError(name: string, debt: number, amount: number, type: PaymentType) {
  const verb = type === "receipt" ? "thu" : "trả";
  return new AppError(
    "AMOUNT_EXCEEDS_DEBT",
    debt > 0
      ? `Số tiền ${verb} (${formatVnd(amount)}) lớn hơn số nợ hiện tại của ${name} (${formatVnd(debt)})`
      : `${name} hiện không còn nợ`,
    undefined,
    { debt, amount },
  );
}

export async function createPayment(
  db: StoreDb,
  actor: SessionUser,
  input: PaymentInput,
): Promise<PaymentResult> {
  if (input.type === "disbursement" && actor.role !== "owner") {
    throw new AppError("FORBIDDEN", "Chỉ chủ cửa hàng được lập phiếu chi trả nợ nhà cung cấp");
  }
  const previous = await replay(db, input.idempotencyKey, input.type);
  if (previous) return previous;

  const contact = await db.contacts.findById(input.contactId);
  if (!contact || contact.type !== CONTACT_OF[input.type]) {
    throw new AppError(
      "INVALID_CONTACT",
      input.type === "receipt" ? "Không tìm thấy khách hàng" : "Không tìm thấy nhà cung cấp",
    );
  }
  // Báo lỗi sớm bằng số nợ vừa đọc; chốt thật nằm trong batch (UPDATE có điều kiện + câu chặn).
  if (input.amount > contact.debt) {
    throw exceedsDebtError(contact.name, contact.debt, input.amount, input.type);
  }

  const id = uuidv7();
  const now = Date.now();
  const next = db.codes.next(CODE_KIND[input.type]);
  const method = input.method === "cash" ? "tiền mặt" : "chuyển khoản";
  try {
    await db.batchAll([
      next.bump,
      db.payments.insert({
        id,
        type: input.type,
        code: next.code,
        contactId: contact.id,
        amount: input.amount,
        method: input.method,
        note: input.note,
        status: "completed",
        idempotencyKey: input.idempotencyKey,
        createdBy: actor.id,
        createdAt: now,
      }),
      ...db.debts.changeStatements({
        contactId: contact.id,
        amount: -input.amount,
        now,
        entryId: uuidv7(),
        paymentId: id,
        note: input.type === "receipt" ? `Thu nợ ${method}` : `Trả nợ ${method}`,
        requireDebt: true,
      }),
    ]);
  } catch (err) {
    if (isConstraintError(err, "UNIQUE", "payments.idempotency_key")) {
      const again = await replay(db, input.idempotencyKey, input.type);
      if (again) return again;
    }
    if (isGuardError(err)) {
      // Nợ vừa giảm bởi một phiếu khác (hoặc hủy chứng từ) giữa lúc đọc và ghi.
      const fresh = await db.contacts.findById(contact.id);
      throw exceedsDebtError(contact.name, fresh?.debt ?? 0, input.amount, input.type);
    }
    throw err;
  }
  return { payment: await getPayment(db, id), replayed: false };
}

/** Hủy phiếu thu/chi (owner): cộng lại nợ bằng đúng số tiền của phiếu, ghi sổ nợ dòng dương. */
export async function cancelPayment(db: StoreDb, id: string) {
  const payment = await db.payments.findById(id);
  if (!payment) throw new AppError("NOT_FOUND", "Không tìm thấy phiếu thu / chi");
  if (payment.status === "cancelled") {
    throw new AppError("ALREADY_CANCELLED", `Phiếu ${payment.code} đã bị hủy trước đó`);
  }
  const now = Date.now();
  try {
    await db.batchAll([
      db.payments.markCancelled(id, now),
      db.guardChanges(1),
      ...db.debts.changeStatements({
        contactId: payment.contactId,
        amount: payment.amount,
        now,
        entryId: uuidv7(),
        paymentId: id,
        note: `Hủy ${payment.code}`,
      }),
    ]);
  } catch (err) {
    if (isGuardError(err)) {
      throw new AppError("ALREADY_CANCELLED", `Phiếu ${payment.code} đã bị hủy trước đó`);
    }
    throw err;
  }
  return getPayment(db, id);
}
