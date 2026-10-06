import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ERROR_CODES, type ErrorCode } from "../../shared/errors";

/** Lỗi nghiệp vụ; middleware lỗi chuyển thành `{ error: { code, message, details? } }`. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: ContentfulStatusCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status?: ContentfulStatusCode, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status ?? ERROR_CODES[code];
    this.details = details;
  }
}
