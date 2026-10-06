// Sổ nợ: sổ chi tiết công nợ của từng đối tác và số liệu tổng (màn hình Sổ nợ).
import { DAY_MS, vnMonthStart, vnNextMonthStart } from "../../shared/period";
import type { StoreDb } from "../db/client";
import { getContact } from "./contacts";

/** Khách nợ lâu hơn số ngày này là "quá hạn" (thẻ "Nợ quá 30 ngày"). */
export const OVERDUE_DAYS = 30;

type EntryRow = Awaited<ReturnType<StoreDb["debts"]["entries"]>>["items"][number];

const METHOD_TEXT = { cash: "tiền mặt", transfer: "chuyển khoản" } as const;

/** Diễn giải đời thường cho một dòng sổ nợ, suy từ chứng từ/phiếu gốc và chiều tăng/giảm. */
function describe(e: EntryRow): string {
  const increase = e.amount > 0;
  if (e.documentType) {
    switch (e.documentType) {
      case "sale":
        if (!increase) return `Hủy hóa đơn ${e.documentCode ?? ""}`.trim();
        return (e.documentPaid ?? 0) > 0 ? "Bán hàng, trả thiếu" : "Bán hàng ghi nợ";
      case "purchase":
        if (!increase) return `Hủy phiếu nhập ${e.documentCode ?? ""}`.trim();
        return (e.documentPaid ?? 0) > 0 ? "Nhập hàng, trả thiếu" : "Nhập hàng ghi nợ";
      default:
        return e.note ?? "Điều chỉnh công nợ";
    }
  }
  if (e.paymentType) {
    const method = e.paymentMethod ? ` ${METHOD_TEXT[e.paymentMethod]}` : "";
    if (e.paymentType === "receipt") {
      return increase ? `Hủy phiếu thu ${e.paymentCode ?? ""}`.trim() : `Thu nợ${method}`;
    }
    return increase ? `Hủy phiếu chi ${e.paymentCode ?? ""}`.trim() : `Trả nợ${method}`;
  }
  return e.note ?? "Điều chỉnh công nợ";
}

/** Sổ chi tiết công nợ (mới nhất trước): phát sinh nợ, đã trả, dư nợ sau mỗi dòng. */
export async function listDebtEntries(
  db: StoreDb,
  contactId: string,
  page: number,
  pageSize: number,
) {
  const contact = await getContact(db, contactId);
  const result = await db.debts.entries(contact.id, page, pageSize);
  return {
    items: result.items.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      ref: e.documentId
        ? {
            kind: "document" as const,
            id: e.documentId,
            code: e.documentCode,
            type: e.documentType,
          }
        : e.paymentId
          ? { kind: "payment" as const, id: e.paymentId, code: e.paymentCode, type: e.paymentType }
          : null,
      description: describe(e),
      note: e.note,
      amount: e.amount,
      /** Phát sinh nợ (tăng) */
      increase: e.amount > 0 ? e.amount : 0,
      /** Đã trả / giảm nợ */
      decrease: e.amount < 0 ? -e.amount : 0,
      balanceAfter: e.balanceAfter,
    })),
    total: result.total,
    page,
    pageSize,
  };
}

/** Chi tiết đối tác kèm lần thu/trả gần nhất (thẻ "Trả gần nhất" ở Sổ nợ). */
export async function getContactDetail(db: StoreDb, id: string) {
  const contact = await getContact(db, id);
  const lastPayment = await db.payments.lastFor(contact.id);
  return { ...contact, lastPayment: lastPayment ?? null };
}

/**
 * Thẻ tổng ở Sổ nợ: phải thu (tổng, số khách), nợ quá 30 ngày (theo ngày bắt đầu nợ), đã thu tháng
 * này theo giờ VN (tổng, số lần), phải trả NCC (tổng, số NCC).
 */
export async function debtSummary(db: StoreDb, now = Date.now()) {
  const [receivable, overdue, collected, payable, paid] = await Promise.all([
    db.debts.outstanding("customer"),
    db.debts.outstanding("customer", now - OVERDUE_DAYS * DAY_MS),
    db.payments.totals("receipt", vnMonthStart(now), vnNextMonthStart(now)),
    db.debts.outstanding("supplier"),
    db.payments.totals("disbursement", vnMonthStart(now), vnNextMonthStart(now)),
  ]);
  return {
    receivable: { amount: receivable.amount, customers: receivable.count },
    overdue: { amount: overdue.amount, customers: overdue.count, days: OVERDUE_DAYS },
    collectedThisMonth: { amount: collected.amount, count: collected.count },
    payable: { amount: payable.amount, suppliers: payable.count },
    paidThisMonth: { amount: paid.amount, count: paid.count },
  };
}
