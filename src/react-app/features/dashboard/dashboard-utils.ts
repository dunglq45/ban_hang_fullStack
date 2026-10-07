// Hàm thuần cho trang Tổng quan: nhãn tiền rút gọn, nhãn ngày của biểu đồ, kỳ báo cáo trên URL,
// số lượng gợi ý khi tạo phiếu nhập từ danh sách "Cần nhập thêm".
import { vnDateKey, VN_OFFSET_MS } from "../../../shared/period";
import { MILLI } from "../../../shared/qty";

/** Tiền rút gọn cho nhãn cột: 3245000 → "3,2tr", 850000 → "850k", 1250000000 → "1,3 tỷ". */
export function shortMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const oneDecimal = (v: number) => {
    const s = (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
    return s.endsWith(",0") ? s.slice(0, -2) : s;
  };
  if (abs >= 1e9) return `${sign}${oneDecimal(abs / 1e9)} tỷ`;
  // 999.950 làm tròn thành "1tr" chứ không thành "1000k".
  if (abs >= 999_500) return `${sign}${oneDecimal(abs / 1e6)}tr`;
  if (abs >= 1000) return `${sign}${Math.round(abs / 1000)}k`;
  return `${sign}${abs}`;
}

const SHORT_WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** Nhãn ngày dưới cột: "T3 29/9"; ngày hôm nay là "Hôm nay". */
export function dayLabel(from: number, today: string): string {
  const key = vnDateKey(from);
  if (key === today) return "Hôm nay";
  const d = new Date(from + VN_OFFSET_MS);
  return `${SHORT_WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/** Chiều cao cột (px) theo giá trị lớn nhất; cột có doanh thu luôn cao ít nhất 2px để thấy được. */
export function barHeight(value: number, max: number, full: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(2, Math.round((value / max) * full));
}

export type PeriodKey = "today" | "7d" | "month" | "custom";

export const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: "today", label: "Hôm nay" },
  { value: "7d", label: "7 ngày" },
  { value: "month", label: "Tháng này" },
  { value: "custom", label: "Tùy chọn" },
];

/** Tiêu đề bảng bán chạy theo kỳ. */
export const TOP_TITLE: Record<PeriodKey, string> = {
  today: "Bán chạy hôm nay",
  "7d": "Bán chạy 7 ngày qua",
  month: "Bán chạy tháng này",
  custom: "Bán chạy trong kỳ",
};

/**
 * Số lượng gợi ý khi nhập thêm (milli đơn vị cơ bản): đủ lên mức tối thiểu, làm tròn lên số
 * nguyên đơn vị, ít nhất 1. Hàng hết mà không đặt tối thiểu thì nhập 1.
 */
export function restockQty(stock: number, minStock: number): number {
  const need = minStock - stock;
  return Math.max(MILLI, Math.ceil(need / MILLI) * MILLI);
}

/** Định dạng biên lợi nhuận: 21.9 → "21,9%". */
export function formatPercent(n: number): string {
  return `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}
