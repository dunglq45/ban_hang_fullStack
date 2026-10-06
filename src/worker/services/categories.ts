import type { z } from "zod";
import type { createCategorySchema, updateCategorySchema } from "../../shared/schemas/category";
import type { StoreDb } from "../db/client";
import { toSearch } from "../../shared/text";
import { AppError } from "../lib/errors";
import { uuidv7 } from "../lib/uuid";

export function listCategories(db: StoreDb) {
  return db.categories.listWithCounts();
}

/** Tên nhóm không trùng (không phân biệt dấu, hoa thường): import khớp nhóm theo tên. */
async function assertNameFree(db: StoreDb, name: string, exceptId?: string) {
  const key = toSearch(name);
  const clash = (await db.categories.list()).find(
    (c) => c.id !== exceptId && toSearch(c.name) === key,
  );
  if (clash) {
    throw new AppError("CATEGORY_NAME_TAKEN", `Đã có nhóm hàng "${clash.name}"`);
  }
}

export async function createCategory(db: StoreDb, input: z.output<typeof createCategorySchema>) {
  await assertNameFree(db, input.name);
  const id = uuidv7();
  const sortOrder = input.sortOrder ?? (await db.categories.maxSortOrder()) + 1;
  await db.categories.insert({ id, name: input.name, sortOrder });
  return { id, name: input.name, sortOrder, productCount: 0 };
}

export async function updateCategory(
  db: StoreDb,
  id: string,
  input: z.output<typeof updateCategorySchema>,
) {
  if (input.name !== undefined) await assertNameFree(db, input.name, id);
  const [row] = await db.categories.update(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  });
  if (!row) throw new AppError("NOT_FOUND", "Không tìm thấy nhóm hàng");
  return { id: row.id, name: row.name, sortOrder: row.sortOrder };
}

/** Chỉ xóa được khi nhóm không còn mặt hàng nào (kể cả hàng ngừng bán). */
export async function deleteCategory(db: StoreDb, id: string) {
  const [deleted] = await db.categories.deleteIfUnused(id);
  if (deleted) return;
  const n = await db.categories.countProducts(id);
  if (n > 0) {
    throw new AppError(
      "CATEGORY_IN_USE",
      `Nhóm hàng còn ${n} mặt hàng. Hãy chuyển hàng sang nhóm khác trước khi xóa`,
      undefined,
      { productCount: n },
    );
  }
  throw new AppError("NOT_FOUND", "Không tìm thấy nhóm hàng");
}
