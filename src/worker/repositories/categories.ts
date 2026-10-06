import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { categories } from "../db/schema";

export type CategoryInsert = Omit<typeof categories.$inferInsert, "storeId">;

export function categoriesRepository(db: Database, storeId: string) {
  return {
    list() {
      return db
        .select()
        .from(categories)
        .where(eq(categories.storeId, storeId))
        .orderBy(asc(categories.sortOrder), asc(categories.name));
    },

    findById(id: string) {
      return db
        .select()
        .from(categories)
        .where(and(eq(categories.storeId, storeId), eq(categories.id, id)))
        .get();
    },

    /** Trả về câu lệnh (chưa chạy) để có thể đưa vào db.batch(). */
    insert(values: CategoryInsert) {
      return db.insert(categories).values({ ...values, storeId });
    },
  };
}
