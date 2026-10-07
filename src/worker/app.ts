// Ứng dụng Hono: middleware chung và toàn bộ route dưới /api.
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { vi } from "zod/locales";
import { csrf } from "./middleware/csrf";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { session } from "./middleware/session";
import { authRoutes } from "./routes/auth";
import { documentRoutes, saleRoutes } from "./routes/documents";
import { debtRoutes, paymentRoutes, reportRoutes } from "./routes/finance";
import { purchaseRoutes, stockCountRoutes } from "./routes/inventory";
import { categoryRoutes, contactRoutes, imageRoutes, productRoutes } from "./routes/catalog";
import { storeRoutes, userRoutes } from "./routes/store";
import { docsRoutes } from "./routes/docs";
import type { AppEnv } from "./types";

// Thông báo lỗi mặc định của Zod bằng tiếng Việt (các schema vẫn ghi đè bằng câu cụ thể).
z.config(vi());

// Route phải khai báo theo chuỗi (method chaining) để Hono RPC suy ra type cho client.
export const app = new Hono<AppEnv>()
  .basePath("/api")
  // Header bảo mật mặc định của Hono (nosniff, chặn nhúng iframe, HSTS, CORP same-origin...).
  // Trang SPA/static do Cloudflare phục vụ thì đặt header trong public/_headers.
  .use(secureHeaders(), csrf, session)
  .get("/health", (c) => c.json({ ok: true }))
  .route("/auth", authRoutes)
  .route("/store", storeRoutes)
  .route("/users", userRoutes)
  .route("/categories", categoryRoutes)
  .route("/products", productRoutes)
  .route("/images", imageRoutes)
  .route("/contacts", contactRoutes)
  .route("/sales", saleRoutes)
  .route("/documents", documentRoutes)
  .route("/purchases", purchaseRoutes)
  .route("/stock-counts", stockCountRoutes)
  .route("/payments", paymentRoutes)
  .route("/debts", debtRoutes)
  .route("/reports", reportRoutes);

// Trang tài liệu API kiểu Swagger (/api/docs): chỉ khi chạy dev (pnpm dev) và test, không có trong bản build.
// Gắn ngoài chuỗi route để không lọt vào AppType của client.
if (import.meta.env.DEV) app.route("/docs", docsRoutes());

app.onError(errorHandler);
app.notFound(notFoundHandler);

export type AppType = typeof app;
