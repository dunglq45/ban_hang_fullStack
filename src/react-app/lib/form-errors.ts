import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "../api/errors";

/**
 * Lỗi validate từ server (VALIDATION_ERROR kèm `details.fields`) → gắn vào đúng ô của form.
 * Chỉ gắn các trường có trong `fields`; câu lỗi chung vẫn hiển thị dưới form.
 */
export function applyFieldErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
) {
  if (!(err instanceof ApiError)) return;
  for (const f of err.fieldErrors) {
    const name = fields.find((field) => field === f.path);
    if (name) setError(name, { type: "server", message: f.message });
  }
}
