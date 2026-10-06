// Phiếu thu (thu nợ khách) / phiếu chi (trả nợ NCC). Ghi luôn đi kèm debts.changeStatements trong
// cùng batch (services/payments.ts).
import { aliasedTable, and, count, desc, eq, gte, lt, type SQL, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { contacts, debtEntries, payments, type PaymentType, users } from "../db/schema";

export type PaymentInsert = Omit<typeof payments.$inferInsert, "storeId" | "code"> & {
  /** Subquery lấy mã từ bộ đếm (codes.next("PT" | "PC").code). */
  code: string | SQL<string>;
};

const creator = aliasedTable(users, "creator");

export function paymentsRepository(db: Database, storeId: string) {
  const inStore = (id: string) => and(eq(payments.storeId, storeId), eq(payments.id, id));

  return {
    findByIdempotencyKey(key: string) {
      return db
        .select({ id: payments.id, type: payments.type })
        .from(payments)
        .where(and(eq(payments.storeId, storeId), eq(payments.idempotencyKey, key)))
        .get();
    },

    findById(id: string) {
      return db.select().from(payments).where(inStore(id)).get();
    },

    /** Phiếu kèm đối tác (nợ hiện tại), người lập và dư nợ ngay sau khi ghi phiếu. */
    detail(id: string) {
      return db
        .select({
          id: payments.id,
          type: payments.type,
          code: payments.code,
          status: payments.status,
          amount: payments.amount,
          method: payments.method,
          note: payments.note,
          createdAt: payments.createdAt,
          cancelledAt: payments.cancelledAt,
          contactId: payments.contactId,
          contactCode: contacts.code,
          contactName: contacts.name,
          contactPhone: contacts.phone,
          contactAddress: contacts.address,
          contactDebt: contacts.debt,
          createdById: payments.createdBy,
          createdByName: creator.name,
          // Dư nợ ngay sau phiếu: dòng giảm nợ của phiếu (dòng hủy phiếu là dòng tăng nợ).
          balanceAfter: sql<number | null>`(SELECT e.balance_after FROM ${debtEntries} AS e
            WHERE e.store_id = ${storeId} AND e.payment_id = ${payments.id} AND e.amount < 0
            LIMIT 1)`,
        })
        .from(payments)
        .leftJoin(contacts, and(eq(contacts.id, payments.contactId), eq(contacts.storeId, storeId)))
        .leftJoin(creator, and(eq(creator.id, payments.createdBy), eq(creator.storeId, storeId)))
        .where(inStore(id))
        .get();
    },

    insert(values: PaymentInsert) {
      return db.insert(payments).values({ ...values, storeId });
    },

    /** Chỉ đổi khi phiếu còn hiệu lực; đặt câu chặn ngay sau để hai lần hủy không cùng lọt. */
    markCancelled(id: string, now: number) {
      return db
        .update(payments)
        .set({ status: "cancelled", cancelledAt: now })
        .where(and(inStore(id), eq(payments.status, "completed")));
    },

    /** Lần trả/thu gần nhất còn hiệu lực của một đối tác. */
    lastFor(contactId: string) {
      return db
        .select({
          id: payments.id,
          code: payments.code,
          amount: payments.amount,
          method: payments.method,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .where(
          and(
            eq(payments.storeId, storeId),
            eq(payments.contactId, contactId),
            eq(payments.status, "completed"),
          ),
        )
        .orderBy(desc(payments.createdAt), desc(payments.id))
        .limit(1)
        .get();
    },

    /** Tổng tiền và số phiếu còn hiệu lực trong [from, to). */
    async totals(type: PaymentType, from: number, to: number) {
      const row = await db
        .select({
          amount: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
          n: count(),
        })
        .from(payments)
        .where(
          and(
            eq(payments.storeId, storeId),
            eq(payments.type, type),
            eq(payments.status, "completed"),
            gte(payments.createdAt, from),
            lt(payments.createdAt, to),
          ),
        )
        .get();
      return { amount: row?.amount ?? 0, count: row?.n ?? 0 };
    },
  };
}
