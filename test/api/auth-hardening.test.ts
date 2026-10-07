// Các ca bảo mật bổ sung sau review giai đoạn 03.
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase, getDb } from "../../src/worker/db/client";
import { AppError } from "../../src/worker/lib/errors";
import { updateUser } from "../../src/worker/services/users";
import { sessions } from "../../src/worker/db/schema";
import { sha256Hex } from "../../src/worker/lib/token";
import { client, errorOf, rawFetch, sidCookie } from "../helpers/api";
import { addStaff, createStore, login, TEST_PASSWORD } from "../helpers/stores";

const db = createDatabase(env.DB);

async function sessionExists(cookie: string) {
  const id = await sha256Hex(cookie.slice("sid=".length));
  return (await db.select().from(sessions).where(eq(sessions.id, id)).get()) !== undefined;
}

describe("giới hạn đăng nhập khi gửi song song", () => {
  it("10 request sai cùng lúc: tối đa 5 request được kiểm tra mật khẩu", async () => {
    const store = await createStore();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        client().auth.login.$post({
          json: { phone: store.owner.phone, password: "sai", remember: false },
        }),
      ),
    );
    const codes = await Promise.all(results.map(async (r) => (await errorOf(r)).code));
    expect(codes.filter((c) => c === "INVALID_CREDENTIALS").length).toBeLessThanOrEqual(5);
    expect(codes.filter((c) => c === "TOO_MANY_ATTEMPTS").length).toBeGreaterThanOrEqual(5);
  });
});

describe("phiên khi đăng nhập lại và đổi mật khẩu", () => {
  it("đăng nhập khi đang có phiên trên trình duyệt thì phiên cũ bị xóa", async () => {
    const store = await createStore();
    const old = store.owner.cookie;
    const res = await client(old).auth.login.$post({
      json: { phone: store.owner.phone, password: TEST_PASSWORD, remember: false },
    });
    expect(res.status).toBe(200);
    expect(await sessionExists(old)).toBe(false);
    expect(await sessionExists(sidCookie(res)!)).toBe(true);
  });

  it("tự đổi mật khẩu phải nhập đúng mật khẩu hiện tại", async () => {
    const store = await createStore();
    const self = store.owner.api.users[":id"];
    for (const currentPassword of [undefined, "sai-mat-khau"]) {
      const res = await self.$patch({
        param: { id: store.owner.id },
        json: { password: "mat-khau-moi", currentPassword },
      });
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe("WRONG_PASSWORD");
    }
    await login(store.owner.phone);
  });

  it("chủ đặt lại mật khẩu cho nhân viên thì không cần mật khẩu cũ", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const res = await store.owner.api.users[":id"].$patch({
      param: { id: staff.id },
      json: { password: "mat-khau-moi" },
    });
    expect(res.status).toBe(200);
  });

  it("chủ tự đổi mật khẩu: giữ phiên đang dùng, đăng xuất thiết bị khác", async () => {
    const store = await createStore();
    const other = await login(store.owner.phone);
    const res = await store.owner.api.users[":id"].$patch({
      param: { id: store.owner.id },
      json: { password: "mat-khau-moi", currentPassword: TEST_PASSWORD },
    });
    expect(res.status).toBe(200);
    expect((await store.owner.api.auth.me.$get()).status).toBe(200);
    expect((await client(other).auth.me.$get()).status).toBe(401);
  });

  it("chỉ đổi tên thì không ai bị đăng xuất", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    await store.owner.api.users[":id"].$patch({ param: { id: staff.id }, json: { name: "Mới" } });
    expect((await staff.api.auth.me.$get()).status).toBe(200);
  });
});

describe("luôn còn ít nhất một chủ đang hoạt động", () => {
  it("chủ thứ hai không thể khóa hay hạ quyền chủ cuối cùng còn lại", async () => {
    const store = await createStore();
    const second = await addStaff(store, "Chủ hai");
    await store.owner.api.users[":id"].$patch({
      param: { id: second.id },
      json: { role: "owner" },
    });

    // Chủ hai khóa chủ gốc: được, vì chủ hai vẫn còn.
    const lock = await second.api.users[":id"].$patch({
      param: { id: store.owner.id },
      json: { isActive: false },
    });
    expect(lock.status).toBe(200);

    // Mở lại rồi thử hạ quyền lẫn nhau song song: cửa hàng không được hết chủ.
    await second.api.users[":id"].$patch({
      param: { id: store.owner.id },
      json: { isActive: true },
    });
    const ownerCookie = await login(store.owner.phone);
    const [x, y] = await Promise.all([
      client(ownerCookie).users[":id"].$patch({
        param: { id: second.id },
        json: { role: "staff" },
      }),
      second.api.users[":id"].$patch({ param: { id: store.owner.id }, json: { role: "staff" } }),
    ]);
    const statuses = [x.status, y.status].sort();
    // Request nào tới sau thì thấy mình là chủ cuối (LAST_OWNER) hoặc đã mất quyền (FORBIDDEN).
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);

    const list = await (await client(ownerCookie).users.$get()).json();
    const owners = "items" in list ? list.items : [];
    if (owners.length > 0) {
      expect(owners.filter((u) => u.role === "owner" && u.isActive).length).toBeGreaterThan(0);
    }
  });

  it("chủ hoạt động duy nhất không bị khóa/hạ quyền → LAST_OWNER (actor đã mất quyền do race)", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const storeDb = getDb(env, store.storeId);
    // Mô phỏng request của một chủ khác vừa bị hạ quyền ngay trước đó: middleware đã cho qua,
    // nhưng trong DB lúc UPDATE chỉ còn store.owner là chủ hoạt động.
    const staleActor = { id: staff.id, name: "Chủ cũ", phone: staff.phone, role: "owner" as const };
    for (const input of [{ role: "staff" as const }, { isActive: false }]) {
      const err = await updateUser(storeDb, staleActor, "sid-cu", store.owner.id, input).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("LAST_OWNER");
    }
    // Không có gì bị đổi, chủ vẫn đăng nhập bình thường.
    expect((await store.owner.api.auth.me.$get()).status).toBe(200);
  });
});

describe("CSRF: có body nhưng không khai báo Content-Type", () => {
  it("→ 415", async () => {
    const res = await rawFetch("/api/auth/login", {
      method: "POST",
      headers: { "X-Requested-With": "fetch" },
      body: new Blob([JSON.stringify({ phone: "0900000009", password: "x" })]),
    });
    expect(res.status).toBe(415);
  });
});

describe("PUT /api/auth/password (tự đổi mật khẩu)", () => {
  it("nhân viên tự đổi được: giữ phiên đang dùng, đăng xuất thiết bị khác, mật khẩu mới dùng được", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const other = await login(staff.phone);
    const res = await staff.api.auth.password.$put({
      json: { currentPassword: TEST_PASSWORD, password: "mat-khau-moi" },
    });
    expect(res.status).toBe(200);
    expect((await staff.api.auth.me.$get()).status).toBe(200);
    expect((await client(other).auth.me.$get()).status).toBe(401);
    const relogin = await client().auth.login.$post({
      json: { phone: staff.phone, password: "mat-khau-moi", remember: false },
    });
    expect(relogin.status).toBe(200);
  });

  it("chủ cửa hàng cũng tự đổi được qua endpoint này", async () => {
    const store = await createStore();
    const res = await store.owner.api.auth.password.$put({
      json: { currentPassword: TEST_PASSWORD, password: "mat-khau-moi" },
    });
    expect(res.status).toBe(200);
    const relogin = await client().auth.login.$post({
      json: { phone: store.owner.phone, password: "mat-khau-moi", remember: false },
    });
    expect(relogin.status).toBe(200);
  });

  it("sai mật khẩu hiện tại → WRONG_PASSWORD, mật khẩu cũ vẫn dùng được", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const res = await staff.api.auth.password.$put({
      json: { currentPassword: "sai-mat-khau", password: "mat-khau-moi" },
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("WRONG_PASSWORD");
    await login(staff.phone);
  });

  it("thiếu mật khẩu hiện tại hoặc mật khẩu mới quá ngắn → VALIDATION_ERROR", async () => {
    const store = await createStore();
    const bad = await store.owner.api.auth.password.$put({
      json: { currentPassword: "", password: "123" },
    });
    expect(bad.status).toBe(400);
    expect((await errorOf(bad)).code).toBe("VALIDATION_ERROR");
  });

  it("chưa đăng nhập → 401", async () => {
    const res = await client().auth.password.$put({
      json: { currentPassword: TEST_PASSWORD, password: "mat-khau-moi" },
    });
    expect(res.status).toBe(401);
  });
});
