import { z } from "zod";
import { toSearch } from "../text";
import {
  codeSchema,
  idSchema,
  idempotencyKeySchema,
  moneySchema,
  optionalText,
  paginationSchema,
  qtyMilliSchema,
  requiredText,
} from "./common";

export const MAX_UNITS = 10;
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Mã hàng: để trống thì hệ thống tự sinh SP000001. */
export const productCodeSchema = codeSchema("mã hàng");

export const barcodeSchema = z
  .string()
  .trim()
  .max(50, "Mã vạch tối đa 50 ký tự")
  .regex(/^[A-Za-z0-9._-]*$/, "Mã vạch chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang")
  .nullish()
  .transform((v) => (v ? v : null));

export const productUnitSchema = z.object({
  name: requiredText("tên đơn vị", 30),
  factor: z
    .number({ error: "Quy đổi phải là số" })
    .int("Quy đổi phải là số nguyên")
    .min(2, "Quy đổi phải lớn hơn 1")
    .max(100_000, "Quy đổi quá lớn"),
  /** null: giá = giá bán lẻ × quy đổi. */
  salePrice: moneySchema("giá bán theo đơn vị")
    .nullish()
    .transform((v) => v ?? null),
  barcode: barcodeSchema,
});

const productFields = {
  name: requiredText("tên hàng", 200),
  code: productCodeSchema,
  barcode: barcodeSchema,
  categoryId: idSchema.nullish().transform((v) => v ?? null),
  baseUnit: requiredText("đơn vị cơ bản", 30),
  salePrice: moneySchema("giá bán"),
  minStock: qtyMilliSchema("mức cảnh báo tồn").default(0),
  allowNegative: z.boolean().default(false),
  isActive: z.boolean().default(true),
  showInPos: z.boolean().default(true),
  note: optionalText("ghi chú", 1000)
    .optional()
    .transform((v) => v ?? null),
  units: z
    .array(productUnitSchema)
    .max(MAX_UNITS, `Tối đa ${MAX_UNITS} đơn vị quy đổi`)
    .default([]),
};

/** Tên đơn vị không trùng nhau, không trùng đơn vị cơ bản; mã vạch không trùng nhau. */
function checkUnits(
  v: {
    baseUnit: string;
    barcode: string | null;
    units: { name: string; barcode: string | null }[];
  },
  ctx: z.RefinementCtx,
) {
  const names = new Set([toSearch(v.baseUnit)]);
  const barcodes = new Set(v.barcode ? [v.barcode] : []);
  v.units.forEach((u, i) => {
    const key = toSearch(u.name);
    if (names.has(key)) {
      ctx.addIssue({
        code: "custom",
        path: ["units", i, "name"],
        message: `Đơn vị "${u.name}" bị trùng`,
      });
    }
    names.add(key);
    if (u.barcode) {
      if (barcodes.has(u.barcode)) {
        ctx.addIssue({
          code: "custom",
          path: ["units", i, "barcode"],
          message: `Mã vạch ${u.barcode} bị trùng`,
        });
      }
      barcodes.add(u.barcode);
    }
  });
}

export const createProductSchema = z
  .object({
    ...productFields,
    /** Giá vốn ban đầu / đơn vị cơ bản. Sau đó chỉ đổi qua nhập hàng (bình quân). */
    costPrice: moneySchema("giá vốn").default(0),
    /** Tồn đầu kỳ (milli đơn vị cơ bản), ghi qua phiếu kiểm kho "Tồn đầu kỳ". */
    openingStock: qtyMilliSchema("tồn kho ban đầu").default(0),
    /** Chống tạo trùng khi gửi lại (mạng chập chờn, bấm hai lần). */
    idempotencyKey: idempotencyKeySchema,
  })
  .superRefine(checkUnits);

/** Sửa hàng: không có stock và costPrice (gửi lên cũng bị bỏ qua). Units thay thế toàn bộ. */
export const updateProductSchema = z.object(productFields).superRefine(checkUnits);

export const PRODUCT_STATUSES = ["all", "low", "out", "inactive"] as const;
export const PRODUCT_SORTS = ["name", "code", "newest", "stock_asc", "stock_desc"] as const;

export const listProductsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  categoryId: idSchema.optional(),
  status: z.enum(PRODUCT_STATUSES).default("all"),
  sort: z.enum(PRODUCT_SORTS).default("name"),
});

export const lookupQuerySchema = z.object({
  barcode: z.string().trim().min(1, "Vui lòng nhập mã vạch").max(50),
});

export const movementsQuerySchema = paginationSchema.extend({
  type: z
    .enum(["sale", "purchase", "sale_return", "purchase_return", "adjust", "cancel"])
    .optional(),
  /** epoch ms, bao gồm */
  from: z.coerce.number().int().min(0).optional(),
  /** epoch ms, không bao gồm */
  to: z.coerce.number().int().min(0).optional(),
});

/** Một dòng file Excel nhập hàng (số lượng là milli, tiền là đồng). */
export const importRowSchema = z.object({
  code: productCodeSchema,
  name: requiredText("tên hàng", 200),
  category: z
    .string()
    .trim()
    .max(60, "Tên nhóm hàng tối đa 60 ký tự")
    .nullish()
    .transform((v) => (v ? v : null)),
  unit: requiredText("đơn vị", 30),
  costPrice: moneySchema("giá vốn").default(0),
  salePrice: moneySchema("giá bán").default(0),
  stock: qtyMilliSchema("tồn kho").default(0),
  minStock: qtyMilliSchema("mức cảnh báo tồn").default(0),
  barcode: barcodeSchema,
});

/** Từng dòng được validate riêng ở server để dòng lỗi không làm hỏng dòng đúng. */
export const importProductsSchema = z.object({
  rows: z
    .array(z.unknown())
    .min(1, "File không có dòng nào")
    .max(MAX_IMPORT_ROWS, `Mỗi lần nhập tối đa ${MAX_IMPORT_ROWS} dòng`),
});

export type CreateProductInput = z.input<typeof createProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type ImportRowInput = z.input<typeof importRowSchema>;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type ProductSort = (typeof PRODUCT_SORTS)[number];
