// Quy tắc 1: người dùng cửa hàng A không đọc/sửa được dữ liệu cửa hàng B.
// Các giai đoạn sau thêm ca kiểm tra vào đây khi có route mới (hàng hóa, khách, chứng từ...).
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { errorOf, rawFetch } from "../helpers/api";
import { contactInput, createContact, createProduct, productInput } from "../helpers/catalog";
import { purchase, purchaseInput, saleInput, sell } from "../helpers/sales";
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

describe("cô lập bán hàng và chứng từ (giai đoạn 05)", () => {
  it("B không bán được hàng của A, không ghi nợ cho khách của A, không xem/hủy hóa đơn của A", async () => {
    const { a, b } = await createTwoStores();
    const p = await createProduct(a.owner, { openingStock: 10_000 });
    const kh = await createContact(a.owner);
    const line = { productId: p.id, unitName: "Chai", qty: 1_000, unitPrice: 38_000 };
    const doc = await sell(a.owner, saleInput([line], { contactId: kh.id, paid: 0 }));

    const sellA = await b.owner.api.sales.$post({ json: saleInput([line]) });
    expect((await errorOf(sellA)).code).toBe("NOT_FOUND");
    const own = await createProduct(b.owner, { openingStock: 10_000 });
    const useContact = await b.owner.api.sales.$post({
      json: saleInput([{ ...line, productId: own.id }], { contactId: kh.id, paid: 0 }),
    });
    expect((await errorOf(useContact)).code).toBe("INVALID_CONTACT");

    expect((await b.owner.api.documents[":id"].$get({ param: { id: doc.id } })).status).toBe(404);
    const cancel = await b.owner.api.documents[":id"].cancel.$post({ param: { id: doc.id } });
    expect(cancel.status).toBe(404);
    const list = await (await b.owner.api.documents.$get({ query: { type: "sale" } })).json();
    expect(list.items).toEqual([]);

    // Bộ đếm HD riêng: hóa đơn đầu tiên của B vẫn là HD000001.
    const first = await sell(b.owner, saleInput([{ ...line, productId: own.id }]));
    expect(first.code).toBe("HD000001");
    // A không bị ảnh hưởng.
    const still = await (await a.owner.api.documents[":id"].$get({ param: { id: doc.id } })).json();
    expect(still).toMatchObject({ status: "completed", contact: { debt: 38_000 } });
  });

  it("idempotencyKey tính riêng từng cửa hàng", async () => {
    const { a, b } = await createTwoStores();
    const pa = await createProduct(a.owner, { openingStock: 10_000 });
    const pb = await createProduct(b.owner, { openingStock: 10_000 });
    const key = crypto.randomUUID();
    const line = { unitName: "Chai", qty: 1_000, unitPrice: 38_000 };
    const da = await sell(
      a.owner,
      saleInput([{ ...line, productId: pa.id }], { idempotencyKey: key }),
    );
    const db2 = await sell(
      b.owner,
      saleInput([{ ...line, productId: pb.id }], { idempotencyKey: key }),
    );
    expect(db2.id).not.toBe(da.id);
  });
});

describe("cô lập nhập hàng và kiểm kho (giai đoạn 06)", () => {
  it("B không nhập hàng của A, không dùng NCC của A, không xem/sửa/hoàn thành phiếu của A", async () => {
    const { a, b } = await createTwoStores();
    const p = await createProduct(a.owner, { openingStock: 5_000 });
    const ncc = await createContact(a.owner, { type: "supplier", name: "NCC A" });
    const line = { productId: p.id, unitName: "Chai", qty: 1_000, unitPrice: 30_000 };
    const draft = await purchase(a.owner, purchaseInput([line], { status: "draft" }));

    const foreign = await b.owner.api.purchases.$post({ json: purchaseInput([line]) });
    expect((await errorOf(foreign)).code).toBe("NOT_FOUND");
    const own = await createProduct(b.owner);
    const useNcc = await b.owner.api.purchases.$post({
      json: purchaseInput([{ ...line, productId: own.id }], { contactId: ncc.id, paid: 0 }),
    });
    expect((await errorOf(useNcc)).code).toBe("INVALID_CONTACT");
    const put = await b.owner.api.purchases[":id"].$put({
      param: { id: draft.id },
      json: purchaseInput([{ ...line, productId: own.id }]),
    });
    expect(put.status).toBe(404);
    const complete = await b.owner.api.purchases[":id"].complete.$post({ param: { id: draft.id } });
    expect(complete.status).toBe(404);

    const count = await (
      await a.owner.api["stock-counts"].$post({ json: { productIds: [p.id] } })
    ).json();
    const sc = b.owner.api["stock-counts"][":id"];
    expect((await sc.$get({ param: { id: count.id } })).status).toBe(404);
    const lines = await sc.lines.$patch({
      param: { id: count.id },
      json: { lines: [{ lineId: count.lines[0]!.id, actualQty: 0 }] },
    });
    expect(lines.status).toBe(404);
    expect((await sc.complete.$post({ param: { id: count.id } })).status).toBe(404);
    const withForeign = await b.owner.api["stock-counts"].$post({ json: { productIds: [p.id] } });
    expect(withForeign.status).toBe(404);

    // Dữ liệu A không đổi.
    const still = await (await a.owner.api.products[":id"].$get({ param: { id: p.id } })).json();
    expect(still.stock).toBe(5_000);
  });
});

describe("cô lập thu chi, sổ nợ, báo cáo (giai đoạn 07)", () => {
  it("B không thu nợ/trả nợ đối tác của A, không xem/hủy phiếu, sổ nợ, số liệu của A", async () => {
    const { a, b } = await createTwoStores();
    const p = await createProduct(a.owner, { openingStock: 10_000 });
    const lan = await createContact(a.owner);
    await sell(
      a.owner,
      saleInput([{ productId: p.id, unitName: "Chai", qty: 1_000, unitPrice: 38_000 }], {
        contactId: lan.id,
        paid: 0,
      }),
    );
    const pt = await (
      await a.staff.api.payments.$post({
        json: {
          idempotencyKey: crypto.randomUUID(),
          type: "receipt",
          contactId: lan.id,
          amount: 8_000,
          method: "cash",
          note: null,
        },
      })
    ).json();

    const foreign = await b.staff.api.payments.$post({
      json: {
        idempotencyKey: crypto.randomUUID(),
        type: "receipt",
        contactId: lan.id,
        amount: 1_000,
        method: "cash",
        note: null,
      },
    });
    expect((await errorOf(foreign)).code).toBe("INVALID_CONTACT");
    expect((await b.owner.api.payments[":id"].$get({ param: { id: pt.id } })).status).toBe(404);
    expect((await b.owner.api.payments[":id"].cancel.$post({ param: { id: pt.id } })).status).toBe(
      404,
    );
    const ledger = await b.staff.api.contacts[":id"]["debt-entries"].$get({
      param: { id: lan.id },
      query: {},
    });
    expect(ledger.status).toBe(404);
    const debts = await (await b.staff.api.debts.summary.$get()).json();
    expect(debts.receivable.amount).toBe(0);
    expect(debts.collectedThisMonth.amount).toBe(0);
    const ov = await (await b.owner.api.reports.overview.$get({ query: {} })).json();
    expect(ov.revenue).toBe(0);

    const mine = await (await a.owner.api.debts.summary.$get()).json();
    expect(mine.receivable).toEqual({ amount: 30_000, customers: 1 });
  });
});
