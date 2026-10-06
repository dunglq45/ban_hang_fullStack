import { aliasedTable, and, asc, count, desc, eq, gte, lt, or, type SQL, sql } from "drizzle-orm";
import { toSearch } from "../../shared/text";
import type { Database } from "../db/client";
import {
  contacts,
  documentLines,
  documents,
  type DocumentStatus,
  type DocumentType,
  products,
  users,
} from "../db/schema";
import { containsPattern } from "./products";

export type DocumentInsert = Omit<typeof documents.$inferInsert, "storeId" | "code"> & {
  /** Subquery lấy mã từ bộ đếm (codes.next(kind).code). */
  code: string | SQL<string>;
};

export interface DocumentFilters {
  type?: DocumentType;
  status?: DocumentStatus;
  contactId?: string;
  from?: number;
  to?: number;
  q?: string;
}

const creator = aliasedTable(users, "creator");
const canceller = aliasedTable(users, "canceller");

export function documentsRepository(db: Database, storeId: string) {
  const inStore = (id: string) => and(eq(documents.storeId, storeId), eq(documents.id, id));
  const contactJoin = and(eq(contacts.id, documents.contactId), eq(contacts.storeId, storeId));

  return {
    findByIdempotencyKey(key: string) {
      return db
        .select({ id: documents.id, type: documents.type })
        .from(documents)
        .where(and(eq(documents.storeId, storeId), eq(documents.idempotencyKey, key)))
        .get();
    },

    findById(id: string) {
      return db.select().from(documents).where(inStore(id)).get();
    },

    /** Dòng chứng từ kèm mã và tên hàng hiện tại (document_lines không lưu tên hàng). */
    lines(documentId: string) {
      return (
        db
          .select({
            id: documentLines.id,
            productId: documentLines.productId,
            productCode: products.code,
            productName: products.name,
            unitName: documentLines.unitName,
            factor: documentLines.factor,
            qty: documentLines.qty,
            baseQty: documentLines.baseQty,
            unitPrice: documentLines.unitPrice,
            lineTotal: documentLines.lineTotal,
            costPrice: documentLines.costPrice,
            systemQty: documentLines.systemQty,
            actualQty: documentLines.actualQty,
            reason: documentLines.reason,
          })
          .from(documentLines)
          .leftJoin(
            products,
            and(eq(products.id, documentLines.productId), eq(products.storeId, storeId)),
          )
          .where(and(eq(documentLines.storeId, storeId), eq(documentLines.documentId, documentId)))
          // Thứ tự nhập: id là uuidv7 tăng đơn điệu trong một request (lib/uuid.ts có bộ đếm trong ms).
          .orderBy(asc(documentLines.id))
      );
    },

    /** Đầu chứng từ kèm khách/NCC (nợ hiện tại) và tên người tạo, người hủy. */
    header(id: string) {
      return db
        .select({
          id: documents.id,
          type: documents.type,
          code: documents.code,
          status: documents.status,
          subtotal: documents.subtotal,
          discount: documents.discount,
          total: documents.total,
          paid: documents.paid,
          debtAmount: documents.debtAmount,
          paymentMethod: documents.paymentMethod,
          note: documents.note,
          createdAt: documents.createdAt,
          completedAt: documents.completedAt,
          cancelledAt: documents.cancelledAt,
          contactId: documents.contactId,
          contactCode: contacts.code,
          contactName: contacts.name,
          contactPhone: contacts.phone,
          contactAddress: contacts.address,
          contactDebt: contacts.debt,
          createdById: documents.createdBy,
          createdByName: creator.name,
          cancelledById: documents.cancelledBy,
          cancelledByName: canceller.name,
        })
        .from(documents)
        .leftJoin(contacts, contactJoin)
        .leftJoin(creator, and(eq(creator.id, documents.createdBy), eq(creator.storeId, storeId)))
        .leftJoin(
          canceller,
          and(eq(canceller.id, documents.cancelledBy), eq(canceller.storeId, storeId)),
        )
        .where(inStore(id))
        .get();
    },

    async list(f: DocumentFilters, page: number, pageSize: number) {
      const q = f.q ? f.q.trim() : "";
      const where = and(
        eq(documents.storeId, storeId),
        f.type ? eq(documents.type, f.type) : undefined,
        f.status ? eq(documents.status, f.status) : undefined,
        f.contactId ? eq(documents.contactId, f.contactId) : undefined,
        f.from !== undefined ? gte(documents.createdAt, f.from) : undefined,
        f.to !== undefined ? lt(documents.createdAt, f.to) : undefined,
        q
          ? or(
              sql`${documents.code} LIKE ${containsPattern(q.toUpperCase())} ESCAPE '\\'`,
              sql`${contacts.nameSearch} LIKE ${containsPattern(toSearch(q))} ESCAPE '\\'`,
            )
          : undefined,
      );
      const [items, totalRow] = await Promise.all([
        db
          .select({
            id: documents.id,
            type: documents.type,
            code: documents.code,
            status: documents.status,
            contactId: documents.contactId,
            contactName: contacts.name,
            total: documents.total,
            paid: documents.paid,
            debtAmount: documents.debtAmount,
            paymentMethod: documents.paymentMethod,
            createdAt: documents.createdAt,
            createdByName: creator.name,
          })
          .from(documents)
          .leftJoin(contacts, contactJoin)
          .leftJoin(creator, and(eq(creator.id, documents.createdBy), eq(creator.storeId, storeId)))
          .where(where)
          .orderBy(desc(documents.createdAt), desc(documents.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db
          .select({ n: count() })
          .from(documents)
          .leftJoin(contacts, contactJoin)
          .where(where)
          .get(),
      ]);
      return { items, total: totalRow?.n ?? 0 };
    },

    // ---- Câu lệnh ghi (chưa chạy) ----

    insert(values: DocumentInsert) {
      return db.insert(documents).values({ ...values, storeId });
    },

    /** Chuyển completed → cancelled. Đặt guardChanges ngay sau để chặn hủy hai lần đồng thời. */
    markCancelled(id: string, actorId: string, now: number) {
      return db
        .update(documents)
        .set({ status: "cancelled", cancelledAt: now, cancelledBy: actorId })
        .where(and(inStore(id), eq(documents.status, "completed")));
    },
  };
}

export type DocumentHeader = NonNullable<
  Awaited<ReturnType<ReturnType<typeof documentsRepository>["header"]>>
>;
export type DocumentLineRow = Awaited<
  ReturnType<ReturnType<typeof documentsRepository>["lines"]>
>[number];
