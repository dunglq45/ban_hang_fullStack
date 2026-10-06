import { Hono } from "hono";
import { idParamSchema } from "../../shared/schemas/common";
import {
  createPurchaseSchema,
  createStockCountSchema,
  scanSchema,
  updatePurchaseSchema,
  updateStockCountLinesSchema,
} from "../../shared/schemas/document";
import { validate } from "../lib/validate";
import { requireAuth, requireOwner } from "../middleware/session";
import { completePurchase, createPurchase, updatePurchase } from "../services/purchases";
import {
  completeStockCount,
  createStockCount,
  getStockCount,
  scanStockCount,
  updateStockCountLines,
} from "../services/stock-counts";
import type { AuthEnv } from "../types";

// Phiếu nhập chứa giá vốn: chỉ owner. Xem/hủy phiếu qua /api/documents.
export const purchaseRoutes = new Hono<AuthEnv>()
  .use(requireAuth, requireOwner)
  // 201: tạo mới; 200: idempotencyKey đã dùng, trả lại phiếu cũ.
  .post("/", validate("json", createPurchaseSchema), async (c) => {
    const result = await createPurchase(c.get("db"), c.get("user"), c.req.valid("json"));
    return c.json(result.document, result.replayed ? 200 : 201);
  })
  .put(
    "/:id",
    validate("param", idParamSchema),
    validate("json", updatePurchaseSchema),
    async (c) =>
      c.json(
        await updatePurchase(
          c.get("db"),
          c.get("user"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
      ),
  )
  .post("/:id/complete", validate("param", idParamSchema), async (c) =>
    c.json(await completePurchase(c.get("db"), c.get("user"), c.req.valid("param").id)),
  );

// Staff được đếm (xem, ghi số, quét mã); tạo và hoàn thành phiếu chỉ owner.
export const stockCountRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .post("/", requireOwner, validate("json", createStockCountSchema), async (c) =>
    c.json(await createStockCount(c.get("db"), c.get("user"), c.req.valid("json")), 201),
  )
  .get("/:id", validate("param", idParamSchema), async (c) =>
    c.json(await getStockCount(c.get("db"), c.get("user").role, c.req.valid("param").id)),
  )
  .patch(
    "/:id/lines",
    validate("param", idParamSchema),
    validate("json", updateStockCountLinesSchema),
    async (c) =>
      c.json(
        await updateStockCountLines(
          c.get("db"),
          c.get("user"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
      ),
  )
  .post("/:id/scan", validate("param", idParamSchema), validate("json", scanSchema), async (c) =>
    c.json(await scanStockCount(c.get("db"), c.req.valid("param").id, c.req.valid("json").barcode)),
  )
  .post("/:id/complete", requireOwner, validate("param", idParamSchema), async (c) =>
    c.json(await completeStockCount(c.get("db"), c.get("user"), c.req.valid("param").id)),
  );
