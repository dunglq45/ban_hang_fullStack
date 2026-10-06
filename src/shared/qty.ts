// Số lượng lưu dạng số nguyên "milli" (×1000) của đơn vị tính: 1,5 kg = 1500.
// Mọi phép đổi giữa số lượng hiển thị và milli phải đi qua các hàm ở đây.

export const MILLI = 1000;

/** Làm tròn nửa xa số 0 (Math.round lệch về +∞ với số âm: -0.5 → -0). */
function roundHalfAway(n: number): number {
  const r = Math.round(Math.abs(n));
  return r === 0 ? 0 : Math.sign(n) * r;
}

/**
 * Số lượng hiển thị → milli. Khử sai số dấu phẩy động trước khi làm tròn
 * (1.005 * 1000 = 1004.9999999999999 → 1005).
 */
export function toMilli(n: number): number {
  if (!Number.isFinite(n)) throw new RangeError(`Số lượng không hợp lệ: ${n}`);
  return roundHalfAway(Number((n * MILLI).toPrecision(12)));
}

/** Milli → số lượng hiển thị (có thể lẻ, tối đa 3 chữ số thập phân). */
export function fromMilli(m: number): number {
  return m / MILLI;
}

const qtyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 });

/** "1,5 Kg", "1.000 Chai". Bỏ đơn vị nếu không truyền. */
export function formatQty(milli: number, unit?: string): string {
  const text = qtyFormatter.format(fromMilli(milli));
  return unit ? `${text} ${unit}` : text;
}

/** Số lượng (milli) theo đơn vị đã chọn → milli đơn vị cơ bản. factor là số nguyên. */
export function toBaseQty(qtyMilli: number, factor: number): number {
  return qtyMilli * factor;
}

/** Thành tiền = số lượng (milli) × đơn giá, làm tròn tới đồng. */
export function lineAmount(qtyMilli: number, unitPrice: number): number {
  return roundHalfAway((qtyMilli * unitPrice) / MILLI);
}
