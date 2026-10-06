import type { z } from "zod";
import type { updateStoreSchema } from "../../shared/schemas/store";
import type { StoreDb } from "../db/client";
import { AppError } from "../lib/errors";

export async function getStore(db: StoreDb) {
  const store = await db.store.get();
  if (!store) throw new AppError("NOT_FOUND", "Không tìm thấy cửa hàng");
  return store;
}

export async function updateStore(db: StoreDb, input: z.output<typeof updateStoreSchema>) {
  const [store] = await db.store.update(input);
  if (!store) throw new AppError("NOT_FOUND", "Không tìm thấy cửa hàng");
  return store;
}
