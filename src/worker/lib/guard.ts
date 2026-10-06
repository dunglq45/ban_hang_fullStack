// "Chốt chặn" trong batch: D1 không có interactive transaction nên không thể đọc rồi quyết định
// giữa chừng. Câu chặn đặt NGAY SAU một câu UPDATE có điều kiện; nếu câu đó không đổi dòng nào
// (vd. chứng từ đã bị hủy bởi request khác) thì câu chặn cố tình gây lỗi để cả batch rollback.
import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { stores } from "../db/schema";

/** json() với chuỗi không phải JSON báo "malformed JSON"; nội dung giúp nhận ra câu chặn khi đọc log. */
const GUARD_MARKER = "batch-guard";

/**
 * Lỗi nếu câu lệnh ngay trước không đổi đúng `expected` dòng (changes() của SQLite).
 * Viết bằng query builder (đọc dòng của chính cửa hàng, luôn có) vì db.run(sql) không chạy được
 * trong db.batch() của Drizzle D1.
 */
export function guardChanges(db: Database, storeId: string, expected = 1) {
  return db
    .select({
      ok: sql<number>`CASE WHEN changes() = ${expected} THEN 1 ELSE json(${GUARD_MARKER}) END`,
    })
    .from(stores)
    .where(eq(stores.id, storeId));
}

/** true nếu batch thất bại vì câu chặn (json() báo "malformed JSON"). */
export function isGuardError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
    if (cur.message.includes("malformed JSON")) return true;
    cur = cur.cause;
  }
  return false;
}
