import type { AuthRepository } from "../repositories/auth";
import { FAILED_LOGIN_WINDOW_MS } from "./auth";

/** Chạy theo Cron Trigger (wrangler.jsonc): xóa dữ liệu đăng nhập không còn tác dụng. */
export async function purgeStaleAuthData(auth: AuthRepository, now = Date.now()) {
  await auth.batch([...auth.purgeStale(now - FAILED_LOGIN_WINDOW_MS, now)]);
}
