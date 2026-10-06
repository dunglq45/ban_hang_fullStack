import { z } from "zod";
import { passwordSchema, phoneSchema, requiredText } from "./common";

export const registerSchema = z.object({
  storeName: requiredText("tên cửa hàng", 100),
  ownerName: requiredText("tên chủ cửa hàng", 100),
  phone: phoneSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  phone: phoneSchema,
  // Không áp độ dài tối thiểu khi đăng nhập: sai thì báo "sai mật khẩu" chứ không báo lỗi định dạng.
  password: z
    .string({ error: "Vui lòng nhập mật khẩu" })
    .min(1, "Vui lòng nhập mật khẩu")
    .max(128, "Mật khẩu tối đa 128 ký tự"),
  remember: z.boolean().default(false),
});

export type RegisterInput = z.input<typeof registerSchema>;
export type LoginInput = z.input<typeof loginSchema>;

/** Form đăng ký trên giao diện: thêm ô nhập lại mật khẩu (không gửi lên server). */
export const registerFormSchema = registerSchema
  .extend({
    confirmPassword: z.string({ error: "Vui lòng nhập lại mật khẩu" }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Mật khẩu nhập lại không khớp",
    path: ["confirmPassword"],
  });

export type RegisterFormInput = z.input<typeof registerFormSchema>;
