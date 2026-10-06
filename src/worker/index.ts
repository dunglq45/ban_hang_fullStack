import { Hono } from "hono";
import { z } from "zod";
import { vi } from "zod/locales";
import { getAuthDb } from "./db/client";
import { csrf } from "./middleware/csrf";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { session } from "./middleware/session";
import { authRoutes } from "./routes/auth";
import { storeRoutes, userRoutes } from "./routes/store";
import { purgeStaleAuthData } from "./services/maintenance";
import type { AppEnv } from "./types";

// Thông báo lỗi mặc định của Zod bằng tiếng Việt (các schema vẫn ghi đè bằng câu cụ thể).
z.config(vi());

// Route phải khai báo theo chuỗi (method chaining) để Hono RPC suy ra type cho client.
const app = new Hono<AppEnv>()
  .basePath("/api")
  .use(csrf, session)
  .get("/health", (c) => c.json({ ok: true }))
  .route("/auth", authRoutes)
  .route("/store", storeRoutes)
  .route("/users", userRoutes);

app.onError(errorHandler);
app.notFound(notFoundHandler);

export type AppType = typeof app;

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(purgeStaleAuthData(getAuthDb(env)));
  },
} satisfies ExportedHandler<Env>;
