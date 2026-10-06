import type { z } from "zod";
import type { loginSchema, registerSchema } from "../../shared/schemas/auth";
import { type AuthRepository } from "../repositories/auth";
import { isConstraintError } from "../lib/db-errors";
import { AppError } from "../lib/errors";
import { hashPassword, verifyPassword } from "../lib/password";
import { sessionPolicy } from "../lib/session-cookie";
import { generateToken, sha256Hex } from "../lib/token";
import { uuidv7 } from "../lib/uuid";
import type { SessionUser } from "../types";

/** Nhóm hàng tạo sẵn cho cửa hàng mới (người dùng sửa/xóa được). */
export const DEFAULT_CATEGORIES = ["Đồ uống", "Thực phẩm", "Hóa phẩm", "Khác"] as const;

export const MAX_FAILED_LOGINS = 5;
export const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

export interface NewSession {
  token: string;
  remember: boolean;
  user: SessionUser;
  storeId: string;
}

/** Sinh token và câu lệnh tạo phiên; caller đưa câu lệnh vào batch của mình. */
async function newSession(
  auth: AuthRepository,
  user: SessionUser,
  storeId: string,
  remember: boolean,
  now: number,
) {
  const token = generateToken();
  const id = await sha256Hex(token);
  const session: NewSession = { token, remember, user, storeId };
  const statements = [
    auth.deleteExpiredSessions(user.id, now),
    auth.insertSession({
      id,
      userId: user.id,
      storeId,
      expiresAt: now + sessionPolicy(remember).ttlMs,
      remember,
      createdAt: now,
    }),
  ] as const;
  return { session, statements };
}

/** Tạo cửa hàng + chủ + bộ đếm + nhóm hàng mặc định trong MỘT batch, rồi đăng nhập luôn. */
export async function register(
  auth: AuthRepository,
  input: z.output<typeof registerSchema>,
): Promise<NewSession> {
  const now = Date.now();
  const storeId = uuidv7();
  const owner = {
    id: uuidv7(),
    storeId,
    phone: input.phone,
    name: input.ownerName,
    passwordHash: await hashPassword(input.password),
    role: "owner" as const,
    isActive: true,
    createdAt: now,
  };
  const user: SessionUser = {
    id: owner.id,
    name: owner.name,
    phone: owner.phone,
    role: owner.role,
  };
  // Đăng ký luôn ghi nhớ đăng nhập (thiết bị của chính chủ cửa hàng).
  const { session, statements } = await newSession(auth, user, storeId, true, now);
  try {
    // Cửa hàng, chủ, bộ đếm, nhóm hàng và phiên: một batch, không có trạng thái nửa vời.
    await auth.batch([
      ...auth.createStoreStatements({
        store: { id: storeId, name: input.storeName, phone: input.phone, createdAt: now },
        owner,
        categoryNames: DEFAULT_CATEGORIES,
        newId: uuidv7,
      }),
      ...statements,
    ]);
  } catch (err) {
    if (isConstraintError(err, "UNIQUE", "users.phone")) {
      throw new AppError("PHONE_TAKEN", "Số điện thoại này đã được đăng ký");
    }
    throw err;
  }
  return session;
}

// Băm sẵn một mật khẩu giả để SĐT không tồn tại cũng tốn thời gian như SĐT có thật.
let dummyHash: Promise<string> | undefined;

export async function login(
  auth: AuthRepository,
  input: z.output<typeof loginSchema>,
  /** Phiên đang có trên trình duyệt này (nếu có) sẽ bị xóa khi đăng nhập lại. */
  previousSessionId?: string,
): Promise<NewSession> {
  const now = Date.now();
  const since = now - FAILED_LOGIN_WINDOW_MS;
  // Ghi lần thử trước khi kiểm tra mật khẩu: request song song cũng chỉ được thử tối đa 5 lần.
  if ((await auth.recordLoginAttempt(input.phone, now, since)) > MAX_FAILED_LOGINS) {
    throw new AppError(
      "TOO_MANY_ATTEMPTS",
      "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút",
    );
  }

  const found = await auth.findUserByPhone(input.phone);
  dummyHash ??= hashPassword("dummy-password");
  const ok = await verifyPassword(input.password, found?.passwordHash ?? (await dummyHash));
  if (!found || !ok) {
    throw new AppError("INVALID_CREDENTIALS", "Số điện thoại hoặc mật khẩu không đúng");
  }
  if (!found.isActive) {
    throw new AppError("ACCOUNT_DISABLED", "Tài khoản đã bị khóa. Vui lòng liên hệ chủ cửa hàng");
  }

  const user: SessionUser = {
    id: found.id,
    name: found.name,
    phone: found.phone,
    role: found.role,
  };
  const { session, statements } = await newSession(auth, user, found.storeId, input.remember, now);
  await auth.batch([
    ...auth.clearLoginAttempts(input.phone, since),
    ...statements,
    ...(previousSessionId ? [auth.deleteSession(previousSessionId)] : []),
  ]);
  return session;
}

export async function logout(auth: AuthRepository, sessionId: string) {
  await auth.deleteSession(sessionId);
}
