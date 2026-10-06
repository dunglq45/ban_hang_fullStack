import { Hono } from "hono";

// Route phải khai báo theo chuỗi (method chaining) để Hono RPC suy ra type cho client.
const app = new Hono<{ Bindings: Env }>()
  .basePath("/api")
  .get("/health", (c) => c.json({ ok: true }));

app.notFound((c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy đường dẫn" } }, 404),
);

export type AppType = typeof app;

export default app;
