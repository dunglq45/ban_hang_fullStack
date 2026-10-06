// Sổ công nợ: mọi thay đổi contacts.debt đi kèm một dòng debt_entries (chỉ INSERT), trong cùng batch.
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { contacts, debtEntries } from "../db/schema";
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
      return [
        db
          .update(contacts)
          .set({
            debt: sql`${contacts.debt} + ${c.amount}`,
            debtSince: sql`CASE WHEN ${contacts.debt} + ${c.amount} > 0
              THEN COALESCE(${contacts.debtSince}, ${c.now}) ELSE NULL END`,
            updatedAt: c.now,
          })
          .where(and(eq(contacts.storeId, storeId), eq(contacts.id, c.contactId), withinLimit)),
        ...(c.enforceLimit ? [guardChanges(db, storeId, 1)] : []),
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
  };
}
