import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("trả về ok", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("D1 local hoạt động", async () => {
    const row = await env.DB.prepare("SELECT 1 AS one").first<{
      one: number;
    }>();
    expect(row?.one).toBe(1);
  });

  it("đường dẫn API không tồn tại trả 404 JSON", async () => {
    const res = await SELF.fetch("https://example.com/api/khong-co");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});
