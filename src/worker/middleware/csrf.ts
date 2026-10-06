import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Upload ảnh gửi multipart/form-data nên được miễn kiểm tra Content-Type (vẫn cần X-Requested-With). */
const UPLOAD_PATH = /^\/api\/products\/[^/]+\/image$/;

/**
 * Chống CSRF dạng form: form HTML không đặt được header tùy ý, và gửi JSON từ domain khác
 * sẽ phải qua preflight CORS (Worker không cho phép).
 */
export const csrf = createMiddleware(async (c, next) => {
  if (!WRITE_METHODS.has(c.req.method)) return next();

  if (c.req.header("X-Requested-With") !== "fetch") {
    throw new AppError("CSRF_REJECTED", "Yêu cầu không hợp lệ, vui lòng tải lại trang");
  }
  if (!UPLOAD_PATH.test(c.req.path)) {
    const type = c.req.header("Content-Type");
    // Request không có body (vd. đăng xuất) thì không cần Content-Type; có body thì phải là JSON.
    // Trình duyệt gửi POST không body kèm "Content-Length: 0", workerd vẫn cho body là stream rỗng.
    const emptyBody = c.req.raw.body === null || c.req.header("Content-Length") === "0";
    const hasBody = type !== undefined || !emptyBody;
    if (hasBody && !/^application\/json\s*(;|$)/i.test(type ?? "")) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Dữ liệu phải gửi dạng JSON");
    }
  }
  return next();
});
