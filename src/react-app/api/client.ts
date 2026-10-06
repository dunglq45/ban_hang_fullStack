import { hc } from "hono/client";
import type { AppType } from "../../worker/index";

// Cùng domain với Worker nên dùng đường dẫn tương đối; credentials "include" để cookie phiên luôn
// được gửi kèm. X-Requested-With bắt buộc cho mọi request ghi (middleware chống CSRF của Worker).
export const client = hc<AppType>("/", {
  headers: { "X-Requested-With": "fetch" },
  init: { credentials: "include" },
});
export const api = client.api;
