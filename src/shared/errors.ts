// Mã lỗi API dùng chung cho server và client. Response lỗi: { error: { code, message, details? } }.
export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  CANNOT_MODIFY_SELF: 400,
  WRONG_PASSWORD: 400,
  INVALID_CATEGORY: 400,
  INVALID_IMAGE: 400,
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  ACCOUNT_DISABLED: 403,
  CSRF_REJECTED: 403,
  NOT_FOUND: 404,
  PHONE_TAKEN: 409,
  LAST_OWNER: 409,
  CODE_TAKEN: 409,
  BARCODE_TAKEN: 409,
  CATEGORY_IN_USE: 409,
  CATEGORY_NAME_TAKEN: 409,
  NEGATIVE_STOCK: 409,
  IMAGE_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  TOO_MANY_ATTEMPTS: 429,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

/** Lỗi từng trường khi validate thất bại (details của VALIDATION_ERROR). */
export interface FieldError {
  path: string;
  message: string;
}
