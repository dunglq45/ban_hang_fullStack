// Khoảng thời gian theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7, không có giờ mùa hè).
// Mọi khoảng là nửa mở [from, to) tính bằng epoch ms; "ngày" là ngày theo giờ VN.

export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const PERIOD_VALUES = ["today", "7d", "month"] as const;
export type Period = (typeof PERIOD_VALUES)[number];

export interface TimeRange {
  /** epoch ms, bao gồm */
  from: number;
  /** epoch ms, không bao gồm */
  to: number;
}

/** 00:00 giờ VN của ngày chứa thời điểm `ts`. */
export function vnDayStart(ts: number): number {
  return Math.floor((ts + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
}

/** Ngày theo giờ VN dạng "YYYY-MM-DD". */
export function vnDateKey(ts: number): string {
  return new Date(ts + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" (ngày VN) → 00:00 giờ VN của ngày đó; chuỗi sai dạng hoặc ngày không có thật → null. */
export function parseVnDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, d);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return utc - VN_OFFSET_MS;
}

/** 00:00 giờ VN ngày 1 của tháng chứa `ts`. */
export function vnMonthStart(ts: number): number {
  const d = new Date(ts + VN_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - VN_OFFSET_MS;
}

/** 00:00 giờ VN ngày 1 của tháng sau tháng chứa `ts`. */
export function vnNextMonthStart(ts: number): number {
  const d = new Date(ts + VN_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - VN_OFFSET_MS;
}

/**
 * Kỳ báo cáo → [from, to):
 * - today: hôm nay; 7d: 7 ngày gần nhất tính cả hôm nay; month: cả tháng này (tới đầu tháng sau).
 * - custom: từ 00:00 ngày `from` tới hết ngày `to` (cả hai là ngày VN, đều bao gồm).
 */
export function periodRange(
  period: Period | { from: string; to: string },
  now: number = Date.now(),
): TimeRange {
  if (typeof period === "object") {
    const from = parseVnDate(period.from);
    const to = parseVnDate(period.to);
    if (from === null || to === null) throw new RangeError("Ngày không hợp lệ");
    return { from, to: to + DAY_MS };
  }
  const today = vnDayStart(now);
  switch (period) {
    case "today":
      return { from: today, to: today + DAY_MS };
    case "7d":
      return { from: today - 6 * DAY_MS, to: today + DAY_MS };
    case "month":
      return { from: vnMonthStart(now), to: vnNextMonthStart(now) };
  }
}
