import { z } from "zod";
import { idSchema, MAX_AMOUNT, moneySchema, optionalText } from "./common";
import { idempotencyKeySchema, PAYMENT_METHOD_VALUES } from "./document";

export const PAYMENT_TYPE_VALUES = ["receipt", "disbursement"] as const;

/** Phiếu thu (thu nợ khách, PT) hoặc phiếu chi (trả nợ nhà cung cấp, PC, chỉ chủ cửa hàng). */
export const createPaymentSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  type: z.enum(PAYMENT_TYPE_VALUES, { error: "Loại phiếu không hợp lệ" }),
  contactId: idSchema,
  amount: moneySchema("số tiền", MAX_AMOUNT).min(1, "Số tiền phải lớn hơn 0"),
  method: z.enum(PAYMENT_METHOD_VALUES).default("cash"),
  note: optionalText("ghi chú", 500)
    .optional()
    .transform((v) => v ?? null),
});

export type CreatePaymentInput = z.input<typeof createPaymentSchema>;
