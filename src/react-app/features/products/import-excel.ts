// Đọc file Excel nhập hàng hóa: nhận mảng dòng (SheetJS sheet_to_json header:1), nhận diện cột
// theo tiêu đề tiếng Việt, đổi sang ImportRowInput và kiểm tra từng dòng bằng schema của server.
// Hàm thuần, không phụ thuộc SheetJS để test riêng.
import { parseVnd } from "../../../shared/money";
import { parseQty, toMilli } from "../../../shared/qty";
import {
  type ImportRowInput,
  importRowSchema,
  MAX_IMPORT_ROWS,
} from "../../../shared/schemas/product";
import { toSearch } from "../../../shared/text";

type Field = keyof ImportRowInput;

/** Số dòng tối đa mỗi file (gửi server theo lô MAX_IMPORT_ROWS dòng). */
export const MAX_FILE_ROWS = 5_000;

/** Cột của file mẫu (thứ tự xuất ra), dấu * là bắt buộc. */
export const TEMPLATE_COLUMNS: Array<{ field: Field; header: string }> = [
  { field: "code", header: "Mã hàng" },
  { field: "name", header: "Tên hàng *" },
  { field: "category", header: "Nhóm hàng" },
  { field: "unit", header: "Đơn vị *" },
  { field: "costPrice", header: "Giá vốn" },
  { field: "salePrice", header: "Giá bán" },
  { field: "stock", header: "Tồn kho" },
  { field: "minStock", header: "Tồn tối thiểu" },
  { field: "barcode", header: "Mã vạch" },
];

export const TEMPLATE_EXAMPLE = [
  "",
  "Nước mắm Nam Ngư 500ml",
  "Gia vị",
  "Chai",
  31000,
  38000,
  24,
  6,
  "8934563000052",
];

/** Tiêu đề cột (đã toSearch, bỏ dấu *) → trường. Nhận cả vài cách gọi thường gặp. */
const HEADER_ALIASES: Record<string, Field> = {
  "ma hang": "code",
  "ma sp": "code",
  "ma san pham": "code",
  "ten hang": "name",
  "ten san pham": "name",
  "ten hang hoa": "name",
  "nhom hang": "category",
  nhom: "category",
  "don vi": "unit",
  "don vi tinh": "unit",
  dvt: "unit",
  "gia von": "costPrice",
  "gia nhap": "costPrice",
  "gia ban": "salePrice",
  "gia ban le": "salePrice",
  "ton kho": "stock",
  ton: "stock",
  "so luong": "stock",
  "ton toi thieu": "minStock",
  "canh bao ton": "minStock",
  "ma vach": "barcode",
  barcode: "barcode",
};

const REQUIRED: Field[] = ["name", "unit"];
const MONEY: Field[] = ["costPrice", "salePrice"];
const QTY: Field[] = ["stock", "minStock"];

const LABEL: Record<Field, string> = Object.fromEntries(
  TEMPLATE_COLUMNS.map((c) => [c.field, c.header.replace(" *", "")]),
) as Record<Field, string>;

export interface ParsedRow {
  /** Số dòng trong file Excel (dòng tiêu đề là 1). */
  rowNumber: number;
  /** Ô gốc của dòng theo thứ tự cột trong file (để xuất lại danh sách lỗi). */
  cells: unknown[];
  input: ImportRowInput | null;
  error: string | null;
}

export interface ParsedSheet {
  /** Tiêu đề cột gốc trong file. */
  headers: string[];
  rows: ParsedRow[];
  /** Cột bắt buộc không tìm thấy (tên hiển thị). */
  missingColumns: string[];
  /** Quá MAX_FILE_ROWS dòng: chia file nhỏ hơn cho nhanh và dễ sửa lỗi. */
  tooMany: boolean;
}

function isEmptyCell(v: unknown) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function cellText(v: unknown): string {
  if (isEmptyCell(v)) return "";
  return String(v).trim();
}

function moneyOf(v: unknown): number | null | undefined {
  if (isEmptyCell(v)) return undefined;
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : null;
  const n = parseVnd(String(v));
  return n !== null && n >= 0 ? n : null;
}

function qtyOf(v: unknown): number | null | undefined {
  if (isEmptyCell(v)) return undefined;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? toMilli(v) : null;
  return parseQty(String(v));
}

export function parseSheet(table: unknown[][]): ParsedSheet {
  const headerIndex = table.findIndex((r) => r.some((c) => !isEmptyCell(c)));
  if (headerIndex < 0) {
    return { headers: [], rows: [], missingColumns: REQUIRED.map((f) => LABEL[f]), tooMany: false };
  }
  const headers = table[headerIndex]!.map(cellText);
  const columns = new Map<Field, number>();
  headers.forEach((h, i) => {
    const field = HEADER_ALIASES[toSearch(h.replace(/\*/g, ""))];
    if (field && !columns.has(field)) columns.set(field, i);
  });
  const missingColumns = REQUIRED.filter((f) => !columns.has(f)).map((f) => LABEL[f]);

  const rows: ParsedRow[] = [];
  table.slice(headerIndex + 1).forEach((cells, i) => {
    if (!cells.some((c) => !isEmptyCell(c))) return; // bỏ dòng trống
    const rowNumber = headerIndex + 2 + i;
    const get = (f: Field) => {
      const idx = columns.get(f);
      return idx === undefined ? undefined : cells[idx];
    };

    const input: Record<string, unknown> = {};
    const problems: string[] = [];
    for (const { field } of TEMPLATE_COLUMNS) {
      const raw = get(field);
      if (MONEY.includes(field)) {
        const n = moneyOf(raw);
        if (n === null) problems.push(`${LABEL[field]} không hợp lệ: "${cellText(raw)}"`);
        else if (n !== undefined) input[field] = n;
      } else if (QTY.includes(field)) {
        const n = qtyOf(raw);
        if (n === null) problems.push(`${LABEL[field]} không hợp lệ: "${cellText(raw)}"`);
        else if (n !== undefined) input[field] = n;
      } else {
        const t = cellText(raw);
        if (t || REQUIRED.includes(field)) input[field] = t;
      }
    }

    if (problems.length === 0) {
      const result = importRowSchema.safeParse(input);
      if (!result.success) problems.push(...result.error.issues.map((iss) => iss.message));
    }
    rows.push({
      rowNumber,
      cells,
      input: problems.length === 0 ? (input as ImportRowInput) : null,
      error: problems.length > 0 ? problems.join("; ") : null,
    });
  });

  return { headers, rows, missingColumns, tooMany: rows.length > MAX_FILE_ROWS };
}

/** Chia các dòng hợp lệ thành lô gửi server (tối đa 500 dòng / lần). */
export function batches<T>(items: T[], size = MAX_IMPORT_ROWS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface FailedRow {
  rowNumber: number;
  cells: unknown[];
  name: string;
  reason: string;
}

/** Bảng xuất "danh sách dòng lỗi": giữ nguyên cột gốc, thêm cột lý do. */
export function failedRowsTable(headers: string[], failed: FailedRow[]): unknown[][] {
  return [
    ["Dòng", ...headers, "Lý do lỗi"],
    ...failed.map((f) => [f.rowNumber, ...headers.map((_, i) => f.cells[i] ?? ""), f.reason]),
  ];
}

/** Bảng của file mẫu: tiêu đề + một dòng ví dụ. */
export function templateTable(): unknown[][] {
  return [TEMPLATE_COLUMNS.map((c) => c.header), TEMPLATE_EXAMPLE];
}
