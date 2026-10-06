import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { sessions, users } from "../db/schema";

export type UserInsert = Omit<typeof users.$inferInsert, "storeId">;
export type UserUpdate = Partial<
  Pick<typeof users.$inferInsert, "name" | "role" | "isActive" | "passwordHash">
>;

/** Cột trả ra API: không bao giờ có password_hash. */
const publicColumns = {
  id: users.id,
  name: users.name,
  phone: users.phone,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

export function usersRepository(db: Database, storeId: string) {
  const inStore = (id: string) => and(eq(users.storeId, storeId), eq(users.id, id));

  return {
    list() {
      return db
        .select(publicColumns)
        .from(users)
        .where(eq(users.storeId, storeId))
        .orderBy(asc(users.role), desc(users.isActive), asc(users.name));
    },

    findById(id: string) {
      return db.select(publicColumns).from(users).where(inStore(id)).get();
    },

    /** Chỉ dùng nội bộ để kiểm tra mật khẩu; không bao giờ trả ra API. */
    async getPasswordHash(id: string) {
      const row = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(inStore(id))
        .get();
      return row?.passwordHash;
    },

    insert(values: UserInsert) {
      return db
        .insert(users)
        .values({ ...values, storeId })
        .returning(publicColumns);
    },

    /**
     * Cập nhật người dùng. Điều kiện nằm ngay trong UPDATE (không đọc-rồi-ghi): nếu người này
     * đang là chủ hoạt động thì cửa hàng phải còn chủ hoạt động khác, nếu không thì 0 dòng
     * được cập nhật (service phân biệt với "không tìm thấy" bằng findById).
     */
    update(id: string, values: UserUpdate) {
      const losesOwner = values.isActive === false || values.role === "staff";
      const keepsAnOwner = sql`EXISTS (SELECT 1 FROM users AS other
        WHERE other.store_id = ${storeId} AND other.role = 'owner'
          AND other.is_active = 1 AND other.id <> ${id})`;
      return db
        .update(users)
        .set(values)
        .where(
          losesOwner
            ? and(inStore(id), or(ne(users.role, "owner"), eq(users.isActive, false), keepsAnOwner))
            : inStore(id),
        )
        .returning(publicColumns);
    },

    /**
     * Đăng xuất người dùng khỏi mọi thiết bị (trừ phiên exceptSessionId). Đặt sau update trong
     * cùng batch: chỉ xóa khi update đã có hiệu lực (tài khoản đã khóa hoặc đã mang hash mới).
     */
    deleteSessions(userId: string, opts: { newPasswordHash?: string; exceptSessionId?: string }) {
      const applied = sql`EXISTS (SELECT 1 FROM users AS u
        WHERE u.id = ${userId} AND u.store_id = ${storeId}
          AND (u.is_active = 0 OR u.password_hash = ${opts.newPasswordHash ?? null}))`;
      return db
        .delete(sessions)
        .where(
          and(
            eq(sessions.storeId, storeId),
            eq(sessions.userId, userId),
            opts.exceptSessionId ? ne(sessions.id, opts.exceptSessionId) : undefined,
            applied,
          ),
        );
    },
  };
}
