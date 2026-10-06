import type { StoreDb } from "./db/client";
import type { UserRole } from "./db/schema";

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
}

export interface SessionInfo {
  /** sha256(token), là khóa của bảng sessions. */
  id: string;
  user: SessionUser;
  storeId: string;
}

/** Env của app: middleware `session` gắn `session` nếu cookie hợp lệ. */
export interface AppEnv {
  Bindings: Env;
  Variables: { session?: SessionInfo };
}

/** Env sau `requireAuth`: chắc chắn có người dùng, storeId lấy từ session và db gắn storeId. */
export interface AuthEnv {
  Bindings: Env;
  Variables: { session?: SessionInfo; user: SessionUser; storeId: string; db: StoreDb };
}
