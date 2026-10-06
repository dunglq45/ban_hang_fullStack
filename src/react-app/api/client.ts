import { hc } from "hono/client";
import type { AppType } from "../../worker/index";

// Cùng domain với Worker nên dùng đường dẫn tương đối, cookie tự gửi kèm.
export const client = hc<AppType>("/");
export const api = client.api;
