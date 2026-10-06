import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { stores } from "../db/schema";

export type StoreUpdate = Partial<
  Pick<typeof stores.$inferInsert, "name" | "phone" | "address" | "receiptFooter">
>;

const storeColumns = {
  id: stores.id,
  name: stores.name,
  phone: stores.phone,
  address: stores.address,
  receiptFooter: stores.receiptFooter,
};

/** Bảng stores: id chính là storeId, nên chỉ đọc/ghi được đúng một dòng. */
export function storeRepository(db: Database, storeId: string) {
  return {
    get() {
      return db.select(storeColumns).from(stores).where(eq(stores.id, storeId)).get();
    },

    update(values: StoreUpdate) {
      return db.update(stores).set(values).where(eq(stores.id, storeId)).returning(storeColumns);
    },
  };
}
