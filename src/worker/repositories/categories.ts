import { and, asc, count, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { categories, products } from "../db/schema";

export type CategoryInsert = Omit<typeof categories.$inferInsert, "storeId">;
export type CategoryUpdate = Partial<Pick<typeof categories.$inferInsert, "name" | "sortOrder">>;

export function categoriesRepository(db: Database, storeId: string) {
  const inStore = (id: string) => and(eq(categories.storeId, storeId), eq(categories.id, id));

  return {
    list() {
      return db
        .select()
        .from(categories)
        .where(eq(categories.storeId, storeId))
        .orderBy(asc(categories.sortOrder), asc(categories.name));
    },

    /** Danh sách kèm số mặt hàng (mọi trạng thái) trong từng nhóm. */
    listWithCounts() {
      return db
        .select({
          id: categories.id,
          name: categories.name,
          sortOrder: categories.sortOrder,
          // Ghi rõ "categories"."id": trong select một bảng Drizzle bỏ tên bảng, khiến cột
          // bị hiểu nhầm thành products.id bên trong subquery.
          productCount: sql<number>`(SELECT COUNT(*) FROM ${products} AS p
            WHERE p.store_id = ${storeId} AND p.category_id = "categories"."id")`,
        })
        .from(categories)
        .where(eq(categories.storeId, storeId))
        .orderBy(asc(categories.sortOrder), asc(categories.name));
    },

    findById(id: string) {
      return db.select().from(categories).where(inStore(id)).get();
    },

    async maxSortOrder() {
      const row = await db
        .select({ max: sql<number | null>`MAX(${categories.sortOrder})` })
        .from(categories)
        .where(eq(categories.storeId, storeId))
        .get();
      return row?.max ?? 0;
    },

    /** Trả về câu lệnh (chưa chạy) để có thể đưa vào db.batch(). */
    insert(values: CategoryInsert) {
      return db.insert(categories).values({ ...values, storeId });
    },

    update(id: string, values: CategoryUpdate) {
      return db.update(categories).set(values).where(inStore(id)).returning();
    },

    /**
     * Xóa nhóm chỉ khi không còn mặt hàng nào. Điều kiện nằm trong câu DELETE (không đọc-rồi-xóa),
     * nên không có khe hở khi đang có người thêm hàng vào nhóm cùng lúc.
     */
    deleteIfUnused(id: string) {
      return db
        .delete(categories)
        .where(
          and(
            inStore(id),
            sql`NOT EXISTS (SELECT 1 FROM ${products}
              WHERE ${products.storeId} = ${storeId} AND ${products.categoryId} = ${id})`,
          ),
        )
        .returning({ id: categories.id });
    },

    async countProducts(id: string) {
      const row = await db
        .select({ n: count() })
        .from(products)
        .where(and(eq(products.storeId, storeId), eq(products.categoryId, id)))
        .get();
      return row?.n ?? 0;
    },
  };
}
