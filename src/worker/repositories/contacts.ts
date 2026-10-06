import { and, asc, count, desc, eq, gt, lte, type SQL, sql } from "drizzle-orm";
import type { ContactSort } from "../../shared/schemas/contact";
import { toSearch } from "../../shared/text";
import type { Database } from "../db/client";
import { type ContactType, contacts } from "../db/schema";
import { containsPattern } from "./products";

export type ContactInsert = Omit<
  typeof contacts.$inferInsert,
  "storeId" | "code" | "nameSearch"
> & {
  code: string | SQL<string>;
  nameSearch: string | SQL<string>;
};
export type ContactUpdate = Partial<
  Pick<
    typeof contacts.$inferInsert,
    "name" | "nameSearch" | "phone" | "address" | "note" | "debtLimit" | "isActive" | "updatedAt"
  >
>;

export interface ContactFilters {
  type: ContactType;
  q?: string;
  hasDebt?: boolean;
  /** Chỉ lấy đối tác có nợ từ thời điểm này trở về trước (epoch ms). */
  debtSinceBefore?: number;
}

const SORT: Record<ContactSort, SQL[]> = {
  name: [asc(contacts.nameSearch), asc(contacts.id)],
  debt_desc: [desc(contacts.debt), asc(contacts.nameSearch)],
  // Nợ lâu nhất lên đầu; người không nợ (debt_since NULL) xuống cuối.
  debt_since_asc: [
    sql`${contacts.debtSince} IS NULL`,
    asc(contacts.debtSince),
    asc(contacts.nameSearch),
  ],
};

const columns = {
  id: contacts.id,
  type: contacts.type,
  code: contacts.code,
  name: contacts.name,
  phone: contacts.phone,
  address: contacts.address,
  note: contacts.note,
  debt: contacts.debt,
  debtLimit: contacts.debtLimit,
  debtSince: contacts.debtSince,
  isActive: contacts.isActive,
  createdAt: contacts.createdAt,
  updatedAt: contacts.updatedAt,
};

export function contactsRepository(db: Database, storeId: string) {
  const inStore = (id: string) => and(eq(contacts.storeId, storeId), eq(contacts.id, id));

  return {
    async list(f: ContactFilters, sort: ContactSort, page: number, pageSize: number) {
      // Gõ SĐT kiểu "0912 345.678" vẫn khớp cột phone (đã bỏ ký tự phân cách khi lưu).
      const raw = f.q ? toSearch(f.q) : "";
      const q = /^[\d\s.-]+$/.test(raw) ? raw.replace(/[\s.-]/g, "") : raw;
      const where = and(
        eq(contacts.storeId, storeId),
        eq(contacts.type, f.type),
        q ? sql`${contacts.nameSearch} LIKE ${containsPattern(q)} ESCAPE '\\'` : undefined,
        f.hasDebt === true ? gt(contacts.debt, 0) : undefined,
        f.hasDebt === false ? lte(contacts.debt, 0) : undefined,
        f.debtSinceBefore !== undefined
          ? and(gt(contacts.debt, 0), lte(contacts.debtSince, f.debtSinceBefore))
          : undefined,
      );
      const [items, totalRow] = await Promise.all([
        db
          .select(columns)
          .from(contacts)
          .where(where)
          .orderBy(...SORT[sort])
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ n: count() }).from(contacts).where(where).get(),
      ]);
      return { items, total: totalRow?.n ?? 0 };
    },

    findById(id: string) {
      return db.select(columns).from(contacts).where(inStore(id)).get();
    },

    insert(values: ContactInsert) {
      return db
        .insert(contacts)
        .values({ ...values, storeId })
        .returning(columns);
    },

    update(id: string, values: ContactUpdate) {
      return db.update(contacts).set(values).where(inStore(id)).returning(columns);
    },
  };
}

export type ContactRow = NonNullable<
  Awaited<ReturnType<ReturnType<typeof contactsRepository>["findById"]>>
>;
