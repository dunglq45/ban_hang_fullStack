import { z } from "zod";
import {
  idSchema,
  MAX_AMOUNT,
  moneySchema,
  optionalText,
  paginationSchema,
  qtyMilliSchema,
} from "./common";

export const MAX_DOCUMENT_LINES = 200;
export const PAYMENT_METHOD_VALUES = ["cash", "transfer"] as const;
export const DOCUMENT_TYPE_VALUES = [
  "sale",
  "purchase",
  "sale_return",
  "purchase_return",
  "stock_count",
] as const;
export const DOCUMENT_STATUS_VALUES = ["draft", "completed", "cancelled"] as const;

/** Khóa chống gửi trùng: UUIDv7 do client sinh, giữ nguyên khi gửi lại cùng một thao tác. */
export const idempotencyKeySchema = z.uuid({ error: "Thiếu hoặc sai mã chống gửi trùng" });

export const saleLineSchema = z.object({
  productId: idSchema,
  /** Tên đơn vị: đơn vị cơ bản của hàng hoặc một đơn vị quy đổi. Server tự lấy hệ số quy đổi. */
  unitName: z.string().trim().min(1, "Thiếu đơn vị").max(30),
  /** milli theo đơn vị đã chọn (1,5 kg = 1500) */
  qty: qtyMilliSchema("số lượng").min(1, "Số lượng phải lớn hơn 0"),
  /** Giá bán theo đơn vị đã chọn; cho phép khác giá niêm yết. */
  unitPrice: moneySchema("đơn giá"),
});

export const createSaleSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  /** Khách hàng; bỏ trống = khách lẻ (không được ghi nợ). */
  contactId: idSchema.nullish().transform((v) => v ?? null),
  lines: z
    .array(saleLineSchema)
    .min(1, "Hóa đơn chưa có mặt hàng nào")
    .max(MAX_DOCUMENT_LINES, `Mỗi hóa đơn tối đa ${MAX_DOCUMENT_LINES} dòng`),
  discount: moneySchema("chiết khấu", MAX_AMOUNT).default(0),
  /** Khách đưa; phần thừa là tiền trả lại (client tự tính, server lưu min(paid, total)). */
  paid: moneySchema("tiền khách trả", MAX_AMOUNT),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES).default("cash"),
  note: optionalText("ghi chú", 500)
    .optional()
    .transform((v) => v ?? null),
  /** Chỉ owner: ghi nợ vượt hạn mức. */
  force: z.boolean().default(false),
});

export const listDocumentsQuerySchema = paginationSchema.extend({
  type: z.enum(DOCUMENT_TYPE_VALUES).optional(),
  status: z.enum(DOCUMENT_STATUS_VALUES).optional(),
  contactId: idSchema.optional(),
  /** epoch ms, bao gồm */
  from: z.coerce.number().int().min(0).optional(),
  /** epoch ms, không bao gồm */
  to: z.coerce.number().int().min(0).optional(),
  /** mã chứng từ hoặc tên khách / NCC */
  q: z.string().trim().max(100).optional(),
});

export type CreateSaleInput = z.input<typeof createSaleSchema>;
export type SaleLineInput = z.input<typeof saleLineSchema>;
