import type { z } from "zod";
import type { changePasswordSchema } from "../../shared/schemas/auth";
import type { createUserSchema, updateUserSchema } from "../../shared/schemas/store";
import type { StoreDb } from "../db/client";
import { isConstraintError } from "../lib/db-errors";
import { AppError } from "../lib/errors";
import { hashPassword, verifyPassword } from "../lib/password";
import { uuidv7 } from "../lib/uuid";
import type { UserUpdate } from "../repositories/users";
import type { SessionUser } from "../types";

function phoneTaken(err: unknown): never {
  if (isConstraintError(err, "UNIQUE", "users.phone")) {
    throw new AppError("PHONE_TAKEN", "Số điện thoại này đã được dùng cho tài khoản khác");
  }
  throw err;
}

export function listUsers(db: StoreDb) {
  return db.users.list();
}

export async function createUser(db: StoreDb, input: z.output<typeof createUserSchema>) {
  const rows = await db.users
    .insert({
      id: uuidv7(),
      phone: input.phone,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      isActive: true,
      createdAt: Date.now(),
    })
    .catch(phoneTaken);
  return rows[0]!;
}

export async function updateUser(
  db: StoreDb,
  actor: SessionUser,
  /** Phiên của người đang thao tác: được giữ lại khi tự đổi mật khẩu. */
  actorSessionId: string,
  id: string,
  input: z.output<typeof updateUserSchema>,
) {
  if (
    id === actor.id &&
    ((input.isActive !== undefined && !input.isActive) ||
      (input.role !== undefined && input.role !== actor.role))
  ) {
    throw new AppError(
      "CANNOT_MODIFY_SELF",
      "Bạn không thể tự khóa hoặc tự đổi vai trò của chính mình",
    );
  }

  // Tự đổi mật khẩu phải nhập đúng mật khẩu hiện tại: ai chiếm được phiên cũng không đổi được.
  if (id === actor.id && input.password !== undefined) {
    const hash = await db.users.getPasswordHash(id);
    if (!input.currentPassword || !hash || !(await verifyPassword(input.currentPassword, hash))) {
      throw new AppError("WRONG_PASSWORD", "Mật khẩu hiện tại không đúng");
    }
  }

  const values: UserUpdate = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.role !== undefined) values.role = input.role;
  if (input.isActive !== undefined) values.isActive = input.isActive;
  if (input.password !== undefined) values.passwordHash = await hashPassword(input.password);

  // Khóa tài khoản hoặc đổi mật khẩu thì đăng xuất người đó khỏi mọi thiết bị, cùng batch
  // (tự đổi mật khẩu thì giữ phiên đang dùng).
  const update = db.users.update(id, values);
  const [rows] =
    input.isActive === false || values.passwordHash !== undefined
      ? await db.batch([
          update,
          db.users.deleteSessions(id, {
            newPasswordHash: values.passwordHash,
            exceptSessionId: id === actor.id ? actorSessionId : undefined,
          }),
        ])
      : [await update];

  const user = rows[0];
  if (user) return user;
  if (await db.users.findById(id)) {
    throw new AppError("LAST_OWNER", "Cửa hàng phải còn ít nhất một chủ đang hoạt động");
  }
  throw new AppError("NOT_FOUND", "Không tìm thấy nhân viên");
}

/**
 * Tự đổi mật khẩu (mọi vai trò, kể cả nhân viên): cùng quy tắc với `updateUser` cho chính mình
 * (phải đúng mật khẩu hiện tại, giữ phiên đang dùng, đăng xuất các thiết bị khác).
 */
export async function changeOwnPassword(
  db: StoreDb,
  actor: SessionUser,
  actorSessionId: string,
  input: z.output<typeof changePasswordSchema>,
) {
  await updateUser(db, actor, actorSessionId, actor.id, {
    password: input.password,
    currentPassword: input.currentPassword,
  });
}
