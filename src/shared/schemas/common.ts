import { z } from "zod";

/** SĐT di động Việt Nam: 10 số, bắt đầu bằng 0. Bỏ khoảng trắng, dấu chấm, gạch ngang người dùng gõ. */
export const phoneSchema = z
  .string({ error: "Vui lòng nhập số điện thoại" })
  .transform((s) => s.replace(/[\s.-]/g, ""))
  .pipe(z.string().regex(/^0\d{9}$/, "Số điện thoại gồm 10 số, bắt đầu bằng 0"));

export const passwordSchema = z
  .string({ error: "Vui lòng nhập mật khẩu" })
  .min(6, "Mật khẩu tối thiểu 6 ký tự")
  .max(128, "Mật khẩu tối đa 128 ký tự");

export function requiredText(label: string, max: number) {
  return z
    .string({ error: `Vui lòng nhập ${label}` })
    .trim()
    .min(1, `Vui lòng nhập ${label}`)
    .max(max, `${capitalize(label)} tối đa ${max} ký tự`);
}

/** Chuỗi tùy chọn: chuỗi rỗng hoặc null lưu thành null. Vẫn phải gửi trường (PUT thay toàn bộ). */
export function optionalText(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${capitalize(label)} tối đa ${max} ký tự`)
    .nullable()
    .transform((v) => (v ? v : null));
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
