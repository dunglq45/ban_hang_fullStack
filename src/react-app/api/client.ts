import { hc } from "hono/client";
import type { AppType } from "../../worker/index";

// Cùng domain với Worker nên dùng đường dẫn tương đối, cookie tự gửi kèm.
// X-Requested-With bắt buộc cho mọi request ghi (middleware chống CSRF của Worker).
export const client = hc<AppType>("/", { headers: { "X-Requested-With": "fetch" } });
export const api = client.api;
