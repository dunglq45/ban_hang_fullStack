import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/worker/db/client";
import { loginAttempts, sessions } from "../../src/worker/db/schema";
import worker from "../../src/worker/index";
import { rawFetch } from "../helpers/api";
import { createStore, uniquePhone } from "../helpers/stores";

const db = createDatabase(env.DB);

describe("Cron dọn dữ liệu đăng nhập", () => {
  it("xóa lần thử quá 15 phút và phiên hết hạn, giữ phần còn hiệu lực", async () => {
    const store = await createStore();
    const phone = uniquePhone();
    const now = Date.now();
    await db.insert(loginAttempts).values([
      { phone, at: now - 16 * 60 * 1000 },
      { phone, at: now - 60 * 1000 },
    ]);
    await db.insert(sessions).values({
      id: "het-han",
      userId: store.owner.id,
      storeId: store.storeId,
      expiresAt: now - 1,
      createdAt: now - 1000,
    });

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "0 20 * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);

    const attempts = await db.select().from(loginAttempts).where(eq(loginAttempts.phone, phone));
    expect(attempts.map((a) => a.at)).toEqual([now - 60 * 1000]);
    const left = await db
      .select()
      .from(sessions)
      .where(inArray(sessions.id, ["het-han"]));
    expect(left).toEqual([]);
    // Phiên đang dùng của chủ cửa hàng vẫn còn.
    expect((await store.owner.api.auth.me.$get()).status).toBe(200);
  });
});

describe("giới hạn tần suất theo IP", () => {
  function register(ip: string) {
    return rawFetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
        "CF-Connecting-IP": ip,
      },
      body: JSON.stringify({
        storeName: "Spam",
        ownerName: "Spam",
        phone: uniquePhone(),
        password: "123456",
      }),
    });
  }

  it("một IP đăng ký quá 5 lần / phút → 429 RATE_LIMITED; IP khác không bị ảnh hưởng", async () => {
    const ip = "203.0.113.7";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await register(ip)).status);
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    const blocked = await register(ip);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect((await register("203.0.113.8")).status).toBe(201);
  });
});
