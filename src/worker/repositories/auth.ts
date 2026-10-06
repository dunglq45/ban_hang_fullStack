// Truy vấn cấp hệ thống cho đăng ký/đăng nhập/phiên: chạy TRƯỚC khi biết cửa hàng nào,
// nên không gắn storeId. Không dùng repository này cho dữ liệu nghiệp vụ.
import { and, count, eq, gt, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  categories,
  counters,
  COUNTER_KINDS,
  loginAttempts,
  sessions,
  stores,
  users,
} from "../db/schema";

type StoreInsert = typeof stores.$inferInsert;
type UserInsert = typeof users.$inferInsert;
type SessionInsert = typeof sessions.$inferInsert;

export function authRepository(db: Database) {
  return {
    batch: db.batch.bind(db),

    findUserByPhone(phone: string) {
      return db.select().from(users).where(eq(users.phone, phone)).get();
    },

    /** Phiên còn hạn kèm người dùng đang hoạt động. */
    findSession(id: string, now: number) {
      return db
        .select({
          id: sessions.id,
          storeId: sessions.storeId,
          expiresAt: sessions.expiresAt,
          remember: sessions.remember,
          user: {
            id: users.id,
            storeId: users.storeId,
            name: users.name,
            phone: users.phone,
            role: users.role,
          },
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now), eq(users.isActive, true)))
        .get();
    },

    insertSession(values: SessionInsert) {
      return db.insert(sessions).values(values);
    },

    extendSession(id: string, expiresAt: number) {
      return db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    },

    deleteSession(id: string) {
      return db.delete(sessions).where(eq(sessions.id, id));
    },

    /** Dọn phiên hết hạn của một người dùng (gọi khi đăng nhập). */
    deleteExpiredSessions(userId: string, now: number) {
      return db
        .delete(sessions)
        .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, now)));
    },

    /**
     * Ghi một lần thử đăng nhập RỒI mới đếm, trong cùng batch: nhiều request song song
     * không thể cùng "thấy" số lần thử dưới giới hạn (không đọc-rồi-ghi). Trả về số lần thử
     * trong cửa sổ, tính cả lần này. Đăng nhập đúng thì dùng clearLoginAttempts.
     */
    async recordLoginAttempt(phone: string, now: number, since: number) {
      const [, rows] = await db.batch([
        db.insert(loginAttempts).values({ phone, at: now }),
        db
          .select({ n: count() })
          .from(loginAttempts)
          .where(and(eq(loginAttempts.phone, phone), gt(loginAttempts.at, since))),
      ]);
      return rows[0]?.n ?? 0;
    },

    /** Xóa mọi lần thử của SĐT vừa đăng nhập đúng, và dọn lần thử quá hạn của mọi SĐT. */
    clearLoginAttempts(phone: string, before: number) {
      return [
        db.delete(loginAttempts).where(eq(loginAttempts.phone, phone)),
        db.delete(loginAttempts).where(lt(loginAttempts.at, before)),
      ] as const;
    },

    /** Dọn định kỳ (Cron): lần thử đăng nhập quá cửa sổ đếm và phiên đã hết hạn của mọi cửa hàng. */
    purgeStale(attemptsBefore: number, now: number) {
      return [
        db.delete(loginAttempts).where(lt(loginAttempts.at, attemptsBefore)),
        db.delete(sessions).where(lt(sessions.expiresAt, now)),
      ] as const;
    },

    /** Các câu lệnh tạo cửa hàng mới; chạy trong MỘT batch. */
    createStoreStatements(input: {
      store: StoreInsert;
      owner: UserInsert;
      categoryNames: readonly string[];
      newId: () => string;
    }) {
      const storeId = input.store.id;
      return [
        db.insert(stores).values(input.store),
        db.insert(users).values(input.owner),
        db.insert(counters).values(COUNTER_KINDS.map((kind) => ({ storeId, kind, value: 0 }))),
        db.insert(categories).values(
          input.categoryNames.map((name, i) => ({
            id: input.newId(),
            storeId,
            name,
            sortOrder: i + 1,
          })),
        ),
      ] as const;
    },
  };
}

export type AuthRepository = ReturnType<typeof authRepository>;
