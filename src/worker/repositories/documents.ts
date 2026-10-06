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
  /** Điều kiện "chứng từ còn nháp", dùng trong câu UPDATE dòng (alias d để không lẫn bảng). */
  const isDraft = (documentId: string) =>
    sql`EXISTS (SELECT 1 FROM ${documents} AS d
      WHERE d.store_id = ${storeId} AND d.id = ${documentId} AND d.status = 'draft')`;

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

    /**
     * Chuyển `from` (mặc định completed) → cancelled. Đặt guardChanges ngay sau để chặn hủy hai lần
     * đồng thời.
     */
    markCancelled(id: string, actorId: string, now: number, from: DocumentStatus = "completed") {
      return db
        .update(documents)
        .set({ status: "cancelled", cancelledAt: now, cancelledBy: actorId })
        .where(and(inStore(id), eq(documents.status, from)));
    },

    /**
     * draft → completed. Đặt guardChanges ngay sau để chặn hoàn thành hai lần.
     * `unchangedLineId`: một dòng đã đọc trước batch; sửa phiếu nháp (PUT) xóa toàn bộ dòng cũ,
     * nên nếu dòng này không còn thì phiếu vừa bị sửa → không hoàn thành theo dữ liệu cũ.
     */
    markCompleted(id: string, now: number, unchangedLineId?: string) {
      return db
        .update(documents)
        .set({ status: "completed", completedAt: now })
        .where(
          and(
            inStore(id),
            eq(documents.status, "draft"),
            unchangedLineId
              ? sql`EXISTS (SELECT 1 FROM ${documentLines} AS l
                  WHERE l.store_id = ${storeId} AND l.document_id = ${id} AND l.id = ${unchangedLineId})`
              : undefined,
          ),
        );
    },

    /** Sửa đầu phiếu nháp (chỉ khi còn draft); đặt guardChanges ngay sau. */
    updateDraft(
      id: string,
      values: Partial<
        Pick<
          typeof documents.$inferInsert,
          | "contactId"
          | "subtotal"
          | "discount"
          | "total"
          | "paid"
          | "debtAmount"
          | "paymentMethod"
          | "note"
        >
      >,
    ) {
      return db
        .update(documents)
        .set(values)
        .where(and(inStore(id), eq(documents.status, "draft")));
    },

    deleteLines(documentId: string) {
      return db
        .delete(documentLines)
        .where(and(eq(documentLines.storeId, storeId), eq(documentLines.documentId, documentId)));
    },

    insertLine(values: Omit<typeof documentLines.$inferInsert, "storeId">) {
      return db.insert(documentLines).values({ ...values, storeId });
    },

    /** Dòng phiếu kiểm kho kèm hàng: tên, mã, đơn vị, tồn HIỆN TẠI và giá vốn hiện tại. */
    countLines(documentId: string) {
      return db
        .select({
          id: documentLines.id,
          productId: documentLines.productId,
          productCode: products.code,
          productName: products.name,
          baseUnit: products.baseUnit,
          categoryId: products.categoryId,
          currentStock: products.stock,
          currentCost: products.costPrice,
          systemQty: documentLines.systemQty,
          actualQty: documentLines.actualQty,
          reason: documentLines.reason,
          qty: documentLines.qty,
          lineTotal: documentLines.lineTotal,
          costPrice: documentLines.costPrice,
        })
        .from(documentLines)
        .innerJoin(
          products,
          and(eq(products.id, documentLines.productId), eq(products.storeId, storeId)),
        )
        .where(and(eq(documentLines.storeId, storeId), eq(documentLines.documentId, documentId)))
        .orderBy(asc(products.nameSearch));
    },

    /** Ghi số đếm của một dòng; chỉ có tác dụng khi phiếu còn nháp (điều kiện trong câu UPDATE). */
    setCountLine(
      documentId: string,
      lineId: string,
      actualQty: number | null,
      reason: string | null,
    ) {
      return db
        .update(documentLines)
        .set({ actualQty, reason })
        .where(
          and(
            eq(documentLines.storeId, storeId),
            eq(documentLines.documentId, documentId),
            eq(documentLines.id, lineId),
            isDraft(documentId),
          ),
        )
        .returning({ id: documentLines.id });
    },

    /** Quét mã vạch: cộng thêm `delta` (milli) vào số đếm của hàng trong phiếu nháp. */
    scanCount(documentId: string, productId: string, delta: number) {
      return db
        .update(documentLines)
        .set({ actualQty: sql`COALESCE(${documentLines.actualQty}, 0) + ${delta}` })
        .where(
          and(
            eq(documentLines.storeId, storeId),
            eq(documentLines.documentId, documentId),
            eq(documentLines.productId, productId),
            isDraft(documentId),
          ),
        )
        .returning({ id: documentLines.id, actualQty: documentLines.actualQty });
    },
  };
}

export type DocumentHeader = NonNullable<
  Awaited<ReturnType<ReturnType<typeof documentsRepository>["header"]>>
>;
export type DocumentLineRow = Awaited<
  ReturnType<ReturnType<typeof documentsRepository>["lines"]>
>[number];
