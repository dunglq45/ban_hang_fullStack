import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

/** Validate bằng Zod; lỗi ném ZodError để middleware lỗi trả 400 VALIDATION_ERROR. */
export function validate<T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) throw result.error;
  });
}
