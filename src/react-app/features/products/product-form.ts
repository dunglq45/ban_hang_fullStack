// Chuyển đổi giữa form Thêm/Sửa hàng hóa (giá trị trên giao diện) và dữ liệu gửi API.
// Hàm thuần để test riêng; validate dùng đúng schema Zod của server (src/shared/schemas/product).
import type { FieldErrors, Resolver } from "react-hook-form";
import {
  type CreateProductInput,
  createProductSchema,
  type UpdateProductInput,
  updateProductSchema,
} from "../../../shared/schemas/product";

/** Dùng khi kiểm tra form (validateProductForm) không cần idempotencyKey thật. */
const PLACEHOLDER_KEY = "00000000-0000-7000-8000-000000000000";

export interface UnitRow {
  name: string;
  /** Số đơn vị cơ bản trong 1 đơn vị này (nguyên ≥ 2). */
  factor: number | null;
  /** null: giá = giá bán lẻ × quy đổi. */
  salePrice: number | null;
  barcode: string;
}

export interface ProductFormValues {
  name: string;
  code: string;
  barcode: string;
  /** "" = không thuộc nhóm nào */
  categoryId: string;
  baseUnit: string;
  /** Chỉ dùng khi tạo mới; sau đó giá vốn tự tính theo nhập hàng. */
  costPrice: number | null;
  salePrice: number | null;
  /** milli; chỉ dùng khi tạo mới */
  openingStock: number | null;
  /** milli */
  minStock: number | null;
  allowNegative: boolean;
  isActive: boolean;
  showInPos: boolean;
  note: string;
  units: UnitRow[];
}

export type FormMode = "create" | "edit";

export function emptyProductForm(categoryId = ""): ProductFormValues {
  return {
    name: "",
    code: "",
    barcode: "",
    categoryId,
    baseUnit: "",
    costPrice: null,
    salePrice: null,
    openingStock: null,
    minStock: null,
    allowNegative: false,
    isActive: true,
    showInPos: true,
    note: "",
    units: [],
  };
}

export function emptyUnitRow(): UnitRow {
  return { name: "", factor: null, salePrice: null, barcode: "" };
}

/** Dữ liệu chi tiết hàng (GET /api/products/:id) → giá trị form sửa. */
export interface ProductLike {
  name: string;
  code: string;
  barcode: string | null;
  categoryId: string | null;
  baseUnit: string;
  costPrice?: number;
  salePrice: number;
  minStock: number;
  allowNegative: boolean;
  isActive: boolean;
  showInPos: boolean;
  note: string | null;
  units: Array<{ name: string; factor: number; salePrice: number | null; barcode: string | null }>;
}

export function detailToForm(p: ProductLike): ProductFormValues {
  return {
    name: p.name,
    code: p.code,
    barcode: p.barcode ?? "",
    categoryId: p.categoryId ?? "",
    baseUnit: p.baseUnit,
    costPrice: p.costPrice ?? null,
    salePrice: p.salePrice,
    openingStock: null,
    minStock: p.minStock || null,
    allowNegative: p.allowNegative,
    isActive: p.isActive,
    showInPos: p.showInPos,
    note: p.note ?? "",
    units: p.units.map((u) => ({
      name: u.name,
      factor: u.factor,
      salePrice: u.salePrice,
      barcode: u.barcode ?? "",
    })),
  };
}

function commonInput(v: ProductFormValues) {
  return {
    name: v.name,
    code: v.code.trim() || null,
    barcode: v.barcode.trim() || null,
    categoryId: v.categoryId || null,
    baseUnit: v.baseUnit,
    // null giữ nguyên để Zod báo "phải là số" — ô giá bán bắt buộc (xem validateProductForm).
    salePrice: v.salePrice as number,
    minStock: v.minStock ?? 0,
    allowNegative: v.allowNegative,
    isActive: v.isActive,
    showInPos: v.showInPos,
    note: v.note.trim() || null,
    units: v.units.map((u) => ({
      name: u.name,
      factor: u.factor as number,
      salePrice: u.salePrice,
      barcode: u.barcode.trim() || null,
    })),
  };
}

/**
 * `idempotencyKey`: sinh một lần khi mở form (giữ nguyên khi gửi lại do lỗi mạng), đổi sau mỗi
 * lần tạo thành công (kể cả "Lưu và thêm tiếp" làm trống form để thêm hàng khác).
 */
export function formToCreateInput(
  v: ProductFormValues,
  idempotencyKey: string,
): CreateProductInput {
  return {
    ...commonInput(v),
    costPrice: v.costPrice ?? 0,
    openingStock: v.openingStock ?? 0,
    idempotencyKey,
  };
}

export function formToUpdateInput(v: ProductFormValues): UpdateProductInput {
  return commonInput(v);
}

/** Chi tiết hàng → body PUT giữ nguyên mọi thứ (dùng cho Ngừng bán / Bán lại). */
export function detailToUpdateInput(p: ProductLike, patch: Partial<UpdateProductInput> = {}) {
  return { ...formToUpdateInput(detailToForm(p)), ...patch } satisfies UpdateProductInput;
}

/**
 * Lỗi của form theo đường dẫn ô ("salePrice", "units.0.factor"). Dùng schema của server để
 * client và server báo cùng một câu; bổ sung câu dễ hiểu cho ô số bỏ trống.
 */
export function validateProductForm(v: ProductFormValues, mode: FormMode): Record<string, string> {
  const errors: Record<string, string> = {};
  if (v.salePrice === null) errors.salePrice = "Vui lòng nhập giá bán";
  v.units.forEach((u, i) => {
    if (u.factor === null) errors[`units.${i}.factor`] = "Vui lòng nhập số quy đổi";
  });
  // Chỉ kiểm tra hình dạng dữ liệu, không gửi đi nên idempotencyKey thật chưa cần ở bước này.
  const result =
    mode === "create"
      ? createProductSchema.safeParse(formToCreateInput(v, PLACEHOLDER_KEY))
      : updateProductSchema.safeParse(formToUpdateInput(v));
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      if (path && !(path in errors)) errors[path] = issue.message;
    }
  }
  return errors;
}

/** { "units.0.name": "..." } → cấu trúc lỗi lồng nhau của react-hook-form. */
export function toFieldErrors(flat: Record<string, string>): FieldErrors<ProductFormValues> {
  const out: Record<string, unknown> = {};
  for (const [path, message] of Object.entries(flat)) {
    const keys = path.split(".");
    let cur = out;
    keys.forEach((key, i) => {
      if (i === keys.length - 1) {
        cur[key] = { type: "validate", message };
        return;
      }
      if (cur[key] === undefined) cur[key] = /^\d+$/.test(keys[i + 1]!) ? [] : {};
      cur = cur[key] as Record<string, unknown>;
    });
  }
  return out as FieldErrors<ProductFormValues>;
}

export function productFormResolver(mode: FormMode): Resolver<ProductFormValues> {
  return (values) => {
    const errors = validateProductForm(values, mode);
    return Object.keys(errors).length === 0
      ? { values, errors: {} }
      : { values: {}, errors: toFieldErrors(errors) };
  };
}

/** Lãi mỗi đơn vị và tỷ lệ lãi trên giá bán ("Lãi 5.000 · 19,2%"); null nếu thiếu giá. */
export function profitOf(salePrice: number | null, costPrice: number | null | undefined) {
  if (salePrice === null || costPrice === null || costPrice === undefined) return null;
  const amount = salePrice - costPrice;
  return { amount, percent: salePrice > 0 ? (amount / salePrice) * 100 : null };
}

const percentFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

export function formatPercent(p: number): string {
  return `${percentFormatter.format(p)}%`;
}
