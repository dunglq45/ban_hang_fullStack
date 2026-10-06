import { Hono } from "hono";
import { idParamSchema } from "../../shared/schemas/common";
import { createSaleSchema, listDocumentsQuerySchema } from "../../shared/schemas/document";
import { validate } from "../lib/validate";
import { requireAuth, requireOwner } from "../middleware/session";
import { cancelDocument, getDocument, listDocuments } from "../services/documents";
import { createSale } from "../services/sales";
import type { AuthEnv } from "../types";

export const saleRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  // 201: tạo mới; 200: idempotencyKey đã dùng, trả lại hóa đơn cũ.
  .post("/", validate("json", createSaleSchema), async (c) => {
    const result = await createSale(c.get("db"), c.get("user"), c.req.valid("json"));
    return c.json(result.document, result.replayed ? 200 : 201);
  });

export const documentRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get("/", validate("query", listDocumentsQuerySchema), async (c) =>
    c.json(await listDocuments(c.get("db"), c.get("user").role, c.req.valid("query"))),
  )
  .get("/:id", validate("param", idParamSchema), async (c) =>
    c.json(await getDocument(c.get("db"), c.get("user").role, c.req.valid("param").id)),
  )
  .post("/:id/cancel", requireOwner, validate("param", idParamSchema), async (c) =>
    c.json(await cancelDocument(c.get("db"), c.get("user"), c.req.valid("param").id)),
  );
