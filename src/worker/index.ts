// Điểm vào của Worker: fetch (Hono app) và Cron Trigger dọn dữ liệu đăng nhập.
import { app } from "./app";
import { getAuthDb } from "./db/client";
import { purgeStaleAuthData } from "./services/maintenance";

export type { AppType } from "./app";

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(purgeStaleAuthData(getAuthDb(env)));
  },
} satisfies ExportedHandler<Env>;
