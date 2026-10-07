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

/** Tự đổi mật khẩu (mọi vai trò): phải nhập đúng mật khẩu hiện tại. */
export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ error: "Vui lòng nhập mật khẩu hiện tại" })
    .min(1, "Vui lòng nhập mật khẩu hiện tại")
    .max(128, "Mật khẩu tối đa 128 ký tự"),
  password: passwordSchema,
});

export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

/** Form đổi mật khẩu: thêm ô nhập lại mật khẩu mới (không gửi lên server). */
export const changePasswordFormSchema = changePasswordSchema
  .extend({
    confirmPassword: z.string({ error: "Vui lòng nhập lại mật khẩu mới" }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Mật khẩu nhập lại không khớp",
    path: ["confirmPassword"],
  });

export type ChangePasswordFormInput = z.input<typeof changePasswordFormSchema>;
