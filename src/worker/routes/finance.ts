import { Hono } from "hono";
import { idParamSchema } from "../../shared/schemas/common";
import { createPaymentSchema } from "../../shared/schemas/payment";
import {
  periodQuerySchema,
  restockQuerySchema,
  revenueDailyQuerySchema,
  topProductsQuerySchema,
} from "../../shared/schemas/report";
import { validate } from "../lib/validate";
import { requireAuth, requireOwner } from "../middleware/session";
import { debtSummary } from "../services/debts";
import { cancelPayment, createPayment, getPayment } from "../services/payments";
import { overview, restock, revenueDaily, topProducts } from "../services/reports";
import type { AuthEnv } from "../types";

export const paymentRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  // 201: tạo mới; 200: idempotencyKey đã dùng, trả lại phiếu cũ. Phiếu chi chỉ owner (kiểm ở service).
  .post("/", validate("json", createPaymentSchema), async (c) => {
    const result = await createPayment(c.get("db"), c.get("user"), c.req.valid("json"));
    return c.json(result.payment, result.replayed ? 200 : 201);
  })
  .get("/:id", validate("param", idParamSchema), async (c) =>
    c.json(await getPayment(c.get("db"), c.req.valid("param").id)),
  )
  .post("/:id/cancel", requireOwner, validate("param", idParamSchema), async (c) =>
    c.json(await cancelPayment(c.get("db"), c.req.valid("param").id)),
  );

export const debtRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get("/summary", async (c) => c.json(await debtSummary(c.get("db"))));

export const reportRoutes = new Hono<AuthEnv>()
  .use(requireAuth, requireOwner)
  .get("/overview", validate("query", periodQuerySchema), async (c) =>
    c.json(await overview(c.get("db"), c.req.valid("query"))),
  )
  .get("/revenue-daily", validate("query", revenueDailyQuerySchema), async (c) =>
    c.json(await revenueDaily(c.get("db"), c.req.valid("query").days)),
  )
  .get("/top-products", validate("query", topProductsQuerySchema), async (c) =>
    c.json(await topProducts(c.get("db"), c.req.valid("query"))),
  )
  .get("/restock", validate("query", restockQuerySchema), async (c) =>
    c.json(await restock(c.get("db"), c.req.valid("query"))),
  );
