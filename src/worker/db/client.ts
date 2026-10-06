// Mọi truy cập dữ liệu nghiệp vụ đi qua getDb(env, storeId): repository được gắn sẵn storeId
// lúc tạo và không nhận storeId từ bên ngoài nữa. Sau này shard theo cửa hàng chỉ cần đổi ở đây.
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { createRepositories } from "../repositories";
import * as schema from "./schema";

export type Database = DrizzleD1Database<typeof schema>;

export function createDatabase(d1: D1Database): Database {
  return drizzle(d1, { schema });
}

export function getDb(env: Pick<Env, "DB">, storeId: string) {
  if (!storeId) throw new Error("getDb: thiếu storeId");
  return createRepositories(createDatabase(env.DB), storeId);
}

export type StoreDb = ReturnType<typeof getDb>;
