// Logic màn Kiểm kho: hàm thuần để test riêng. Số lượng là milli đơn vị cơ bản.
import { toSearch } from "../../../shared/text";

/** Dòng phiếu kiểm như server trả (GET /api/stock-counts/:id). */
export interface CountLineData {
  id: string;
  productCode: string;
  productName: string;
  baseUnit: string;
  systemQty: number;
  currentStock: number;
  stockChanged: boolean;
  actualQty: number | null;
  diff: number | null;
  reason: string | null;
  /** Chỉ chủ cửa hàng. */
  diffValue?: number | null;
}

/** Số đếm / lý do người dùng vừa sửa, chưa được server xác nhận. */
export interface LineEdit {
  actualQty: number | null;
  reason: string | null;
}

export interface CountRow extends CountLineData {
  /** Đang có thay đổi chưa lưu (giá trị lệch hiển thị là của lần lưu trước). */
  unsaved: boolean;
}

export type CountTab = "all" | "diff" | "uncounted";

export const REASONS = ["Vỡ, hỏng", "Hết hạn", "Mất, thất lạc", "Nhập thiếu phiếu", "Khác"];

/**
 * Áp các thay đổi chưa lưu lên dòng của server. Phiếu nháp: chênh lệch = số đếm − tồn hiện tại
 * (giống server); phiếu đã hoàn thành giữ chênh lệch đã ghi.
 */
export function mergeLines(
  lines: CountLineData[],
  edits: Record<string, LineEdit>,
  draft: boolean,
): CountRow[] {
  return lines.map((l) => {
    const edit = edits[l.id];
    if (!edit || !draft) return { ...l, unsaved: false };
    const diff = edit.actualQty === null ? null : edit.actualQty - l.currentStock;
    return { ...l, actualQty: edit.actualQty, reason: edit.reason, diff, unsaved: true };
  });
}

export function isDiff(row: { diff: number | null }) {
  return row.diff !== null && row.diff !== 0;
}

export function tabCounts(rows: CountRow[]) {
  return {
    all: rows.length,
    diff: rows.filter(isDiff).length,
    uncounted: rows.filter((r) => r.actualQty === null).length,
  };
}

export function filterRows(rows: CountRow[], tab: CountTab, query: string): CountRow[] {
  const q = toSearch(query.trim());
  return rows.filter((r) => {
    if (tab === "diff" && !isDiff(r)) return false;
    if (tab === "uncounted" && r.actualQty !== null) return false;
    if (!q) return true;
    return toSearch(`${r.productName} ${r.productCode}`).includes(q);
  });
}

/** Dòng lệch mà chưa có lý do: chặn hoàn thành. */
export function missingReasons(rows: CountRow[]) {
  return rows.filter((r) => isDiff(r) && !r.reason?.trim());
}

/** "+2", "−3", "Khớp", "—" (chưa đếm). */
export function formatDiff(diff: number | null, format: (milli: number) => string) {
  if (diff === null) return "—";
  if (diff === 0) return "Khớp";
  return diff > 0 ? `+${format(diff)}` : `−${format(-diff)}`;
}

/** Giá trị có dấu: "+56.000", "−21.000", "0". */
export function formatSigned(n: number, format: (n: number) => string) {
  if (n === 0) return "0";
  return n > 0 ? `+${format(n)}` : `−${format(-n)}`;
}
