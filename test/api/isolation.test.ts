// Quy tắc 1: người dùng cửa hàng A không đọc/sửa được dữ liệu cửa hàng B.
// Các giai đoạn sau thêm ca kiểm tra vào đây khi có route mới (hàng hóa, khách, chứng từ...).
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { errorOf, rawFetch } from "../helpers/api";
import { contactInput, createContact, createProduct, productInput } from "../helpers/catalog";
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

describe("cô lập hàng hóa, nhóm hàng, danh bạ, ảnh (giai đoạn 04)", () => {
  it("cửa hàng B không thấy, không sửa được hàng của A", async () => {
    const { a, b } = await createTwoStores();
    const p = await createProduct(a.owner, {
      barcode: "8934",
      openingStock: 1_000,
      units: [{ name: "Thùng", factor: 12, salePrice: null, barcode: "18934" }],
    });
    const api = b.owner.api.products;

    const list = await (await api.$get({ query: {} })).json();
    expect(list.items).toEqual([]);
    expect(list.counts.all).toBe(0);
    expect(list.stockValue).toBe(0);
    expect((await api[":id"].$get({ param: { id: p.id } })).status).toBe(404);
    expect((await api[":id"].movements.$get({ param: { id: p.id }, query: {} })).status).toBe(404);
    for (const barcode of ["8934", "18934"]) {
      expect((await api.lookup.$get({ query: { barcode } })).status).toBe(404);
    }
    expect((await (await api.pos.$get()).json()).items).toEqual([]);
    const put = await api[":id"].$put({
      param: { id: p.id },
      json: productInput({ name: "B sửa" }),
    });
    expect(put.status).toBe(404);

    // Mã, mã vạch và bộ đếm riêng từng cửa hàng: B dùng lại được.
    const own = await createProduct(b.owner, { barcode: "8934" });
    expect(own.code).toBe("SP000001");
    const stillA = await (await a.owner.api.products[":id"].$get({ param: { id: p.id } })).json();
    expect(stillA).toMatchObject({ name: "Nước mắm 500ml", stock: 1_000 });
  });

  it("không dùng được nhóm hàng của cửa hàng khác, không xóa/sửa được nó", async () => {
    const { a, b } = await createTwoStores();
    const cat = await (await a.owner.api.categories.$post({ json: { name: "Nhóm A" } })).json();
    const res = await b.owner.api.products.$post({ json: productInput({ categoryId: cat.id }) });
    expect((await errorOf(res)).code).toBe("INVALID_CATEGORY");
    const del = await b.owner.api.categories[":id"].$delete({ param: { id: cat.id } });
    expect(del.status).toBe(404);
    const patch = await b.owner.api.categories[":id"].$patch({
      param: { id: cat.id },
      json: { name: "B sửa" },
    });
    expect(patch.status).toBe(404);
    const names = (await (await b.owner.api.categories.$get()).json()).items.map((c) => c.name);
    expect(names).not.toContain("Nhóm A");
  });

  it("danh bạ: B không thấy, không sửa được khách của A", async () => {
    const { a, b } = await createTwoStores();
    const kh = await createContact(a.owner);
    const api = b.staff.api.contacts;
    const list = await (await api.$get({ query: { type: "customer" } })).json();
    expect(list.items).toEqual([]);
    expect((await api[":id"].$get({ param: { id: kh.id } })).status).toBe(404);
    const put = await api[":id"].$put({
      param: { id: kh.id },
      json: contactInput({ name: "B sửa" }),
    });
    expect(put.status).toBe(404);
  });

  it("ảnh: B không đọc được ảnh của A dù biết key", async () => {
    const { a, b } = await createTwoStores();
    const key = `${a.storeId}/products/x-1.png`;
    await env.IMAGES.put(key, new Uint8Array([1, 2, 3]));
    const own = await rawFetch(`/api/images/${key}`, { headers: { Cookie: a.owner.cookie } });
    expect(own.status).toBe(200);
    // %2E%2E để ".." tới được server (URL parser không gộp đường dẫn).
    for (const path of [key, `${b.storeId}/%2E%2E/${key}`]) {
      const res = await rawFetch(`/api/images/${path}`, { headers: { Cookie: b.owner.cookie } });
      expect(res.status).toBe(404);
    }
  });
});
