import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/worker/db/client";
import { contacts } from "../../src/worker/db/schema";
import { errorOf } from "../helpers/api";
import { contactInput, createContact, createProduct } from "../helpers/catalog";
import { addStaff, createStore } from "../helpers/stores";

const db = createDatabase(env.DB);
const DAY = 24 * 60 * 60 * 1000;

describe("nhóm hàng", () => {
  it("thêm, sửa, liệt kê kèm số mặt hàng; staff chỉ xem", async () => {
    const store = await createStore();
    const api = store.owner.api.categories;
    const created = await (await api.$post({ json: { name: "Bia rượu" } })).json();
    expect(created).toMatchObject({ name: "Bia rượu", productCount: 0 });
    await createProduct(store.owner, { categoryId: created.id });

    const renamed = await api[":id"].$patch({
      param: { id: created.id },
      json: { name: "Bia, rượu" },
    });
    expect(await renamed.json()).toMatchObject({ name: "Bia, rượu" });

    const staff = await addStaff(store);
    const list = await (await staff.api.categories.$get()).json();
    // 4 nhóm mặc định + 1 nhóm mới, nhóm mới đứng cuối.
    expect(list.items).toHaveLength(5);
    expect(list.items.at(-1)).toMatchObject({ name: "Bia, rượu", productCount: 1 });

    const denied = await staff.api.categories.$post({ json: { name: "X" } });
    expect(denied.status).toBe(403);
  });

  it("còn hàng (kể cả ngừng bán) thì không xóa được → CATEGORY_IN_USE; hết hàng thì xóa được", async () => {
    const store = await createStore();
    const api = store.owner.api.categories;
    const cat = await (await api.$post({ json: { name: "Tạm" } })).json();
    const p = await createProduct(store.owner, { categoryId: cat.id, isActive: false });

    const res = await api[":id"].$delete({ param: { id: cat.id } });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatchObject({
      code: "CATEGORY_IN_USE",
      details: { productCount: 1 },
    });

    await store.owner.api.products[":id"].$put({
      param: { id: p.id },
      json: {
        name: "Nước mắm 500ml",
        code: null,
        barcode: null,
        categoryId: null,
        baseUnit: "Chai",
        salePrice: 38_000,
      },
    });
    expect((await api[":id"].$delete({ param: { id: cat.id } })).status).toBe(200);
    expect((await api[":id"].$delete({ param: { id: cat.id } })).status).toBe(404);
  });
});

describe("khách hàng và nhà cung cấp", () => {
  it("mã tự sinh KH000001 / NCC000001 theo loại; staff tạo được", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const kh = await createContact(staff);
    const kh2 = await createContact(staff, { name: "Anh Tuấn", phone: null });
    const ncc = await createContact(store.owner, { type: "supplier", name: "Đại lý Hưng Thịnh" });
    expect([kh.code, kh2.code, ncc.code]).toEqual(["KH000001", "KH000002", "NCC000001"]);
    expect(kh).toMatchObject({ debt: 0, debtSince: null, phone: "0912345678" });

    const row = await db.select().from(contacts).where(eq(contacts.id, kh.id)).get();
    expect(row?.nameSearch).toBe("chi lan kh000001 0912345678");
  });

  it("tìm theo tên không dấu và SĐT, chỉ trong đúng loại", async () => {
    const store = await createStore();
    const lan = await createContact(store.owner);
    await createContact(store.owner, { name: "Cô Hoa", phone: "0987654321" });
    await createContact(store.owner, { type: "supplier", name: "Lan Anh NCC", phone: null });
    const api = store.owner.api.contacts;
    const byName = await (await api.$get({ query: { type: "customer", q: "chi lan" } })).json();
    expect(byName.items.map((c) => c.id)).toEqual([lan.id]);
    const byPhone = await (await api.$get({ query: { type: "customer", q: "0912" } })).json();
    expect(byPhone.items.map((c) => c.id)).toEqual([lan.id]);
  });

  it("lọc hasDebt, overdueDays và sắp xếp theo nợ", async () => {
    const store = await createStore();
    const now = Date.now();
    const a = await createContact(store.owner, { name: "A" });
    const b = await createContact(store.owner, { name: "B" });
    const c = await createContact(store.owner, { name: "C" });
    // Công nợ chỉ đổi qua chứng từ (giai đoạn 05–07); ở đây ghi thẳng DB để test lọc.
    await db
      .update(contacts)
      .set({ debt: 100_000, debtSince: now - 40 * DAY })
      .where(eq(contacts.id, a.id));
    await db
      .update(contacts)
      .set({ debt: 500_000, debtSince: now - 5 * DAY })
      .where(eq(contacts.id, b.id));

    const api = store.owner.api.contacts;
    const ids = async (query: Record<string, string>) =>
      (await (await api.$get({ query: { type: "customer", ...query } })).json()).items.map(
        (x) => x.id,
      );
    expect(await ids({ hasDebt: "true", sort: "debt_desc" })).toEqual([b.id, a.id]);
    expect(await ids({ hasDebt: "false" })).toEqual([c.id]);
    expect(await ids({ overdueDays: "30" })).toEqual([a.id]);
    expect(await ids({ sort: "debt_since_asc" })).toEqual([a.id, b.id, c.id]);
  });

  it("sửa thông tin không đổi loại, mã, công nợ; cập nhật name_search", async () => {
    const store = await createStore();
    const kh = await createContact(store.owner);
    await db.update(contacts).set({ debt: 50_000 }).where(eq(contacts.id, kh.id));
    const res = await store.owner.api.contacts[":id"].$put({
      param: { id: kh.id },
      json: {
        ...contactInput({ name: "Chị Lan Hương", phone: "0900111222" }),
        ...({ type: "supplier", code: "X", debt: 0 } as object),
      },
    });
    expect(await res.json()).toMatchObject({
      type: "customer",
      code: "KH000001",
      name: "Chị Lan Hương",
      debt: 50_000,
    });
    const found = await (
      await store.owner.api.contacts.$get({ query: { type: "customer", q: "huong" } })
    ).json();
    expect(found.items.map((x) => x.id)).toEqual([kh.id]);
  });

  it("SĐT sai định dạng → VALIDATION_ERROR; không tìm thấy → 404", async () => {
    const store = await createStore();
    const bad = await store.owner.api.contacts.$post({ json: contactInput({ phone: "12345" }) });
    expect((await errorOf(bad)).code).toBe("VALIDATION_ERROR");
    const missing = await store.owner.api.contacts[":id"].$get({ param: { id: "khong-co" } });
    expect(missing.status).toBe(404);
  });
});

describe("bổ sung sau review giai đoạn 04", () => {
  it("tên nhóm hàng trùng (không phân biệt dấu, hoa thường) → CATEGORY_NAME_TAKEN", async () => {
    const store = await createStore();
    const res = await store.owner.api.categories.$post({ json: { name: "DO UONG" } });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("CATEGORY_NAME_TAKEN");
  });

  it("danh bạ: trùng mã → CODE_TAKEN; mã nhập tay KH000010 đẩy bộ đếm lên", async () => {
    const store = await createStore();
    await createContact(store.owner, { code: "KH000010" });
    const next = await createContact(store.owner, { name: "Khách mới" });
    expect(next.code).toBe("KH000011");
    const dup = await store.owner.api.contacts.$post({ json: contactInput({ code: "KH000010" }) });
    expect(dup.status).toBe(409);
    expect((await errorOf(dup)).code).toBe("CODE_TAKEN");
  });

  it("staff không đặt được hạn mức nợ và trạng thái của khách", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const kh = await createContact(staff, { debtLimit: 5_000_000, isActive: false });
    expect(kh).toMatchObject({ debtLimit: null, isActive: true });

    await store.owner.api.contacts[":id"].$put({
      param: { id: kh.id },
      json: contactInput({ debtLimit: 1_000_000 }),
    });
    const res = await staff.api.contacts[":id"].$put({
      param: { id: kh.id },
      json: contactInput({ name: "Chị Lan (sửa)", debtLimit: null, isActive: false }),
    });
    expect(await res.json()).toMatchObject({
      name: "Chị Lan (sửa)",
      debtLimit: 1_000_000,
      isActive: true,
    });
  });

  it("tìm SĐT có khoảng trắng, dấu chấm", async () => {
    const store = await createStore();
    const kh = await createContact(store.owner);
    const found = await (
      await store.owner.api.contacts.$get({ query: { type: "customer", q: "0912 345.678" } })
    ).json();
    expect(found.items.map((x) => x.id)).toEqual([kh.id]);
  });
});
