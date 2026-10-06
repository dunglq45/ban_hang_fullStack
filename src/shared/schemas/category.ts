import { z } from "zod";
import { requiredText } from "./common";

export const createCategorySchema = z.object({
  name: requiredText("tên nhóm hàng", 60),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
});

export const updateCategorySchema = z
  .object({
    name: requiredText("tên nhóm hàng", 60).optional(),
    sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((v) => v.name !== undefined || v.sortOrder !== undefined, {
    message: "Chưa có thông tin nào để cập nhật",
  });

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
