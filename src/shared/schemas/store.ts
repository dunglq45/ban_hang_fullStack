import { z } from "zod";
import { optionalText, passwordSchema, phoneSchema, requiredText } from "./common";

export const USER_ROLE_VALUES = ["owner", "staff"] as const;

const roleSchema = z.enum(USER_ROLE_VALUES, { error: "Vai trò không hợp lệ" });

export const updateStoreSchema = z.object({
  name: requiredText("tên cửa hàng", 100),
  // SĐT cửa hàng có thể là máy bàn (11 số), nên kiểm tra lỏng hơn SĐT đăng nhập.
  phone: z
    .string()
    .transform((s) => s.replace(/[\s.-]/g, ""))
    .pipe(z.string().regex(/^(0\d{9,10})?$/, "Số điện thoại cửa hàng gồm 10–11 số, bắt đầu bằng 0"))
    .nullable()
    .transform((v) => (v ? v : null)),
  address: optionalText("địa chỉ", 200),
  receiptFooter: optionalText("lời chào cuối hóa đơn", 300),
});

export const createUserSchema = z.object({
  name: requiredText("tên nhân viên", 100),
  phone: phoneSchema,
  password: passwordSchema,
  role: roleSchema.default("staff"),
});

export const updateUserSchema = z
  .object({
    name: requiredText("tên nhân viên", 100).optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
    /** Bắt buộc khi tự đổi mật khẩu của chính mình. */
    currentPassword: z.string().max(128).optional(),
  })
  .refine(({ currentPassword: _, ...v }) => Object.values(v).some((x) => x !== undefined), {
    message: "Chưa có thông tin nào để cập nhật",
  });

export type UpdateStoreInput = z.input<typeof updateStoreSchema>;
export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;
