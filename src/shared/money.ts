// Tiền là số nguyên VND. Hiển thị theo vi-VN: 100000 → "100.000".

const vndFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

/** 100000 → "100.000"; -21000 → "-21.000". */
export function formatVnd(n: number): string {
  return vndFormatter.format(n);
}

/**
 * Chuỗi người dùng gõ → số nguyên VND. Chấp nhận chữ số, dấu chấm và khoảng trắng phân cách
 * hàng nghìn, dấu "-" ở đầu và hậu tố "đ"/"₫"/"vnđ". "100.000" → 100000, "-21.000 đ" → -21000.
 * Trả về null nếu rỗng hoặc có ký tự khác (dấu phẩy thập phân, chữ, "1,5tr"...), để không
 * lặng lẽ ra một số tiền sai.
 */
export function parseVnd(input: string): number | null {
  let s = input.trim();
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  s = s.replace(/\s*(đ|₫|vnđ|vnd)$/i, "");
  if (!/^\d[\d.\s]*$/.test(s)) return null;
  const value = Number(s.replace(/[.\s]/g, ""));
  if (!Number.isSafeInteger(value)) return null;
  return negative && value !== 0 ? -value : value;
}
