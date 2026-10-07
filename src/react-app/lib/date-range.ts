// Khoảng ngày tùy chọn (YYYY-MM-DD theo giờ VN, gồm cả hai đầu) dùng cho bộ lọc và báo cáo.
import { DAY_MS, parseVnDate } from "../../shared/period";
import { MAX_REPORT_DAYS } from "../../shared/schemas/report";

/** Kiểm tra khoảng ngày (giống server); trả câu lỗi hoặc null nếu hợp lệ. */
export function customRangeError(from: string, to: string): string | null {
  const f = parseVnDate(from);
  const t = parseVnDate(to);
  if (f === null || t === null) return "Chọn đủ ngày bắt đầu và ngày kết thúc";
  const days = (t - f) / DAY_MS + 1;
  if (days < 1) return "Ngày kết thúc phải sau ngày bắt đầu";
  if (days > MAX_REPORT_DAYS) return `Chỉ xem được tối đa ${MAX_REPORT_DAYS} ngày`;
  return null;
}
