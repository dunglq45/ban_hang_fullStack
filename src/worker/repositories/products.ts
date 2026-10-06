import { and, asc, count, desc, eq, gte, inArray, lt, ne, type SQL, sql } from "drizzle-orm";
import type { ProductSort, ProductStatus } from "../../shared/schemas/product";
import { toSearch } from "../../shared/text";
import type { Database } from "../db/client";
import {
  categories,
  contacts,
  documents,
  type MovementType,
  productUnits,
  products,
  stockMovements,
} from "../db/schema";

export type ProductInsert = Omit<
  typeof products.$inferInsert,
  "storeId" | "code" | "nameSearch"
> & {
  /** Mã nhập tay, hoặc subquery lấy mã từ bộ đếm (codes.next("SP").code). */
  code: string | SQL<string>;
  /** Biểu thức SQL khi mã là subquery (xem lib/search.ts). */
  nameSearch: string | SQL<string>;
};
export type ProductUpdate = Partial<
  Omit<typeof products.$inferInsert, "id" | "storeId" | "stock" | "costPrice" | "createdAt">
>;
export type UnitInsert = Omit<typeof productUnits.$inferInsert, "storeId" | "productId" | "id"> & {
  id: string;
};

export interface ProductFilters {
  q?: string;
  categoryId?: string;
}

/** D1 giới hạn 100 tham số mỗi câu lệnh: chia danh sách IN (...) thành từng phần. */
const IN_CHUNK = 90;
function chunks<T>(arr: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** LIKE '%q%' an toàn với ký tự đặc biệt % _ \ trong từ khóa. */
export function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Điều kiện các tab danh sách (docs/DATABASE.md "Cảnh báo hàng").
const isLow = sql`(${products.isActive} = 1 AND ${products.minStock} > 0 AND ${products.stock} > 0 AND ${products.stock} <= ${products.minStock})`;
const isOut = sql`(${products.isActive} = 1 AND ${products.stock} <= 0)`;
const isInactive = sql`(${products.isActive} = 0)`;

const STATUS_COND: Record<ProductStatus, SQL | undefined> = {
  all: undefined,
  low: isLow,
  out: isOut,
  inactive: isInactive,
};

const SORT: Record<ProductSort, SQL[]> = {
  // name_search đã bỏ dấu nên sắp xếp A–Z đúng với tiếng Việt hơn cột name.
  name: [asc(products.nameSearch), asc(products.id)],
  code: [asc(products.code)],
  newest: [desc(products.createdAt), desc(products.id)],
  stock_asc: [asc(products.stock), asc(products.nameSearch)],
  stock_desc: [desc(products.stock), asc(products.nameSearch)],
};

const listColumns = {
  id: products.id,
  code: products.code,
  barcode: products.barcode,
  name: products.name,
  categoryId: products.categoryId,
  categoryName: categories.name,
  baseUnit: products.baseUnit,
  costPrice: products.costPrice,
  salePrice: products.salePrice,
  stock: products.stock,
  minStock: products.minStock,
  allowNegative: products.allowNegative,
  isActive: products.isActive,
  showInPos: products.showInPos,
  imageKey: products.imageKey,
  updatedAt: products.updatedAt,
};

const unitColumns = {
  id: productUnits.id,
  productId: productUnits.productId,
  name: productUnits.name,
  factor: productUnits.factor,
  salePrice: productUnits.salePrice,
  barcode: productUnits.barcode,
};

export function productsRepository(db: Database, storeId: string) {
  const inStore = (id: string) => and(eq(products.storeId, storeId), eq(products.id, id));
  const categoryJoin = and(eq(categories.id, products.categoryId), eq(categories.storeId, storeId));

  function filterConds(f: ProductFilters): SQL[] {
    const conds: SQL[] = [eq(products.storeId, storeId)];
    const q = f.q ? toSearch(f.q) : "";
    if (q) conds.push(sql`${products.nameSearch} LIKE ${containsPattern(q)} ESCAPE '\\'`);
    if (f.categoryId) conds.push(eq(products.categoryId, f.categoryId));
    return conds;
  }

  async function unitsOf(productIds: string[]) {
    const out: (typeof productUnits.$inferSelect & object)[] = [];
    for (const part of chunks(productIds)) {
      out.push(
        ...(await db
          .select()
          .from(productUnits)
          .where(and(eq(productUnits.storeId, storeId), inArray(productUnits.productId, part)))
          .orderBy(asc(productUnits.factor))),
      );
    }
    return out.map(({ storeId: _s, ...u }) => u);
  }

  return {
    async list(
      f: ProductFilters,
      status: ProductStatus,
      sort: ProductSort,
      page: number,
      pageSize: number,
    ) {
      const where = and(...filterConds(f), STATUS_COND[status]);
      const [items, totalRow] = await Promise.all([
        db
          .select(listColumns)
          .from(products)
          .leftJoin(categories, categoryJoin)
          .where(where)
          .orderBy(...SORT[sort])
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ n: count() }).from(products).where(where).get(),
      ]);
      return { items, total: totalRow?.n ?? 0 };
    },

    /** Số mặt hàng theo từng tab, áp dụng cùng bộ lọc q / nhóm hàng. */
    async counts(f: ProductFilters) {
      const row = await db
        .select({
          all: count(),
          low: sql<number>`COALESCE(SUM(CASE WHEN ${isLow} THEN 1 ELSE 0 END), 0)`,
          out: sql<number>`COALESCE(SUM(CASE WHEN ${isOut} THEN 1 ELSE 0 END), 0)`,
          inactive: sql<number>`COALESCE(SUM(CASE WHEN ${isInactive} THEN 1 ELSE 0 END), 0)`,
        })
        .from(products)
        .where(and(...filterConds(f)))
        .get();
      return row ?? { all: 0, low: 0, out: 0, inactive: 0 };
    },

    /**
     * Giá trị tồn kho theo giá vốn (VND) của cả cửa hàng; tồn âm tính là 0.
     * TOTAL thay vì SUM: SUM báo lỗi khi tổng vượt int64, TOTAL cộng bằng số thực rồi làm tròn.
     */
    async stockValue() {
      const row = await db
        .select({
          v: sql<number>`CAST(ROUND(TOTAL(MAX(${products.stock}, 0) * ${products.costPrice}) / 1000.0) AS INTEGER)`,
        })
        .from(products)
        .where(eq(products.storeId, storeId))
        .get();
      return row?.v ?? 0;
    },

    async findById(id: string) {
      const product = await db
        .select({ ...listColumns, note: products.note, createdAt: products.createdAt })
        .from(products)
        .leftJoin(categories, categoryJoin)
        .where(inStore(id))
        .get();
      if (!product) return undefined;
      return { ...product, units: await unitsOf([id]) };
    },

    /** Chỉ kiểm tra tồn tại (không lấy dữ liệu). */
    async exists(id: string) {
      const row = await db.select({ id: products.id }).from(products).where(inStore(id)).get();
      return row !== undefined;
    },

    /** Tra mã vạch: khớp chính xác mã vạch hàng hoặc mã vạch đơn vị quy đổi (trả về luôn đơn vị). */
    async findByBarcode(barcode: string) {
      const direct = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.storeId, storeId), eq(products.barcode, barcode)))
        .get();
      if (direct) {
        const product = await this.findById(direct.id);
        return product ? { product, unit: null } : undefined;
      }
      const unit = await db
        .select(unitColumns)
        .from(productUnits)
        .where(and(eq(productUnits.storeId, storeId), eq(productUnits.barcode, barcode)))
        .get();
      if (!unit) return undefined;
      const product = await this.findById(unit.productId);
      return product ? { product, unit } : undefined;
    },

    /**
     * Hàng dùng để lập chứng từ (bán, nhập): giá vốn, tồn, trạng thái và các đơn vị quy đổi.
     * Chỉ để tính toán/validate trước batch; tồn kho thật do UPDATE trong batch quyết định.
     */
    async forDocument(ids: string[]) {
      const unique = [...new Set(ids)];
      const rows: {
        id: string;
        code: string;
        name: string;
        baseUnit: string;
        costPrice: number;
        stock: number;
        allowNegative: boolean;
        isActive: boolean;
      }[] = [];
      for (const part of chunks(unique)) {
        rows.push(
          ...(await db
            .select({
              id: products.id,
              code: products.code,
              name: products.name,
              baseUnit: products.baseUnit,
              costPrice: products.costPrice,
              stock: products.stock,
              allowNegative: products.allowNegative,
              isActive: products.isActive,
            })
            .from(products)
            .where(and(eq(products.storeId, storeId), inArray(products.id, part)))),
        );
      }
      const units = await unitsOf(unique);
      return new Map(
        rows.map((p) => [p.id, { ...p, units: units.filter((u) => u.productId === p.id) }]),
      );
    },

    /** Những mã vạch trong danh sách đã thuộc về hàng/đơn vị khác (trừ hàng excludeProductId). */
    async barcodesTaken(barcodes: string[], excludeProductId?: string) {
      const taken = new Set<string>();
      for (const part of chunks([...new Set(barcodes)])) {
        const [p, u] = await Promise.all([
          db
            .select({ barcode: products.barcode })
            .from(products)
            .where(
              and(
                eq(products.storeId, storeId),
                inArray(products.barcode, part),
                excludeProductId ? ne(products.id, excludeProductId) : undefined,
              ),
            ),
          db
            .select({ barcode: productUnits.barcode })
            .from(productUnits)
            .where(
              and(
                eq(productUnits.storeId, storeId),
                inArray(productUnits.barcode, part),
                excludeProductId ? ne(productUnits.productId, excludeProductId) : undefined,
              ),
            ),
        ]);
        for (const r of [...p, ...u]) if (r.barcode) taken.add(r.barcode);
      }
      return taken;
    },

    /** Những mã hàng trong danh sách đã tồn tại. */
    async codesTaken(codes: string[]) {
      const taken = new Set<string>();
      for (const part of chunks([...new Set(codes)])) {
        const rows = await db
          .select({ code: products.code })
          .from(products)
          .where(and(eq(products.storeId, storeId), inArray(products.code, part)));
        for (const r of rows) taken.add(r.code);
      }
      return taken;
    },

    /** Danh sách gọn cho màn hình bán hàng: hàng đang bán và hiện ở POS, kèm đơn vị. */
    async pos() {
      const rows = await db
        .select({
          id: products.id,
          code: products.code,
          barcode: products.barcode,
          name: products.name,
          nameSearch: products.nameSearch,
          categoryId: products.categoryId,
          baseUnit: products.baseUnit,
          salePrice: products.salePrice,
          stock: products.stock,
          allowNegative: products.allowNegative,
          imageKey: products.imageKey,
        })
        .from(products)
        .where(
          and(
            eq(products.storeId, storeId),
            eq(products.isActive, true),
            eq(products.showInPos, true),
          ),
        )
        .orderBy(asc(products.nameSearch));
      const units = await db
        .select(unitColumns)
        .from(productUnits)
        .innerJoin(products, eq(products.id, productUnits.productId))
        .where(
          and(
            eq(productUnits.storeId, storeId),
            eq(products.storeId, storeId),
            eq(products.isActive, true),
            eq(products.showInPos, true),
          ),
        )
        .orderBy(asc(productUnits.factor));
      const byProduct = new Map<string, Omit<(typeof units)[number], "productId">[]>();
      for (const { productId, ...u } of units) {
        const list = byProduct.get(productId) ?? [];
        list.push(u);
        byProduct.set(productId, list);
      }
      return rows.map((p) => ({ ...p, units: byProduct.get(p.id) ?? [] }));
    },

    /** Lịch sử kho của một mặt hàng, kèm mã chứng từ và tên đối tác. */
    async movements(
      productId: string,
      f: { type?: MovementType; from?: number; to?: number },
      page: number,
      pageSize: number,
    ) {
      const where = and(
        eq(stockMovements.storeId, storeId),
        eq(stockMovements.productId, productId),
        f.type ? eq(stockMovements.type, f.type) : undefined,
        f.from !== undefined ? gte(stockMovements.createdAt, f.from) : undefined,
        f.to !== undefined ? lt(stockMovements.createdAt, f.to) : undefined,
      );
      const [items, totalRow] = await Promise.all([
        db
          .select({
            id: stockMovements.id,
            createdAt: stockMovements.createdAt,
            type: stockMovements.type,
            qtyChange: stockMovements.qtyChange,
            stockAfter: stockMovements.stockAfter,
            unitCost: stockMovements.unitCost,
            note: stockMovements.note,
            documentId: stockMovements.documentId,
            documentCode: documents.code,
            documentType: documents.type,
            contactId: contacts.id,
            contactName: contacts.name,
          })
          .from(stockMovements)
          .leftJoin(
            documents,
            and(eq(documents.id, stockMovements.documentId), eq(documents.storeId, storeId)),
          )
          .leftJoin(
            contacts,
            and(eq(contacts.id, documents.contactId), eq(contacts.storeId, storeId)),
          )
          .where(where)
          .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ n: count() }).from(stockMovements).where(where).get(),
      ]);
      return { items, total: totalRow?.n ?? 0 };
    },

    // ---- Câu lệnh ghi (chưa chạy), để gom vào db.batch() ----

    insert(values: ProductInsert) {
      return db.insert(products).values({ ...values, storeId });
    },

    update(id: string, values: ProductUpdate) {
      return db.update(products).set(values).where(inStore(id)).returning({ id: products.id });
    },

    /** Mỗi đơn vị một câu INSERT (giới hạn 100 tham số mỗi câu của D1). */
    insertUnits(productId: string, units: UnitInsert[]) {
      return units.map((u) => db.insert(productUnits).values({ ...u, productId, storeId }));
    },

    deleteUnits(productId: string) {
      return db
        .delete(productUnits)
        .where(and(eq(productUnits.storeId, storeId), eq(productUnits.productId, productId)));
    },

    /** Gắn ảnh mới; trả về [] nếu không có hàng (caller xóa ảnh vừa tải lên). */
    setImageKey(id: string, imageKey: string, now: number) {
      return db
        .update(products)
        .set({ imageKey, updatedAt: now })
        .where(inStore(id))
        .returning({ id: products.id });
    },

    /** id → mã hàng (để báo lại mã tự sinh sau khi nhập). */
    async codesByIds(ids: string[]) {
      const out = new Map<string, string>();
      for (const part of chunks(ids)) {
        const rows = await db
          .select({ id: products.id, code: products.code })
          .from(products)
          .where(and(eq(products.storeId, storeId), inArray(products.id, part)));
        for (const r of rows) out.set(r.id, r.code);
      }
      return out;
    },

    async imageKeyOf(id: string) {
      const row = await db
        .select({ imageKey: products.imageKey })
        .from(products)
        .where(inStore(id))
        .get();
      return row;
    },
  };
}

export type ProductsRepository = ReturnType<typeof productsRepository>;
export type ProductDetail = NonNullable<Awaited<ReturnType<ProductsRepository["findById"]>>>;
export type ProductListItem = Awaited<ReturnType<ProductsRepository["list"]>>["items"][number];
export type PosProduct = Awaited<ReturnType<ProductsRepository["pos"]>>[number];
export type MovementItem = Awaited<ReturnType<ProductsRepository["movements"]>>["items"][number];
