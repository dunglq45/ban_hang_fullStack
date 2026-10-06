import { describe, expect, it } from "vitest";
import { client, errorOf } from "../helpers/api";
import { addStaff, createStore, login, TEST_PASSWORD } from "../helpers/stores";

describe("cửa hàng", () => {
  it("owner xem và sửa thông tin cửa hàng; chuỗi rỗng lưu thành null", async () => {
    const store = await createStore("Tạp hóa Cũ");
    const res = await store.owner.api.store.$put({
      json: {
        name: "  Tạp hóa Mới  ",
        phone: "028 3822 1234",
        address: "12 Lê Lợi",
        receiptFooter: "",
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: store.storeId,
      name: "Tạp hóa Mới",
      phone: "02838221234",
      address: "12 Lê Lợi",
      receiptFooter: null,
    });
    const get = await store.owner.api.store.$get();
    expect(await get.json()).toMatchObject({ name: "Tạp hóa Mới" });
  });
});

describe("nhân viên", () => {
  it("owner thêm nhân viên; danh sách không có password_hash", async () => {
    const store = await createStore();
    const staff = await addStaff(store, "Thu Hằng");
    const res = await store.owner.api.users.$get();
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.map((u) => u.id).sort()).toEqual([store.owner.id, staff.id].sort());
    expect(items.find((u) => u.id === staff.id)).toEqual({
      id: staff.id,
      name: "Thu Hằng",
      phone: staff.phone,
      role: "staff",
      isActive: true,
      createdAt: expect.any(Number),
    });
    expect(JSON.stringify(items)).not.toMatch(/pbkdf2|password/i);
  });

  it("thêm nhân viên trùng SĐT → PHONE_TAKEN", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const res = await store.owner.api.users.$post({
      json: { name: "Trùng", phone: staff.phone, password: "123456", role: "staff" },
    });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("PHONE_TAKEN");
  });

  it("đổi tên, vai trò; đặt lại mật khẩu thì đăng xuất người đó, mật khẩu mới dùng được", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const edit = await store.owner.api.users[":id"].$patch({
      param: { id: staff.id },
      json: { name: "Tên mới", role: "owner" },
    });
    expect(await edit.json()).toMatchObject({ name: "Tên mới", role: "owner" });
    expect((await staff.api.auth.me.$get()).status).toBe(200);

    const reset = await store.owner.api.users[":id"].$patch({
      param: { id: staff.id },
      json: { password: "mat-khau-moi" },
    });
    expect(reset.status).toBe(200);
    expect((await staff.api.auth.me.$get()).status).toBe(401);
    const old = await client().auth.login.$post({
      json: { phone: staff.phone, password: TEST_PASSWORD, remember: false },
    });
    expect(old.status).toBe(401);
    await login(staff.phone, "mat-khau-moi");
  });

  it("owner không tự khóa hay tự hạ quyền; vẫn tự đổi tên được", async () => {
    const store = await createStore();
    const users = store.owner.api.users[":id"];
    const id = store.owner.id;
    for (const json of [{ isActive: false }, { role: "staff" as const }]) {
      const res = await users.$patch({ param: { id }, json });
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe("CANNOT_MODIFY_SELF");
    }
    const rename = await users.$patch({ param: { id }, json: { name: "Chủ mới" } });
    expect(rename.status).toBe(200);
    expect((await store.owner.api.auth.me.$get()).status).toBe(200);
  });

  it("PATCH không có trường nào → VALIDATION_ERROR; id không tồn tại → NOT_FOUND", async () => {
    const store = await createStore();
    const empty = await store.owner.api.users[":id"].$patch({
      param: { id: store.owner.id },
      json: {},
    });
    expect((await errorOf(empty)).code).toBe("VALIDATION_ERROR");
    const missing = await store.owner.api.users[":id"].$patch({
      param: { id: "khong-co" },
      json: { name: "X" },
    });
    expect(missing.status).toBe(404);
  });
});

describe("phân quyền", () => {
  it("staff gọi route chỉ dành cho owner → 403 FORBIDDEN", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const calls = [
      staff.api.store.$get(),
      staff.api.store.$put({
        json: { name: "Đổi tên", phone: null, address: null, receiptFooter: null },
      }),
      staff.api.users.$get(),
      staff.api.users.$post({
        json: { name: "X", phone: "0911111111", password: "123456", role: "owner" },
      }),
      staff.api.users[":id"].$patch({ param: { id: staff.id }, json: { role: "owner" } }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect((await errorOf(res)).code).toBe("FORBIDDEN");
    }
    // Staff vẫn xem được thông tin của mình.
    const me = await staff.api.auth.me.$get();
    expect(me.status).toBe(200);
  });
});
