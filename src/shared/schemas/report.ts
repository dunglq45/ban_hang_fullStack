import { z } from "zod";
import { DAY_MS, parseVnDate, PERIOD_VALUES } from "../period";
import { paginationSchema } from "./common";

/** Kỳ báo cáo tùy chọn dài nhất (ngày). */
export const MAX_REPORT_DAYS = 366;

const vnDate = z
  .string()
  .refine((s) => parseVnDate(s) !== null, "Ngày không hợp lệ (định dạng YYYY-MM-DD)");

/**
 * Kỳ báo cáo: `period` (mặc định hôm nay) hoặc khoảng tùy chọn `from`–`to` (ngày theo giờ VN,
 * bao gồm cả hai đầu). Có đủ from và to thì bỏ qua period.
 */
const periodFields = {
  period: z.enum(PERIOD_VALUES).default("today"),
  from: vnDate.optional(),
  to: vnDate.optional(),
};

function checkRange(q: { from?: string; to?: string }, ctx: z.RefinementCtx) {
  if ((q.from === undefined) !== (q.to === undefined)) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "Cần chọn cả ngày bắt đầu và kết thúc" });
    return;
  }
  if (q.from === undefined || q.to === undefined) return;
  const days = (parseVnDate(q.to)! - parseVnDate(q.from)!) / DAY_MS + 1;
  if (days < 1) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "Ngày kết thúc phải sau ngày bắt đầu" });
  } else if (days > MAX_REPORT_DAYS) {
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: `Chỉ xem được tối đa ${MAX_REPORT_DAYS} ngày`,
    });
  }
}

export const periodQuerySchema = z.object(periodFields).superRefine(checkRange);

export const revenueDailyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

export const TOP_PRODUCT_SORTS = ["qty", "revenue"] as const;

export const topProductsQuerySchema = z
  .object({
    ...periodFields,
    sort: z.enum(TOP_PRODUCT_SORTS).default("qty"),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .superRefine(checkRange);

export const debtEntriesQuerySchema = paginationSchema;
export const restockQuerySchema = paginationSchema;
