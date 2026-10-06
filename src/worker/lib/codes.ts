// Sinh mã chứng từ trong batch (docs/DATABASE.md, "Sinh mã chứng từ trong batch").
// Câu `bump` phải đứng TRƯỚC câu dùng `code` trong cùng một db.batch(): batch chạy tuần tự
// nên subquery thấy giá trị bộ đếm vừa tăng. Không đọc bộ đếm ra rồi mới ghi.
import { type SQL, sql } from "drizzle-orm";
import { CODE_DIGITS } from "../../shared/codes";
import type { Database } from "../db/client";
import { type CounterKind, counters } from "../db/schema";

export interface CodeStatements {
  /** INSERT ... ON CONFLICT DO UPDATE tăng bộ đếm (store_id, kind). */
  bump: ReturnType<typeof bumpCounter>;
  /** Subquery trả về mã vừa cấp, ví dụ 'HD000231'. Dùng làm giá trị cột code. */
  code: SQL<string>;
}

function bumpCounter(db: Database, storeId: string, kind: CounterKind) {
  return db
    .insert(counters)
    .values({ storeId, kind, value: 1 })
    .onConflictDoUpdate({
      target: [counters.storeId, counters.kind],
      set: { value: sql`${counters.value} + 1` },
    });
}

export function codeStatements(db: Database, storeId: string, kind: CounterKind): CodeStatements {
  return {
    bump: bumpCounter(db, storeId, kind),
    code: sql<string>`(SELECT ${kind} || printf('%0${sql.raw(String(CODE_DIGITS))}d', ${counters.value}) FROM ${counters} WHERE ${counters.storeId} = ${storeId} AND ${counters.kind} = ${kind})`,
  };
}

/**
 * Mã người dùng tự nhập theo đúng mẫu `${kind}<số>` (vd. SP000200, SP0052): trả về phần số,
 * để đẩy bộ đếm lên ít nhất bằng số đó (tránh sau này tự sinh trùng). Không theo mẫu thì null.
 */
export function codeNumber(kind: CounterKind, code: string): number | null {
  const m = /^([A-Za-z]+)(\d{1,9})$/.exec(code);
  return m && m[1]!.toUpperCase() === kind ? Number(m[2]) : null;
}

/** Đặt bộ đếm >= n (không bao giờ giảm). Dùng khi người dùng tự nhập mã theo mẫu của hệ thống. */
export function counterAtLeast(db: Database, storeId: string, kind: CounterKind, n: number) {
  return db
    .insert(counters)
    .values({ storeId, kind, value: n })
    .onConflictDoUpdate({
      target: [counters.storeId, counters.kind],
      set: { value: sql`MAX(${counters.value}, excluded.value)` },
    });
}
