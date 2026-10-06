// Quy tắc 1: người dùng cửa hàng A không đọc/sửa được dữ liệu cửa hàng B.
// Các giai đoạn sau thêm ca kiểm tra vào đây khi có route mới (hàng hóa, khách, chứng từ...).
import { describe, expect, it } from "vitest";
import { createTwoStores } from "../helpers/stores";

describe("cô lập dữ liệu giữa hai cửa hàng", () => {
  it("me và store trả về đúng cửa hàng của người đăng nhập", async () => {
    const { a, b } = await createTwoStores();
    for (const s of [a, b]) {
      const me = await s.staff.api.auth.me.$get();
      const body = await me.json();
      if (!("store" in body)) throw new Error("me thất bại");
      expect(body.store.id).toBe(s.storeId);
      const store = await s.owner.api.store.$get();
      expect(await store.json()).toMatchObject({ id: s.storeId, name: s.name });
    }
  });

  it("danh sách nhân viên chỉ có người của cửa hàng mình", async () => {
    const { a, b } = await createTwoStores();
    const res = await a.owner.api.users.$get();
    const { items } = await res.json();
    const ids = items.map((u) => u.id);
    expect(ids.sort()).toEqual([a.owner.id, a.staff.id].sort());
    expect(ids).not.toContain(b.owner.id);
    expect(ids).not.toContain(b.staff.id);
  });

  it("owner A sửa/khóa nhân viên của B → NOT_FOUND, dữ liệu B không đổi", async () => {
    const { a, b } = await createTwoStores();
    const res = await a.owner.api.users[":id"].$patch({
      param: { id: b.staff.id },
      json: { name: "Bị sửa", isActive: false, password: "hack123" },
    });
    expect(res.status).toBe(404);
    expect((await b.staff.api.auth.me.$get()).status).toBe(200);
    const list = await (await b.owner.api.users.$get()).json();
    expect(list.items.find((u) => u.id === b.staff.id)).toMatchObject({
      name: "Nhân viên",
      isActive: true,
    });
  });

  it("sửa thông tin cửa hàng A không ảnh hưởng cửa hàng B", async () => {
    const { a, b } = await createTwoStores();
    await a.owner.api.store.$put({
      json: { name: "A đổi tên", phone: null, address: null, receiptFooter: null },
    });
    const store = await (await b.owner.api.store.$get()).json();
    expect(store).toMatchObject({ id: b.storeId, name: "Cửa hàng B" });
  });
});
