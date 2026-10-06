import { z } from "zod";

/** Khóa chống gửi trùng: UUIDv7 do client sinh, giữ nguyên khi gửi lại cùng một thao tác. */
export const idempotencyKeySchema = z.uuid({ error: "Thiếu hoặc sai mã chống gửi trùng" });

/** SĐT di động Việt Nam: 10 số, bắt đầu bằng 0. Bỏ khoảng trắng, dấu chấm, gạch ngang người dùng gõ. */
export const phoneSchema = z
  .string({ error: "Vui lòng nhập số điện thoại" })
  .transform((s) => s.replace(/[\s.-]/g, ""))
  .pipe(z.string().regex(/^0\d{9}$/, "Số điện thoại gồm 10 số, bắt đầu bằng 0"));

/** SĐT tùy chọn (cửa hàng, khách, NCC): cho cả máy bàn 11 số; chuỗi rỗng hoặc null lưu null. */
export function optionalPhone(label = "Số điện thoại") {
  return z
    .string()
    .transform((s) => s.replace(/[\s.-]/g, ""))
    .pipe(z.string().regex(/^(0\d{9,10})?$/, `${label} gồm 10–11 số, bắt đầu bằng 0`))
    .nullable()
    .transform((v) => (v ? v : null));
}

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

// Giới hạn để mọi phép tính tiền ra số nguyên an toàn (≤ 2^53 ≈ 9e15), không thành số thực:
// số lượng × đơn giá / 1000 ≤ 1e9 × 1e9 / 1000 = 1e15; số lượng × quy đổi ≤ 1e9 × 1e5 = 1e14.
/** Đơn giá tối đa: 1 tỷ đồng. */
export const MAX_PRICE = 1_000_000_000;
/** Số lượng tối đa (milli): 1 triệu đơn vị. */
export const MAX_QTY_MILLI = 1_000_000_000;
/** Số tiền tổng (hạn mức nợ, tổng chứng từ...) tối đa: 1.000 tỷ đồng. */
export const MAX_AMOUNT = 1_000_000_000_000;

/** Tiền VND: số nguyên không âm. Mặc định là đơn giá (≤ MAX_PRICE). */
export function moneySchema(label: string, max = MAX_PRICE) {
  return z
    .number({ error: `${capitalize(label)} phải là số` })
    .int(`${capitalize(label)} phải là số nguyên (đồng)`)
    .min(0, `${capitalize(label)} không được âm`)
    .max(max, `${capitalize(label)} quá lớn`);
}

/** Số lượng dạng milli (×1000), không âm, tối đa MAX_QTY_MILLI. */
export function qtyMilliSchema(label: string) {
  return z
    .number({ error: `${capitalize(label)} phải là số` })
    .int(`${capitalize(label)} không hợp lệ`)
    .min(0, `${capitalize(label)} không được âm`)
    .max(MAX_QTY_MILLI, `${capitalize(label)} quá lớn`);
}

/** Mã do người dùng nhập (mã hàng, mã khách...): để trống thì hệ thống tự sinh. */
export function codeSchema(label: string) {
  return z
    .string()
    .trim()
    .max(30, `${capitalize(label)} tối đa 30 ký tự`)
    .regex(
      /^[A-Za-z0-9._-]*$/,
      `${capitalize(label)} chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang`,
    )
    .nullish()
    .transform((v) => (v ? v : null));
}

/** Id (UUIDv7 dạng chuỗi) nhận từ client. */
export const idSchema = z.string().trim().min(1).max(64);

export const idParamSchema = z.object({ id: idSchema });

/** Query phân trang: mặc định 20, tối đa 100 dòng mỗi trang. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Query boolean dạng "true"/"false"/"1"/"0". */
export const queryBoolean = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
