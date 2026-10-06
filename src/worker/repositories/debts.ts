// Sổ công nợ: mọi thay đổi contacts.debt đi kèm một dòng debt_entries (chỉ INSERT), trong cùng batch.
import { and, count, desc, eq, gt, lte, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { type ContactType, contacts, debtEntries, documents, payments } from "../db/schema";
import { guardChanges } from "../lib/guard";

export interface DebtChange {
  contactId: string;
  /** + tăng nợ / − giảm nợ (VND) */
  amount: number;
  now: number;
  entryId: string;
  documentId?: string | null;
  paymentId?: string | null;
  note?: string | null;
  /**
   * Chặn vượt hạn mức NGAY TRONG batch (không dựa vào số nợ đọc trước): UPDATE chỉ chạy khi
   * debt_limit IS NULL hoặc debt + amount <= debt_limit, kèm câu chặn ngay sau. Hai hóa đơn ghi nợ
   * song song cho cùng khách vì thế không cùng lọt qua hạn mức.
   */
  enforceLimit?: boolean;
  /**
   * Thu/trả nợ: chỉ giảm khi nợ hiện tại còn ít nhất bằng số tiền giảm (debt + amount >= 0), kèm câu
   * chặn ngay sau. Hai phiếu thu song song vì thế không làm nợ âm.
   */
  requireDebt?: boolean;
}

export function debtsRepository(db: Database, storeId: string) {
  return {
    /**
     * 2 câu lệnh (3 nếu enforceLimit): cộng nợ (debt_since bắt đầu khi nợ chuyển từ ≤ 0 sang > 0, về NULL khi hết nợ;
     * mọi biểu thức trong SET dùng giá trị CŨ của debt) rồi ghi sổ với balance_after là nợ mới.
     */
    changeStatements(c: DebtChange) {
      const withinLimit = c.enforceLimit
        ? sql`(${contacts.debtLimit} IS NULL OR ${contacts.debt} + ${c.amount} <= ${contacts.debtLimit})`
        : undefined;
      const covered = c.requireDebt ? sql`${contacts.debt} + ${c.amount} >= 0` : undefined;
      const guarded = c.enforceLimit || c.requireDebt;
      return [
        db
          .update(contacts)
          .set({
            debt: sql`${contacts.debt} + ${c.amount}`,
            debtSince: sql`CASE WHEN ${contacts.debt} + ${c.amount} > 0
              THEN COALESCE(${contacts.debtSince}, ${c.now}) ELSE NULL END`,
            updatedAt: c.now,
          })
          .where(and(eq(contacts.storeId, storeId), eq(contacts.id, c.contactId), withinLimit, covered)),
        ...(guarded ? [guardChanges(db, storeId, 1)] : []),
        db.insert(debtEntries).values({
          id: c.entryId,
          storeId,
          contactId: c.contactId,
          documentId: c.documentId ?? null,
          paymentId: c.paymentId ?? null,
          amount: c.amount,
          balanceAfter: sql<number>`(SELECT c.debt FROM ${contacts} AS c
            WHERE c.store_id = ${storeId} AND c.id = ${c.contactId})`,
          note: c.note ?? null,
          createdAt: c.now,
        }),
      ];
    },

    /** Sổ chi tiết công nợ của một đối tác, mới nhất trước, kèm mã chứng từ hoặc mã phiếu. */
    async entries(contactId: string, page: number, pageSize: number) {
      const where = and(eq(debtEntries.storeId, storeId), eq(debtEntries.contactId, contactId));
      const [items, totalRow] = await Promise.all([
        db
          .select({
            id: debtEntries.id,
            amount: debtEntries.amount,
            balanceAfter: debtEntries.balanceAfter,
            note: debtEntries.note,
            createdAt: debtEntries.createdAt,
            documentId: debtEntries.documentId,
            documentCode: documents.code,
            documentType: documents.type,
            documentPaid: documents.paid,
            paymentId: debtEntries.paymentId,
            paymentCode: payments.code,
            paymentType: payments.type,
            paymentMethod: payments.method,
          })
          .from(debtEntries)
          .leftJoin(
            documents,
            and(eq(documents.id, debtEntries.documentId), eq(documents.storeId, storeId)),
          )
          .leftJoin(
            payments,
            and(eq(payments.id, debtEntries.paymentId), eq(payments.storeId, storeId)),
          )
          .where(where)
          .orderBy(desc(debtEntries.createdAt), desc(debtEntries.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ n: count() }).from(debtEntries).where(where).get(),
      ]);
      return { items, total: totalRow?.n ?? 0 };
    },

    /** Tổng nợ đang có của một loại đối tác; `since`: chỉ tính người nợ từ thời điểm đó trở về trước. */
    async outstanding(type: ContactType, since?: number) {
      const row = await db
        .select({
          amount: sql<number>`COALESCE(SUM(${contacts.debt}), 0)`,
          n: count(),
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.storeId, storeId),
            eq(contacts.type, type),
            gt(contacts.debt, 0),
            since !== undefined ? lte(contacts.debtSince, since) : undefined,
          ),
        )
        .get();
      return { amount: row?.amount ?? 0, count: row?.n ?? 0 };
    },
  };
}
