import type { ErrorHandler, NotFoundHandler } from "hono";
import { DrizzleQueryError } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { ApiErrorBody, FieldError } from "../../shared/errors";
import { AppError } from "../lib/errors";

function body(
  code: ApiErrorBody["error"]["code"],
  message: string,
  details?: unknown,
): ApiErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(body(err.code, err.message, err.details), err.status);
  }
  if (err instanceof ZodError) {
    const fields: FieldError[] = err.issues.map((i) => ({
      path: i.path.map(String).join("."),
      message: i.message,
    }));
    return c.json(
      body("VALIDATION_ERROR", fields[0]?.message ?? "Dữ liệu không hợp lệ", { fields }),
      400,
    );
  }
  if (err instanceof HTTPException && err.status < 500) {
    // Ví dụ: body không phải JSON hợp lệ (Hono validator ném 400).
    return c.json(body("BAD_REQUEST", "Dữ liệu gửi lên không hợp lệ"), 400);
  }
  console.error("Lỗi không xử lý được:", c.req.method, c.req.path, redact(err));
  return c.json(body("INTERNAL_ERROR", "Có lỗi xảy ra, vui lòng thử lại sau"), 500);
};

/** Lỗi Drizzle kèm params của câu SQL (có thể chứa password_hash, token): chỉ log câu SQL và lỗi gốc. */
function redact(err: unknown): unknown {
  if (err instanceof DrizzleQueryError) {
    return { query: err.query, cause: err.cause };
  }
  return err;
}

export const notFoundHandler: NotFoundHandler = (c) =>
  c.json(body("NOT_FOUND", "Không tìm thấy đường dẫn"), 404);
