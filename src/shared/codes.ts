// Định dạng mã chứng từ/danh mục: tiền tố + số thứ tự đệm 6 chữ số (HD000231, NCC000012).
// Server sinh mã trong batch bằng SQL (src/worker/lib/codes.ts) với cùng độ dài này.

export const CODE_DIGITS = 6;

/** formatCode("SP", 12) → "SP000012". */
export function formatCode(prefix: string, value: number): string {
  return prefix + String(value).padStart(CODE_DIGITS, "0");
}
