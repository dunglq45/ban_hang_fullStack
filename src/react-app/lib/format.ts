// Định dạng hiển thị: tiền, số lượng, ngày giờ theo giờ Việt Nam.
import { formatVnd } from "../../shared/money";
import { formatQty } from "../../shared/qty";

export { formatQty };

/** Số đếm (số khách, số dòng...): 1250 → "1.250". */
export function formatNumber(n: number): string {
  return formatVnd(n);
}

/** Tiền VND không kèm ký hiệu: 100000 → "100.000". */
export function formatMoney(n: number): string {
  return formatVnd(n);
}

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

const dateTimeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: VN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function vnParts(ms: number) {
  const parts: Record<string, string> = {};
  for (const p of dateTimeParts.formatToParts(ms)) parts[p.type] = p.value;
  return parts as Record<"year" | "month" | "day" | "hour" | "minute", string>;
}

/** Epoch ms → "dd/MM/yyyy" theo giờ VN. */
export function formatDate(ms: number): string {
  const p = vnParts(ms);
  return `${p.day}/${p.month}/${p.year}`;
}

/** Epoch ms → "dd/MM/yyyy HH:mm" theo giờ VN. */
export function formatDateTime(ms: number): string {
  const p = vnParts(ms);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Epoch ms → "HH:mm" theo giờ VN. */
export function formatTime(ms: number): string {
  const p = vnParts(ms);
  return `${p.hour}:${p.minute}`;
}

// getDay() theo giờ VN: 0 = Chủ nhật.
const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Epoch ms → "Thứ Hai, 05/10/2026" theo giờ VN. */
export function formatLongDate(ms: number): string {
  const weekday = WEEKDAYS[new Date(ms + VN_OFFSET_MS).getUTCDay()];
  return `${weekday}, ${formatDate(ms)}`;
}

/** Chữ viết tắt cho avatar: "Tạp hóa Minh Anh" → "MA", "Lan" → "LA". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words.at(-2)![0]! + words.at(-1)![0]!).toUpperCase();
}
