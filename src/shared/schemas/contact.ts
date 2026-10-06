import { z } from "zod";
import {
  codeSchema,
  MAX_AMOUNT,
  moneySchema,
  optionalPhone,
  optionalText,
  paginationSchema,
  queryBoolean,
  requiredText,
} from "./common";

export const CONTACT_TYPE_VALUES = ["customer", "supplier"] as const;
export const CONTACT_SORTS = ["name", "debt_desc", "debt_since_asc"] as const;

const contactFields = {
  name: requiredText("tên", 200),
  phone: optionalPhone(),
  address: optionalText("địa chỉ", 300),
  note: optionalText("ghi chú", 1000),
  /** null = không giới hạn nợ */
  debtLimit: moneySchema("hạn mức nợ", MAX_AMOUNT).nullable(),
  isActive: z.boolean().default(true),
};

export const createContactSchema = z.object({
  type: z.enum(CONTACT_TYPE_VALUES, { error: "Loại đối tác không hợp lệ" }),
  /** Để trống thì tự sinh KH000001 / NCC000001. */
  code: codeSchema("mã"),
  ...contactFields,
});

/** Sửa thông tin; không đổi được loại, mã và công nợ (công nợ chỉ đổi qua chứng từ, phiếu thu chi). */
export const updateContactSchema = z.object(contactFields);

export const listContactsQuerySchema = paginationSchema.extend({
  type: z.enum(CONTACT_TYPE_VALUES, { error: "Thiếu loại đối tác" }),
  q: z.string().trim().max(100).optional(),
  hasDebt: queryBoolean.optional(),
  /** Chỉ lấy đối tác đang nợ từ trước N ngày. */
  overdueDays: z.coerce.number().int().min(0).max(3650).optional(),
  sort: z.enum(CONTACT_SORTS).default("name"),
});

export type CreateContactInput = z.input<typeof createContactSchema>;
export type UpdateContactInput = z.input<typeof updateContactSchema>;
export type ContactSort = (typeof CONTACT_SORTS)[number];
