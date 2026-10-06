import type { ApiErrorBody, ErrorCode, FieldError } from "../../shared/errors";

/** Mã lỗi phía client: lỗi của API, cộng thêm mất kết nối và response không đọc được. */
export type ClientErrorCode = ErrorCode | "NETWORK_ERROR" | "UNKNOWN_ERROR";

/** Lỗi khi gọi API. `message` là câu tiếng Việt hiển thị được cho người dùng. */
export class ApiError extends Error {
  readonly code: ClientErrorCode;
  /** HTTP status; 0 nếu không kết nối được máy chủ. */
  readonly status: number;
  readonly details: unknown;

  constructor(code: ClientErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Lỗi do request (4xx): gửi lại y nguyên cũng không khác. */
  get isClientError() {
    return this.status >= 400 && this.status < 500;
  }

  /** Lỗi từng trường khi validate thất bại (VALIDATION_ERROR). */
  get fieldErrors(): FieldError[] {
    const fields = (this.details as { fields?: unknown } | undefined)?.fields;
    return Array.isArray(fields) ? (fields as FieldError[]) : [];
  }
}

interface JsonResponse<T> {
  ok: boolean;
  status: number;
  json(): Promise<T>;
}

function isErrorBody(body: unknown): body is ApiErrorBody {
  const error = (body as { error?: unknown } | null)?.error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

/**
 * Gọi API qua client `hc` và trả JSON khi thành công; lỗi (kể cả mất mạng) thành `ApiError`.
 * Ví dụ: `await call(api.auth.me.$get())`.
 */
export async function call<T>(request: Promise<JsonResponse<T>>): Promise<T> {
  return (await callWithStatus(request)).data;
}

/** Như `call` nhưng trả kèm HTTP status (vd. POST /api/sales: 201 tạo mới, 200 gửi trùng). */
export async function callWithStatus<T>(
  request: Promise<JsonResponse<T>>,
): Promise<{ data: T; status: number }> {
  let res: JsonResponse<T>;
  try {
    res = await request;
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
      0,
    );
  }
  if (res.ok) return { data: await res.json(), status: res.status };

  const body: unknown = await res.json().catch(() => null);
  if (isErrorBody(body)) {
    throw new ApiError(body.error.code, body.error.message, res.status, body.error.details);
  }
  throw new ApiError(
    "UNKNOWN_ERROR",
    `Máy chủ gặp sự cố (mã ${res.status}). Vui lòng thử lại.`,
    res.status,
  );
}

/** Câu thông báo cho người dùng từ một lỗi bất kỳ. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Đã có lỗi xảy ra. Vui lòng thử lại.";
}
