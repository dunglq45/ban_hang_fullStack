// Logic thuần của màn Sổ nợ: số ngày nợ, nút tiền nhanh khi thu nợ, bảng xuất Excel.
import { DAY_MS } from "../../../shared/period";
import { formatDate, formatDateTime } from "../../lib/format";

/** Nợ lâu hơn số ngày này thì tô cam ("Quá hạn"), khớp thẻ "Nợ quá 30 ngày" của server. */
export const OVERDUE_DAYS = 30;

/** Số ngày đã nợ tính từ ngày bắt đầu nợ (`debtSince`); không nợ thì null. */
export function debtDays(debtSince: number | null, now: number): number | null {
  if (debtSince === null) return null;
  return Math.max(0, Math.floor((now - debtSince) / DAY_MS));
}

/** Cùng điều kiện với server: đang nợ và `debt_since` ≤ now − 30 ngày. */
export function isOverdue(debtSince: number | null, now: number): boolean {
  return debtSince !== null && debtSince <= now - OVERDUE_DAYS * DAY_MS;
}

/** Ngày trong bảng sổ nợ: cùng năm thì "05/10", khác năm thì "05/10/25". */
export function shortDate(ms: number, now: number): string {
  const [d, m, y] = formatDate(ms).split("/");
  return y === formatDate(now).split("/")[2] ? `${d}/${m}` : `${d}/${m}/${y!.slice(2)}`;
}

/** "Quá hạn · 41 ngày" / "20 ngày" / "Hôm nay". */
export function debtAgeLabel(debtSince: number | null, now: number): string | null {
  const days = debtDays(debtSince, now);
  if (days === null) return null;
  const text = days === 0 ? "Hôm nay" : `${days} ngày`;
  return isOverdue(debtSince, now) ? `Quá hạn · ${text}` : text;
}

const ROUND_STEPS = [
  10_000_000, 5_000_000, 2_000_000, 1_000_000, 500_000, 200_000, 100_000, 50_000, 20_000, 10_000,
];

/** Mức tròn nhỏ hơn số nợ cho nút thu nhanh (nợ 363.000 → 200.000, 100.000, 50.000). */
export function debtQuickAmounts(debt: number, count = 3): number[] {
  return ROUND_STEPS.filter((n) => n < debt).slice(0, count);
}

export type ContactKind = "customer" | "supplier";

/** Chữ khác nhau giữa thu nợ khách và trả nợ nhà cung cấp. */
export const DEBT_TEXT = {
  customer: {
    tab: "Phải thu khách hàng",
    who: "khách",
    listLabel: "Danh sách khách nợ",
    searchLabel: "Tìm khách",
    pay: "Thu nợ",
    payAll: "Thu hết nợ",
    amountLabel: "Số tiền thu",
    after: "Dư nợ sau khi thu",
    confirm: "Xác nhận thu",
    print: "In phiếu thu",
    receiptCode: "Mã phiếu thu",
    dateLabel: "Ngày thu",
    lastPayment: "Trả gần nhất",
    done: "Đã thu",
    emptyList: "Không có khách nào đang nợ",
    emptyAll: "Chưa có khách hàng nào",
    notePlaceholder: "Ví dụ: con gái chị Lan mang tiền qua",
  },
  supplier: {
    tab: "Phải trả nhà cung cấp",
    who: "nhà cung cấp",
    listLabel: "Danh sách nhà cung cấp",
    searchLabel: "Tìm nhà cung cấp",
    pay: "Trả nợ",
    payAll: "Trả hết nợ",
    amountLabel: "Số tiền trả",
    after: "Dư nợ sau khi trả",
    confirm: "Xác nhận trả",
    print: "In phiếu chi",
    receiptCode: "Mã phiếu chi",
    dateLabel: "Ngày trả",
    lastPayment: "Trả nợ gần nhất",
    done: "Đã trả",
    emptyList: "Không nợ nhà cung cấp nào",
    emptyAll: "Chưa có nhà cung cấp nào",
    notePlaceholder: "Ví dụ: chuyển khoản qua Vietcombank",
  },
} as const;

export const METHOD_TEXT = { cash: "tiền mặt", transfer: "chuyển khoản" } as const;

export interface LedgerRow {
  createdAt: number;
  ref: { code: string | null } | null;
  description: string;
  increase: number;
  decrease: number;
  balanceAfter: number;
}

/**
 * Bảng (mảng các dòng) để ghi ra file Excel: vài dòng thông tin đầu trang rồi sổ chi tiết theo thứ
 * tự thời gian (cũ trước, như sổ giấy). `entries` nhận theo thứ tự API (mới nhất trước).
 */
export function ledgerSheetRows(
  contact: { code: string; name: string; phone: string | null; debt: number },
  entries: LedgerRow[],
  now: number,
): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [
    ["Sổ chi tiết công nợ"],
    ["Tên", contact.name],
    ["Mã", contact.code],
    ["Số điện thoại", contact.phone ?? ""],
    ["Dư nợ hiện tại", contact.debt],
    ["Ngày xuất", formatDateTime(now)],
    [],
    ["Ngày", "Chứng từ", "Diễn giải", "Phát sinh nợ", "Đã trả", "Dư nợ"],
  ];
  for (const e of [...entries].reverse()) {
    rows.push([
      formatDate(e.createdAt),
      e.ref?.code ?? "",
      e.description,
      e.increase,
      e.decrease,
      e.balanceAfter,
    ]);
  }
  return rows;
}

/** Tên file: "so-no-KH000027-20261005.xlsx". */
export function ledgerFileName(code: string, now: number): string {
  const [d, m, y] = formatDate(now).split("/");
  return `so-no-${code}-${y}${m}${d}.xlsx`;
}
