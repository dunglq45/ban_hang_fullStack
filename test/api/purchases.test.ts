import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/worker/db/client";
import {
  contacts,
  debtEntries,
  documentLines,
  documents,
  products,
  stockMovements,
} from "../../src/worker/db/schema";
import { allocateDiscount } from "../../src/worker/services/lines";
import { errorOf } from "../helpers/api";
import { createContact, createProduct } from "../helpers/catalog";
import { purchase, purchaseInput, saleInput, sell } from "../helpers/sales";
import { addStaff, createStore } from "../helpers/stores";

const db = createDatabase(env.DB);

async function productRow(id: string) {
  return (await db.select().from(products).where(eq(products.id, id)).get())!;
}
async function contactRow(id: string) {
  return (await db.select().from(contacts).where(eq(contacts.id, id)).get())!;
}

describe("phân bổ chiết khấu", () => {
  it("theo tỷ lệ thành tiền, tổng các phần đúng bằng chiết khấu", () => {
    expect(allocateDiscount([100_000, 200_000, 300_000], 60_000)).toEqual([10_000, 20_000, 30_000]);
    const shares = allocateDiscount([33_333, 33_333, 33_334], 10_001);
    expect(shares.reduce((s, x) => s + x, 0)).toBe(10_001);
    expect(allocateDiscount([1, 2], 0)).toEqual([0, 0]);
  });
});

describe("nhập hàng", () => {
  it("nhập 10 chai giá 30.000 khi tồn 10 chai giá vốn 20.000 → giá vốn 25.000, mã PN000001", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { costPrice: 20_000, openingStock: 10_000 });
    const doc = await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 10_000, unitPrice: 30_000 }]),
    );
    expect(doc).toMatchObject({
      type: "purchase",
      code: "PN000001",
      status: "completed",
      total: 300_000,
      paid: 300_000,
      debtAmount: 0,
    });
    expect(await productRow(p.id)).toMatchObject({ stock: 20_000, costPrice: 25_000 });
    const moves = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.documentId, doc.id));
    expect(moves).toMatchObject([
      { type: "purchase", qtyChange: 10_000, stockAfter: 20_000, unitCost: 30_000 },
    ]);
  });

  it("nhập khi tồn âm (allow_negative): công thức dùng MAX(stock, 0)", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, {
      costPrice: 20_000,
      allowNegative: true,
      openingStock: 1_000,
    });
    await sell(
      store.owner,
      saleInput([{ productId: p.id, unitName: "Chai", qty: 4_000, unitPrice: 38_000 }]),
    );
    expect((await productRow(p.id)).stock).toBe(-3_000);
    await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 10_000, unitPrice: 30_000 }]),
    );
    // MAX(-3, 0) = 0 → giá vốn = giá nhập; tồn = -3 + 10 = 7
    expect(await productRow(p.id)).toMatchObject({ stock: 7_000, costPrice: 30_000 });
  });

  it("nhập theo thùng, phân bổ chiết khấu phiếu → giá nhập thực / đơn vị cơ bản", async () => {
    const store = await createStore();
    const bia = await createProduct(store.owner, {
      name: "Bia",
      baseUnit: "Lon",
      costPrice: 0,
      units: [{ name: "Thùng", factor: 24, salePrice: null, barcode: null }],
    });
    const mi = await createProduct(store.owner, { name: "Mì", baseUnit: "Gói", costPrice: 0 });
    const doc = await purchase(
      store.owner,
      purchaseInput(
        [
          { productId: bia.id, unitName: "Thùng", qty: 2_000, unitPrice: 240_000 }, // 480.000
          { productId: mi.id, unitName: "Gói", qty: 30_000, unitPrice: 4_000 }, // 120.000
        ],
        { discount: 60_000 },
      ),
    );
    expect(doc).toMatchObject({ subtotal: 600_000, discount: 60_000, total: 540_000 });
    // Bia gánh 48.000 → 432.000 / 48 lon = 9.000; Mì gánh 12.000 → 108.000 / 30 gói = 3.600
    expect(await productRow(bia.id)).toMatchObject({ stock: 48_000, costPrice: 9_000 });
    expect(await productRow(mi.id)).toMatchObject({ stock: 30_000, costPrice: 3_600 });
    const lines = await db.select().from(documentLines).where(eq(documentLines.documentId, doc.id));
    expect(lines.map((l) => [l.unitName, l.factor, l.baseQty, l.lineTotal, l.costPrice])).toEqual(
      expect.arrayContaining([
        ["Thùng", 24, 48_000, 480_000, 9_000],
        ["Gói", 1, 30_000, 120_000, 3_600],
      ]),
    );
  });

  it("trả thiếu NCC → nợ NCC tăng, sổ nợ đúng; không chọn NCC → DEBT_REQUIRES_SUPPLIER", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner);
    const ncc = await createContact(store.owner, { type: "supplier", name: "Đại lý Hưng Thịnh" });
    const line = { productId: p.id, unitName: "Chai", qty: 10_000, unitPrice: 30_000 };
    const doc = await purchase(
      store.owner,
      purchaseInput([line], { contactId: ncc.id, paid: 100_000 }),
    );
    expect(doc).toMatchObject({ paid: 100_000, debtAmount: 200_000, contact: { debt: 200_000 } });
    const row = await contactRow(ncc.id);
    expect(row.debt).toBe(200_000);
    expect(row.debtSince).toBeTypeOf("number");
    const entries = await db.select().from(debtEntries).where(eq(debtEntries.contactId, ncc.id));
    expect(entries.map((e) => [e.amount, e.balanceAfter])).toEqual([[200_000, 200_000]]);

    const noSupplier = await store.owner.api.purchases.$post({
      json: purchaseInput([line], { paid: 0 }),
    });
    expect((await errorOf(noSupplier)).code).toBe("DEBT_REQUIRES_SUPPLIER");
    const kh = await createContact(store.owner);
    const customer = await store.owner.api.purchases.$post({
      json: purchaseInput([line], { contactId: kh.id, paid: 0 }),
    });
    expect((await errorOf(customer)).code).toBe("INVALID_CONTACT");
  });

  it("staff không nhập hàng được; cùng idempotencyKey → 1 phiếu", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner);
    const staff = await addStaff(store);
    const input = purchaseInput([{ productId: p.id, unitName: "Chai", qty: 1_000, unitPrice: 1 }]);
    expect((await staff.api.purchases.$post({ json: input })).status).toBe(403);
    const first = await store.owner.api.purchases.$post({ json: input });
    const second = await store.owner.api.purchases.$post({ json: input });
    expect([first.status, second.status]).toEqual([201, 200]);
    expect((await second.json()).id).toBe((await first.json()).id);
    expect((await productRow(p.id)).stock).toBe(1_000);
  });
});

describe("phiếu nháp", () => {
  it("lưu nháp không đổi tồn và nợ; sửa nháp; hoàn thành mới nhập kho; hoàn thành 2 lần → lỗi", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { costPrice: 20_000, openingStock: 10_000 });
    const ncc = await createContact(store.owner, { type: "supplier", name: "NCC" });
    const draft = await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 5_000, unitPrice: 30_000 }], {
        status: "draft",
        contactId: ncc.id,
        paid: 0,
      }),
    );
    expect(draft).toMatchObject({ code: "PN000001", status: "draft", completedAt: null });
    expect(await productRow(p.id)).toMatchObject({ stock: 10_000, costPrice: 20_000 });
    expect((await contactRow(ncc.id)).debt).toBe(0);

    const edited = await store.owner.api.purchases[":id"].$put({
      param: { id: draft.id },
      json: purchaseInput([{ productId: p.id, unitName: "Chai", qty: 10_000, unitPrice: 30_000 }], {
        contactId: ncc.id,
        paid: 100_000,
      }),
    });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      status: "draft",
      total: 300_000,
      debtAmount: 200_000,
      lines: [{ qty: 10_000 }],
    });
    expect((await productRow(p.id)).stock).toBe(10_000);

    const api = store.owner.api.purchases[":id"].complete;
    const done = await api.$post({ param: { id: draft.id } });
    expect(await done.json()).toMatchObject({ status: "completed" });
    expect(await productRow(p.id)).toMatchObject({ stock: 20_000, costPrice: 25_000 });
    expect((await contactRow(ncc.id)).debt).toBe(200_000);

    const again = await api.$post({ param: { id: draft.id } });
    expect((await errorOf(again)).code).toBe("INVALID_STATUS");
    const editDone = await store.owner.api.purchases[":id"].$put({
      param: { id: draft.id },
      json: purchaseInput([{ productId: p.id, unitName: "Chai", qty: 1_000, unitPrice: 1 }]),
    });
    expect((await errorOf(editDone)).code).toBe("INVALID_STATUS");
    expect(await productRow(p.id)).toMatchObject({ stock: 20_000, costPrice: 25_000 });
  });

  it("hủy phiếu nháp: chỉ đổi trạng thái", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { openingStock: 1_000 });
    const draft = await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 5_000, unitPrice: 30_000 }], {
        status: "draft",
      }),
    );
    const res = await store.owner.api.documents[":id"].cancel.$post({ param: { id: draft.id } });
    expect(await res.json()).toMatchObject({ status: "cancelled" });
    expect((await productRow(p.id)).stock).toBe(1_000);
    const moves = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.documentId, draft.id));
    expect(moves).toEqual([]);
  });
});

describe("hủy phiếu nhập", () => {
  it("hàng chưa bán → tồn, giá vốn, nợ NCC trở về đúng", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { costPrice: 20_000, openingStock: 10_000 });
    const ncc = await createContact(store.owner, { type: "supplier", name: "NCC" });
    const doc = await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 10_000, unitPrice: 30_000 }], {
        contactId: ncc.id,
        paid: 0,
      }),
    );
    expect(await productRow(p.id)).toMatchObject({ stock: 20_000, costPrice: 25_000 });

    const res = await store.owner.api.documents[":id"].cancel.$post({ param: { id: doc.id } });
    expect(res.status).toBe(200);
    expect(await productRow(p.id)).toMatchObject({ stock: 10_000, costPrice: 20_000 });
    const row = await contactRow(ncc.id);
    expect(row).toMatchObject({ debt: 0, debtSince: null });
    const moves = await db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.documentId, doc.id), eq(stockMovements.type, "cancel")));
    expect(moves).toMatchObject([{ qtyChange: -10_000, stockAfter: 10_000, note: "Hủy PN000001" }]);
    const again = await store.owner.api.documents[":id"].cancel.$post({ param: { id: doc.id } });
    expect((await errorOf(again)).code).toBe("ALREADY_CANCELLED");
  });

  it("hàng đã bán hết → CANNOT_CANCEL_STOCK_USED kèm danh sách, không đổi gì", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { name: "Nước mắm", costPrice: 20_000 });
    const q = await createProduct(store.owner, { name: "Mì", baseUnit: "Gói", costPrice: 3_000 });
    const doc = await purchase(
      store.owner,
      purchaseInput([
        { productId: p.id, unitName: "Chai", qty: 10_000, unitPrice: 30_000 },
        { productId: q.id, unitName: "Gói", qty: 10_000, unitPrice: 3_000 },
      ]),
    );
    await sell(
      store.owner,
      saleInput([{ productId: p.id, unitName: "Chai", qty: 10_000, unitPrice: 38_000 }]),
    );
    const res = await store.owner.api.documents[":id"].cancel.$post({ param: { id: doc.id } });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatchObject({
      code: "CANNOT_CANCEL_STOCK_USED",
      details: { items: [{ productId: p.id, name: "Nước mắm", stock: 0, requested: 10_000 }] },
    });
    expect((await productRow(p.id)).stock).toBe(0);
    expect((await productRow(q.id)).stock).toBe(10_000);
    const status = await db.select().from(documents).where(eq(documents.id, doc.id)).get();
    expect(status?.status).toBe("completed");
  });

  it("giá vốn tính ngược khi đã bán bớt: (stock·cost − q·in_cost)/(stock − q)", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { costPrice: 20_000, openingStock: 10_000 });
    const doc = await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 10_000, unitPrice: 30_000 }]),
    );
    await sell(
      store.owner,
      saleInput([{ productId: p.id, unitName: "Chai", qty: 5_000, unitPrice: 38_000 }]),
    );
    // Trước hủy: tồn 15, giá vốn 25.000 → (15·25.000 − 10·30.000)/5 = 15.000
    await store.owner.api.documents[":id"].cancel.$post({ param: { id: doc.id } });
    expect(await productRow(p.id)).toMatchObject({ stock: 5_000, costPrice: 15_000 });
  });
});
