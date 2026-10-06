// Client API cho test: hc<AppType> (type chặt như frontend) chạy qua SELF.fetch,
// nên request đi qua toàn bộ middleware như request thật từ trình duyệt.
import { SELF } from "cloudflare:test";
import { hc } from "hono/client";
import type { AppType } from "../../src/worker/index";

export const BASE_URL = "https://example.com";

/** cookie: chuỗi "sid=..." lấy từ đăng ký/đăng nhập. */
export function client(cookie?: string) {
  return hc<AppType>(BASE_URL, {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => SELF.fetch(input, init),
    headers: {
      "X-Requested-With": "fetch",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  }).api;
}

/** Cookie `sid` server vừa đặt, dạng "sid=..." (undefined nếu không đặt). */
export function sidCookie(res: { headers: Headers }): string | undefined {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .find((c) => c.startsWith("sid="));
}

/** Gửi request thô (để test CSRF, JSON hỏng...). */
export function rawFetch(path: string, init: RequestInit = {}) {
  return SELF.fetch(`${BASE_URL}${path}`, init);
}

export interface ErrorJson {
  error: { code: string; message: string; details?: unknown };
}

export async function errorOf(res: { json(): Promise<unknown> }): Promise<ErrorJson["error"]> {
  return ((await res.json()) as ErrorJson).error;
}
