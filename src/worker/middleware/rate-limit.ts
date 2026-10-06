import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";

type LimiterName = "REGISTER_LIMITER" | "LOGIN_LIMITER";

/**
 * Giới hạn tần suất theo IP (binding Rate Limiting của Cloudflare, đếm gần đúng theo từng
 * location). Bổ sung cho giới hạn 5 lần sai / 15 phút / SĐT trong DB: chặn một IP dò nhiều
 * SĐT hoặc tạo hàng loạt cửa hàng. Không có CF-Connecting-IP (chạy local) thì bỏ qua.
 */
export function rateLimit(name: LimiterName) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const ip = c.req.header("CF-Connecting-IP");
    if (ip) {
      const { success } = await c.env[name].limit({ key: ip });
      if (!success) {
        throw new AppError("RATE_LIMITED", "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút");
      }
    }
    return next();
  });
}
