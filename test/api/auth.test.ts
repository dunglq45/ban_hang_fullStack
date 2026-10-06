import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/worker/db/client";
import { categories, counters, loginAttempts, sessions } from "../../src/worker/db/schema";
import { sha256Hex } from "../../src/worker/lib/token";
import { client, errorOf, sidCookie } from "../helpers/api";
import { addStaff, createStore, login, TEST_PASSWORD, uniquePhone } from "../helpers/stores";

const db = createDatabase(env.DB);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function sessionRow(cookie: string) {
  const id = await sha256Hex(cookie.slice("sid=".length));
  return db.select().from(sessions).where(eq(sessions.id, id)).get();
}

describe("đăng ký → đăng nhập → me", () => {
  it("đăng ký tạo cửa hàng, chủ, bộ đếm, nhóm hàng mặc định và đăng nhập luôn", async () => {
    const phone = uniquePhone();
    const res = await client().auth.register.$post({
      json: { storeName: "Tạp hóa Lan", ownerName: "Chị Lan", phone, password: TEST_PASSWORD },
    });
    expect(res.status).toBe(201);
    const cookie = sidCookie(res)!;
    expect(cookie).toBeDefined();
    const setCookie = res.headers.get("Set-Cookie")!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);

    const me = await client(cookie).auth.me.$get();
    expect(me.status).toBe(200);
    const body = await me.json();
    if (!("user" in body)) throw new Error("thiếu user");
    expect(body.user).toEqual({ id: expect.any(String), name: "Chị Lan", phone, role: "owner" });
    expect(body.store).toMatchObject({ name: "Tạp hóa Lan", phone });
    expect(JSON.stringify(body)).not.toContain("pbkdf2");

    const storeId = body.store.id;
    const kinds = await db.select().from(counters).where(eq(counters.storeId, storeId));
    expect(kinds.map((k) => k.kind).sort()).toEqual(
      ["HD", "KH", "KK", "NCC", "PC", "PN", "PT", "SP"].sort(),
    );
    expect(kinds.every((k) => k.value === 0)).toBe(true);
    const cats = await db.select().from(categories).where(eq(categories.storeId, storeId));
    expect(cats.length).toBeGreaterThan(0);

    // DB chỉ lưu sha256(token), không lưu token.
    const row = await sessionRow(cookie);
    expect(row?.storeId).toBe(storeId);
    expect(row?.id).not.toBe(cookie.slice(4));
  });

  it("đăng nhập bằng SĐT có khoảng trắng/dấu chấm vẫn được", async () => {
    const store = await createStore();
    const p = store.owner.phone;
    const spaced = `${p.slice(0, 4)} ${p.slice(4, 7)}.${p.slice(7)}`;
    const cookie = await login(spaced);
    const me = await client(cookie).auth.me.$get();
    expect(me.status).toBe(200);
  });

  it("SĐT đã đăng ký → PHONE_TAKEN, không tạo cửa hàng thừa", async () => {
    const store = await createStore();
    const before = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM stores`);
    const res = await client().auth.register.$post({
      json: { storeName: "Khác", ownerName: "Khác", phone: store.owner.phone, password: "123456" },
    });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("PHONE_TAKEN");
    const after = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM stores`);
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it("dữ liệu sai → 400 VALIDATION_ERROR kèm danh sách trường", async () => {
    const res = await client().auth.register.$post({
      json: { storeName: "", ownerName: "A", phone: "12345", password: "1" },
    });
    expect(res.status).toBe(400);
    const err = await errorOf(res);
    expect(err.code).toBe("VALIDATION_ERROR");
    const fields = (err.details as { fields: { path: string; message: string }[] }).fields;
    expect(fields.map((f) => f.path).sort()).toEqual(["password", "phone", "storeName"]);
    expect(fields.find((f) => f.path === "phone")?.message).toBe(
      "Số điện thoại gồm 10 số, bắt đầu bằng 0",
    );
  });

  it("sai mật khẩu và SĐT không tồn tại đều báo INVALID_CREDENTIALS cùng một câu", async () => {
    const store = await createStore();
    const wrong = await client().auth.login.$post({
      json: { phone: store.owner.phone, password: "sai-mat-khau", remember: false },
    });
    const unknown = await client().auth.login.$post({
      json: { phone: uniquePhone(), password: "sai-mat-khau", remember: false },
    });
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(await errorOf(res)).toEqual({
        code: "INVALID_CREDENTIALS",
        message: "Số điện thoại hoặc mật khẩu không đúng",
      });
    }
  });

  it("chưa đăng nhập hoặc cookie giả → 401 UNAUTHORIZED", async () => {
    const res = await client().auth.me.$get();
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("UNAUTHORIZED");
    const fake = await client("sid=khong-ton-tai").auth.me.$get();
    expect(fake.status).toBe(401);
  });

  it("đăng xuất xóa phiên trong DB, cookie cũ hết dùng được", async () => {
    const store = await createStore();
    const cookie = await login(store.owner.phone);
    const res = await client(cookie).auth.logout.$post();
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toMatch(/sid=;.*Max-Age=0/i);
    expect(await sessionRow(cookie)).toBeUndefined();
    expect((await client(cookie).auth.me.$get()).status).toBe(401);
    // Phiên khác (lúc đăng ký) không bị ảnh hưởng.
    expect((await store.owner.api.auth.me.$get()).status).toBe(200);
  });
});

describe("giới hạn đăng nhập sai", () => {
  it("sai 5 lần thì lần thứ 6 bị chặn TOO_MANY_ATTEMPTS, kể cả khi đúng mật khẩu", async () => {
    const store = await createStore();
    const phone = store.owner.phone;
    for (let i = 0; i < 5; i++) {
      const res = await client().auth.login.$post({
        json: { phone, password: "sai", remember: false },
      });
      expect((await errorOf(res)).code).toBe("INVALID_CREDENTIALS");
    }
    const sixth = await client().auth.login.$post({
      json: { phone, password: "sai", remember: false },
    });
    expect(sixth.status).toBe(429);
    expect((await errorOf(sixth)).code).toBe("TOO_MANY_ATTEMPTS");

    const correct = await client().auth.login.$post({
      json: { phone, password: TEST_PASSWORD, remember: false },
    });
    expect((await errorOf(correct)).code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("lần sai cũ hơn 15 phút không tính; đăng nhập đúng thì xóa lần sai", async () => {
    const store = await createStore();
    const phone = store.owner.phone;
    const old = Date.now() - 16 * 60 * 1000;
    await db.insert(loginAttempts).values(Array.from({ length: 5 }, () => ({ phone, at: old })));
    await login(phone);

    await db
      .insert(loginAttempts)
      .values(Array.from({ length: 4 }, () => ({ phone, at: Date.now() })));
    await login(phone);
    const left = await db.select().from(loginAttempts).where(eq(loginAttempts.phone, phone));
    expect(left).toEqual([]);
  });
});

describe("cookie và gia hạn phiên", () => {
  it("remember = false: cookie phiên (không Max-Age); remember = true: 30 ngày", async () => {
    const store = await createStore();
    const plain = await client().auth.login.$post({
      json: { phone: store.owner.phone, password: TEST_PASSWORD, remember: false },
    });
    expect(plain.headers.get("Set-Cookie")).not.toMatch(/Max-Age/i);
    const kept = await client().auth.login.$post({
      json: { phone: store.owner.phone, password: TEST_PASSWORD, remember: true },
    });
    expect(kept.headers.get("Set-Cookie")).toMatch(/Max-Age=2592000/);
  });

  it("còn dưới 7 ngày thì gia hạn thêm 30 ngày; còn nhiều thì không ghi DB", async () => {
    const store = await createStore();
    const cookie = await login(store.owner.phone, TEST_PASSWORD, true);
    const row = (await sessionRow(cookie))!;

    const untouched = await client(cookie).auth.me.$get();
    expect(untouched.headers.get("Set-Cookie")).toBeNull();
    expect((await sessionRow(cookie))!.expiresAt).toBe(row.expiresAt);

    await db
      .update(sessions)
      .set({ expiresAt: Date.now() + 2 * DAY })
      .where(eq(sessions.id, row.id));
    const renewed = await client(cookie).auth.me.$get();
    expect(renewed.status).toBe(200);
    expect(renewed.headers.get("Set-Cookie")).toMatch(/Max-Age=2592000/);
    expect((await sessionRow(cookie))!.expiresAt).toBeGreaterThan(Date.now() + 29 * DAY);
  });

  it("phiên không ghi nhớ: sống 1 ngày ở server, còn < 12 giờ thì gia hạn, không đặt lại cookie", async () => {
    const store = await createStore();
    const cookie = await login(store.owner.phone);
    const row = (await sessionRow(cookie))!;
    expect(row.expiresAt - row.createdAt).toBe(DAY);

    await db
      .update(sessions)
      .set({ expiresAt: Date.now() + 6 * HOUR })
      .where(eq(sessions.id, row.id));
    const res = await client(cookie).auth.me.$get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBeNull();
    const renewed = (await sessionRow(cookie))!.expiresAt;
    expect(renewed).toBeGreaterThan(Date.now() + 23 * HOUR);
    expect(renewed).toBeLessThanOrEqual(Date.now() + DAY);
  });

  it("phiên hết hạn → 401 và xóa cookie", async () => {
    const store = await createStore();
    const cookie = await login(store.owner.phone);
    const row = (await sessionRow(cookie))!;
    await db
      .update(sessions)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(sessions.id, row.id));
    const res = await client(cookie).auth.me.$get();
    expect(res.status).toBe(401);
    expect(res.headers.get("Set-Cookie")).toMatch(/sid=;/);
  });
});

describe("tài khoản bị khóa", () => {
  it("khóa nhân viên: phiên đang mở mất hiệu lực, đăng nhập lại → ACCOUNT_DISABLED", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    expect((await staff.api.auth.me.$get()).status).toBe(200);

    const res = await store.owner.api.users[":id"].$patch({
      param: { id: staff.id },
      json: { isActive: false },
    });
    expect(res.status).toBe(200);
    expect((await staff.api.auth.me.$get()).status).toBe(401);

    const again = await client().auth.login.$post({
      json: { phone: staff.phone, password: TEST_PASSWORD, remember: false },
    });
    expect(again.status).toBe(403);
    expect((await errorOf(again)).code).toBe("ACCOUNT_DISABLED");

    // Khóa sai mật khẩu vẫn chỉ báo INVALID_CREDENTIALS (không lộ tài khoản bị khóa).
    const wrong = await client().auth.login.$post({
      json: { phone: staff.phone, password: "sai", remember: false },
    });
    expect((await errorOf(wrong)).code).toBe("INVALID_CREDENTIALS");
  });
});
