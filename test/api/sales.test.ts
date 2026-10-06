import { env } from "cloudflare:test";
import { and, count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase, getDb } from "../../src/worker/db/client";
import {
  contacts,
  counters,
  debtEntries,
  documentLines,
  documents,
  products,
  stockMovements,
} from "../../src/worker/db/schema";
import { isGuardError } from "../../src/worker/lib/guard";
import { errorOf } from "../helpers/api";
import { createContact, createProduct } from "../helpers/catalog";
import { saleInput, sell } from "../helpers/sales";
import { addStaff, createStore, type TestStore } from "../helpers/stores";

const db = createDatabase(env.DB);

async function stockOf(id: string) {
  return (await db.select().from(products).where(eq(products.id, id)).get())!.stock;
}
async function contactRow(id: string) {
  return (await db.select().from(contacts).where(eq(contacts.id, id)).get())!;
}

/** Cửa hàng có 3 mặt hàng: A (thùng 24), B, C (bán theo kg). */
async function setup() {
  const store = await createStore();
  const a = await createProduct(store.owner, {
    name: "Bia Sài Gòn",
    baseUnit: "Lon",
    costPrice: 10_000,
    salePrice: 15_000,
    openingStock: 100_000,
    units: [{ name: "Thùng", factor: 24, salePrice: 330_000, barcode: null }],
  });
  const b = await createProduct(store.owner, {
    name: "Mì Hảo Hảo",
    baseUnit: "Gói",
    costPrice: 3_500,
    salePrice: 4_500,
    openingStock: 50_000,
  });
  const c = await createProduct(store.owner, {
    name: "Đường cát",
    baseUnit: "Kg",
    costPrice: 20_000,
    salePrice: 25_000,
    openingStock: 10_000,
  });
  return { store, a, b, c };
}

async function snapshot(store: TestStore, productIds: string[]) {
  const [docCount] = await db
    .select({ n: count() })
    .from(documents)
    .where(eq(documents.storeId, store.storeId));
  const [moveCount] = await db
    .select({ n: count() })
    .from(stockMovements)
    .where(eq(stockMovements.storeId, store.storeId));
  const hd = await db
    .select()
    .from(counters)
    .where(and(eq(counters.storeId, store.storeId), eq(counters.kind, "HD")))
    .get();
  return {
    documents: docCount!.n,
    movements: moveCount!.n,
    hd: hd?.value,
    stocks: await Promise.all(productIds.map(stockOf)),
  };
}

describe("bán hàng", () => {
  it("bán 3 món trả đủ: mã HD000001, tồn giảm, sổ kho đúng stock_after, chụp giá vốn", async () => {
    const { store, a, b, c } = await setup();
    const doc = await sell(
      store.owner,
      saleInput(
        [
          { productId: a.id, unitName: "Lon", qty: 3_000, unitPrice: 15_000 },
          { productId: b.id, unitName: "Gói", qty: 10_000, unitPrice: 4_500 },
          { productId: c.id, unitName: "Kg", qty: 2_000, unitPrice: 25_000 },
        ],
        { paid: 200_000 },
      ),
    );
    expect(doc).toMatchObject({
      type: "sale",
      code: "HD000001",
      status: "completed",
      subtotal: 140_000,
      total: 140_000,
      // khách đưa 200.000: chỉ lưu 140.000, tiền thừa client tự tính
      paid: 140_000,
      debtAmount: 0,
      contact: null,
    });
    expect(doc.lines.map((l) => [l.productName, l.unitName, l.qty, l.lineTotal])).toEqual([
      ["Bia Sài Gòn", "Lon", 3_000, 45_000],
      ["Mì Hảo Hảo", "Gói", 10_000, 45_000],
      ["Đường cát", "Kg", 2_000, 50_000],
    ]);

    expect([await stockOf(a.id), await stockOf(b.id), await stockOf(c.id)]).toEqual([
      97_000, 40_000, 8_000,
    ]);
    const lines = await db.select().from(documentLines).where(eq(documentLines.documentId, doc.id));
    expect(lines.map((l) => [l.productId, l.costPrice])).toEqual(
      expect.arrayContaining([
        [a.id, 10_000],
        [b.id, 3_500],
        [c.id, 20_000],
      ]),
    );
    const moves = await db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.documentId, doc.id)));
    expect(moves.map((m) => [m.productId, m.type, m.qtyChange, m.stockAfter, m.unitCost])).toEqual(
      expect.arrayContaining([
        [a.id, "sale", -3_000, 97_000, 10_000],
        [b.id, "sale", -10_000, 40_000, 3_500],
        [c.id, "sale", -2_000, 8_000, 20_000],
      ]),
    );
    expect(await db.select().from(debtEntries).where(eq(debtEntries.documentId, doc.id))).toEqual(
      [],
    );
  });

  it("bán theo Thùng (factor 24) trừ 24 lon; bán 0,5 kg; cùng một hàng hai dòng", async () => {
    const { store, a, c } = await setup();
    const doc = await sell(
      store.owner,
      saleInput([
        { productId: a.id, unitName: "thùng", qty: 1_000, unitPrice: 330_000 },
        { productId: a.id, unitName: "Lon", qty: 2_000, unitPrice: 15_000 },
        { productId: c.id, unitName: "Kg", qty: 500, unitPrice: 25_000 },
      ]),
    );
    expect(doc.lines.map((l) => [l.unitName, l.factor, l.qty, l.baseQty, l.lineTotal])).toEqual([
      ["Thùng", 24, 1_000, 24_000, 330_000],
      ["Lon", 1, 2_000, 2_000, 30_000],
      ["Kg", 1, 500, 500, 12_500],
    ]);
    expect(await stockOf(a.id)).toBe(100_000 - 26_000);
    expect(await stockOf(c.id)).toBe(9_500);
    // stock_after theo thứ tự dòng: 76.000 rồi 74.000
    const moves = await db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.documentId, doc.id), eq(stockMovements.productId, a.id)));
    expect(moves.map((m) => m.stockAfter).sort((x, y) => y - x)).toEqual([76_000, 74_000]);
  });

  it("chiết khấu: total = subtotal − discount; chiết khấu lớn hơn tiền hàng → INVALID_DISCOUNT", async () => {
    const { store, b } = await setup();
    const line = { productId: b.id, unitName: "Gói", qty: 10_000, unitPrice: 4_500 };
    const doc = await sell(store.owner, saleInput([line], { discount: 5_000 }));
    expect(doc).toMatchObject({ subtotal: 45_000, discount: 5_000, total: 40_000, paid: 40_000 });
    const bad = await store.owner.api.sales.$post({
      json: saleInput([line], { discount: 50_000, paid: 0 }),
    });
    expect((await errorOf(bad)).code).toBe("INVALID_DISCOUNT");
  });
});

describe("bán ghi nợ", () => {
  it("trả thiếu cho khách: nợ tăng, debt_entries balance_after đúng, debt_since set một lần", async () => {
    const { store, b } = await setup();
    const kh = await createContact(store.owner);
    const line = { productId: b.id, unitName: "Gói", qty: 10_000, unitPrice: 4_500 };

    const first = await sell(store.owner, saleInput([line], { contactId: kh.id, paid: 15_000 }));
    expect(first).toMatchObject({
      total: 45_000,
      paid: 15_000,
      debtAmount: 30_000,
      contact: { id: kh.id, name: "Chị Lan", debt: 30_000 },
    });
    const afterFirst = await contactRow(kh.id);
    expect(afterFirst.debt).toBe(30_000);
    expect(afterFirst.debtSince).toBeTypeOf("number");

    await sell(store.owner, saleInput([line], { contactId: kh.id, paid: 0 }));
    const afterSecond = await contactRow(kh.id);
    expect(afterSecond.debt).toBe(75_000);
    expect(afterSecond.debtSince).toBe(afterFirst.debtSince);

    const entries = await db.select().from(debtEntries).where(eq(debtEntries.contactId, kh.id));
    expect(entries.map((e) => [e.amount, e.balanceAfter])).toEqual([
      [30_000, 30_000],
      [45_000, 75_000],
    ]);
  });

  it("trả thiếu không chọn khách → DEBT_REQUIRES_CUSTOMER; khách là NCC → INVALID_CONTACT", async () => {
    const { store, b } = await setup();
    const line = { productId: b.id, unitName: "Gói", qty: 1_000, unitPrice: 4_500 };
    const res = await store.owner.api.sales.$post({ json: saleInput([line], { paid: 0 }) });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe("DEBT_REQUIRES_CUSTOMER");

    const ncc = await createContact(store.owner, { type: "supplier", name: "NCC" });
    const bad = await store.owner.api.sales.$post({
      json: saleInput([line], { contactId: ncc.id, paid: 0 }),
    });
    expect((await errorOf(bad)).code).toBe("INVALID_CONTACT");
  });

  it("vượt hạn mức nợ → DEBT_LIMIT_EXCEEDED; staff gửi force vẫn bị chặn; owner force thì được", async () => {
    const { store, b } = await setup();
    const kh = await createContact(store.owner, { debtLimit: 50_000 });
    const staff = await addStaff(store);
    const line = { productId: b.id, unitName: "Gói", qty: 20_000, unitPrice: 4_500 };
    const input = () => saleInput([line], { contactId: kh.id, paid: 0, force: true });

    const plain = await store.owner.api.sales.$post({
      json: saleInput([line], { contactId: kh.id, paid: 0 }),
    });
    expect(plain.status).toBe(409);
    expect(await errorOf(plain)).toMatchObject({
      code: "DEBT_LIMIT_EXCEEDED",
      details: { debt: 0, debtLimit: 50_000, debtAmount: 90_000 },
    });
    const byStaff = await staff.api.sales.$post({ json: input() });
    expect((await errorOf(byStaff)).code).toBe("DEBT_LIMIT_EXCEEDED");

    const forced = await sell(store.owner, input());
    expect(forced.debtAmount).toBe(90_000);
    expect((await contactRow(kh.id)).debt).toBe(90_000);
  });
});

describe("tồn kho", () => {
  it("bán vượt tồn → OUT_OF_STOCK kèm chi tiết, KHÔNG thay đổi gì trong DB", async () => {
    const { store, a, b } = await setup();
    const kh = await createContact(store.owner);
    const before = await snapshot(store, [a.id, b.id]);
    const res = await store.owner.api.sales.$post({
      json: saleInput(
        [
          { productId: a.id, unitName: "Lon", qty: 1_000, unitPrice: 15_000 },
          { productId: b.id, unitName: "Gói", qty: 30_000, unitPrice: 4_500 },
          { productId: b.id, unitName: "Gói", qty: 30_000, unitPrice: 4_500 },
        ],
        { contactId: kh.id, paid: 0 },
      ),
    });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatchObject({
      code: "OUT_OF_STOCK",
      message: "Không đủ hàng trong kho: Mì Hảo Hảo chỉ còn 50 Gói",
      details: { productId: b.id, name: "Mì Hảo Hảo", stock: 50_000, requested: 60_000 },
    });
    expect(await snapshot(store, [a.id, b.id])).toEqual(before);
    expect((await contactRow(kh.id)).debt).toBe(0);
    expect(await db.select().from(debtEntries).where(eq(debtEntries.contactId, kh.id))).toEqual([]);
  });

  it("allow_negative = 1 thì được bán âm", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { allowNegative: true, openingStock: 1_000 });
    await sell(
      store.owner,
      saleInput([{ productId: p.id, unitName: "Chai", qty: 3_000, unitPrice: 38_000 }]),
    );
    expect(await stockOf(p.id)).toBe(-2_000);
  });

  it("hàng ngừng bán → PRODUCT_INACTIVE; sai đơn vị → INVALID_UNIT; hàng không có → NOT_FOUND", async () => {
    const store = await createStore();
    const off = await createProduct(store.owner, { isActive: false, openingStock: 5_000 });
    const on = await createProduct(store.owner, { name: "Khác", openingStock: 5_000 });
    const cases: [string, Parameters<typeof saleInput>[0]][] = [
      ["PRODUCT_INACTIVE", [{ productId: off.id, unitName: "Chai", qty: 1_000, unitPrice: 1 }]],
      ["INVALID_UNIT", [{ productId: on.id, unitName: "Thùng", qty: 1_000, unitPrice: 1 }]],
      ["NOT_FOUND", [{ productId: "khong-co", unitName: "Chai", qty: 1_000, unitPrice: 1 }]],
    ];
    for (const [code, lines] of cases) {
      const res = await store.owner.api.sales.$post({ json: saleInput(lines) });
      expect((await errorOf(res)).code).toBe(code);
    }
  });

  it("tối đa 200 dòng", async () => {
    const { store, b } = await setup();
    const line = { productId: b.id, unitName: "Gói", qty: 1, unitPrice: 0 };
    const res = await store.owner.api.sales.$post({
      json: saleInput(Array.from({ length: 201 }, () => line)),
    });
    expect((await errorOf(res)).code).toBe("VALIDATION_ERROR");
  });
});

describe("giá bán", () => {
  it("cho bán giá khác niêm yết; staff bán dưới giá vốn → PRICE_BELOW_COST, owner thì được", async () => {
    const { store, a } = await setup();
    const staff = await addStaff(store);
    const discounted = await sell(
      staff,
      saleInput([{ productId: a.id, unitName: "Thùng", qty: 1_000, unitPrice: 240_000 }]),
    );
    expect(discounted.total).toBe(240_000);
    // Thùng 24 lon × 10.000 = 240.000 là giá vốn; thấp hơn 1 đồng là bị chặn.
    const below = [{ productId: a.id, unitName: "Thùng", qty: 1_000, unitPrice: 239_999 }];
    const res = await staff.api.sales.$post({ json: saleInput(below) });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("PRICE_BELOW_COST");
    await sell(store.owner, saleInput(below));
  });
});

describe("idempotency", () => {
  it("cùng idempotencyKey gửi 2 lần → 1 hóa đơn, lần 2 trả 200 với hóa đơn cũ", async () => {
    const { store, b } = await setup();
    const input = saleInput([{ productId: b.id, unitName: "Gói", qty: 1_000, unitPrice: 4_500 }]);
    const first = await store.owner.api.sales.$post({ json: input });
    const second = await store.owner.api.sales.$post({ json: input });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const [x, y] = [await first.json(), await second.json()];
    expect(y.id).toBe(x.id);
    expect(y.code).toBe("HD000001");
    expect(await stockOf(b.id)).toBe(49_000);
  });

  it("2 request cùng key gửi đồng thời → vẫn chỉ 1 hóa đơn, tồn trừ một lần", async () => {
    const { store, b } = await setup();
    const input = saleInput([{ productId: b.id, unitName: "Gói", qty: 1_000, unitPrice: 4_500 }]);
    const results = await Promise.all(
      Array.from({ length: 3 }, () => store.owner.api.sales.$post({ json: input })),
    );
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(new Set(bodies.map((d) => d.id)).size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const docs = await db
      .select()
      .from(documents)
      .where(and(eq(documents.storeId, store.storeId), eq(documents.type, "sale")));
    expect(docs).toHaveLength(1);
    expect(await stockOf(b.id)).toBe(49_000);
  });
});

describe("hủy hóa đơn bán", () => {
  it("hủy → tồn và nợ trở về như trước, debt_since về NULL; sổ kho/sổ nợ có bút toán đảo", async () => {
    const { store, a, b } = await setup();
    const kh = await createContact(store.owner);
    const doc = await sell(
      store.owner,
      saleInput(
        [
          { productId: a.id, unitName: "Thùng", qty: 1_000, unitPrice: 330_000 },
          { productId: b.id, unitName: "Gói", qty: 5_000, unitPrice: 4_500 },
        ],
        { contactId: kh.id, paid: 100_000 },
      ),
    );
    expect((await contactRow(kh.id)).debt).toBe(252_500);

    const res = await store.owner.api.documents[":id"].cancel.$post({ param: { id: doc.id } });
    expect(res.status).toBe(200);
    const cancelled = await res.json();
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancelledBy: { id: store.owner.id },
      contact: { debt: 0 },
    });
    expect(cancelled.cancelledAt).toBeTypeOf("number");

    expect(await stockOf(a.id)).toBe(100_000);
    expect(await stockOf(b.id)).toBe(50_000);
    const row = await contactRow(kh.id);
    expect(row.debt).toBe(0);
    expect(row.debtSince).toBeNull();

    const moves = await db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.documentId, doc.id), eq(stockMovements.type, "cancel")));
    expect(moves.map((m) => [m.productId, m.qtyChange, m.stockAfter, m.note])).toEqual(
      expect.arrayContaining([
        [a.id, 24_000, 100_000, "Hủy HD000001"],
        [b.id, 5_000, 50_000, "Hủy HD000001"],
      ]),
    );
    const entries = await db.select().from(debtEntries).where(eq(debtEntries.contactId, kh.id));
    expect(entries.map((e) => [e.amount, e.balanceAfter])).toEqual([
      [252_500, 252_500],
      [-252_500, 0],
    ]);
  });

  it("hủy lần 2 → ALREADY_CANCELLED; staff không hủy được", async () => {
    const { store, b } = await setup();
    const staff = await addStaff(store);
    const doc = await sell(
      staff,
      saleInput([{ productId: b.id, unitName: "Gói", qty: 1_000, unitPrice: 4_500 }]),
    );
    const denied = await staff.api.documents[":id"].cancel.$post({ param: { id: doc.id } });
    expect(denied.status).toBe(403);
    const api = store.owner.api.documents[":id"].cancel;
    expect((await api.$post({ param: { id: doc.id } })).status).toBe(200);
    const again = await api.$post({ param: { id: doc.id } });
    expect(again.status).toBe(409);
    expect((await errorOf(again)).code).toBe("ALREADY_CANCELLED");
    expect(await stockOf(b.id)).toBe(50_000);
  });

  it("câu chặn trong batch: chạy batch hủy lần 2 (bỏ qua kiểm tra trước) bị rollback", async () => {
    const { store, b } = await setup();
    const doc = await sell(
      store.owner,
      saleInput([{ productId: b.id, unitName: "Gói", qty: 1_000, unitPrice: 4_500 }]),
    );
    const storeDb = getDb(env, store.storeId);
    const reverse = () =>
      storeDb.batchAll([
        storeDb.documents.markCancelled(doc.id, store.owner.id, Date.now()),
        storeDb.guardChanges(1),
        ...storeDb.stock.reverseLineStatements({
          documentId: doc.id,
          productId: b.id,
          delta: 1_000,
          unitCost: 3_500,
          movementId: crypto.randomUUID(),
          note: "test",
          now: Date.now(),
        }),
      ]);
    await reverse();
    const err = await reverse().catch((e: unknown) => e);
    expect(isGuardError(err)).toBe(true);
    expect(await stockOf(b.id)).toBe(50_000);
  });

  it("hủy song song: chỉ một request có hiệu lực", async () => {
    const { store, b } = await setup();
    const doc = await sell(
      store.owner,
      saleInput([{ productId: b.id, unitName: "Gói", qty: 1_000, unitPrice: 4_500 }]),
    );
    const api = store.owner.api.documents[":id"].cancel;
    const results = await Promise.all([
      api.$post({ param: { id: doc.id } }),
      api.$post({ param: { id: doc.id } }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await stockOf(b.id)).toBe(50_000);
  });
});

describe("xem chứng từ", () => {
  it("chi tiết đủ để in hóa đơn: cửa hàng, khách + nợ hiện tại, dòng hàng, người tạo", async () => {
    const { store, b } = await setup();
    await store.owner.api.store.$put({
      json: {
        name: "Tạp hóa Minh Anh",
        phone: "0900000001",
        address: "12 Lê Lợi",
        receiptFooter: "Cảm ơn quý khách!",
      },
    });
    const kh = await createContact(store.owner);
    const sold = await sell(
      store.owner,
      saleInput([{ productId: b.id, unitName: "Gói", qty: 2_000, unitPrice: 4_500 }], {
        contactId: kh.id,
        paid: 0,
      }),
    );
    const doc = await (
      await store.owner.api.documents[":id"].$get({ param: { id: sold.id } })
    ).json();
    expect(doc).toMatchObject({
      code: "HD000001",
      store: {
        name: "Tạp hóa Minh Anh",
        phone: "0900000001",
        address: "12 Lê Lợi",
        receiptFooter: "Cảm ơn quý khách!",
      },
      contact: { code: "KH000001", name: "Chị Lan", phone: "0912345678", debt: 9_000 },
      createdBy: { id: store.owner.id, name: `Chủ ${store.name}` },
      cancelledBy: null,
      total: 9_000,
      paid: 0,
      debtAmount: 9_000,
      lines: [
        {
          productCode: b.code,
          productName: "Mì Hảo Hảo",
          unitName: "Gói",
          qty: 2_000,
          unitPrice: 4_500,
          lineTotal: 9_000,
          costPrice: 3_500,
        },
      ],
    });
  });

  it("staff: xem hóa đơn bán không có giá vốn; không xem được phiếu kiểm kho", async () => {
    const { store, b } = await setup();
    const staff = await addStaff(store);
    const sold = await sell(
      staff,
      saleInput([{ productId: b.id, unitName: "Gói", qty: 1_000, unitPrice: 4_500 }]),
    );
    const doc = await (await staff.api.documents[":id"].$get({ param: { id: sold.id } })).json();
    expect(doc.lines[0]).not.toHaveProperty("costPrice");
    expect(JSON.stringify(sold)).not.toContain("costPrice");

    const kk = await db
      .select()
      .from(documents)
      .where(and(eq(documents.storeId, store.storeId), eq(documents.type, "stock_count")))
      .get();
    const res = await staff.api.documents[":id"].$get({ param: { id: kk!.id } });
    expect(res.status).toBe(403);
    const list = await (await staff.api.documents.$get({ query: {} })).json();
    expect(list.items.map((d) => d.type)).toEqual(["sale"]);
    const denied = await staff.api.documents.$get({ query: { type: "stock_count" } });
    expect(denied.status).toBe(403);
  });

  it("danh sách lọc theo loại, trạng thái, khách, mã", async () => {
    const { store, b } = await setup();
    const kh = await createContact(store.owner);
    const line = { productId: b.id, unitName: "Gói", qty: 1_000, unitPrice: 4_500 };
    const first = await sell(store.owner, saleInput([line]));
    const second = await sell(store.owner, saleInput([line], { contactId: kh.id }));
    await store.owner.api.documents[":id"].cancel.$post({ param: { id: first.id } });

    const api = store.owner.api.documents;
    const ids = async (query: Record<string, string>) =>
      (await (await api.$get({ query })).json()).items.map((d) => d.id);
    expect(await ids({ type: "sale" })).toEqual([second.id, first.id]);
    expect(await ids({ type: "sale", status: "cancelled" })).toEqual([first.id]);
    expect(await ids({ contactId: kh.id })).toEqual([second.id]);
    expect(await ids({ q: "hd000002" })).toEqual([second.id]);
    expect(await ids({ q: "chi lan" })).toEqual([second.id]);
    const all = await (await api.$get({ query: {} })).json();
    // 3 phiếu tồn đầu kỳ (mỗi hàng một phiếu) + 2 hóa đơn
    expect(all.total).toBe(5);
  });
});

describe("bổ sung sau review giai đoạn 05", () => {
  it("staff dùng chiết khấu kéo tổng xuống dưới giá vốn → PRICE_BELOW_COST", async () => {
    const { store, a } = await setup();
    const staff = await addStaff(store);
    const line = { productId: a.id, unitName: "Thùng", qty: 1_000, unitPrice: 240_000 };
    const res = await staff.api.sales.$post({ json: saleInput([line], { discount: 239_000 }) });
    expect((await errorOf(res)).code).toBe("PRICE_BELOW_COST");
    const owner = await sell(store.owner, saleInput([line], { discount: 239_000 }));
    expect(owner.total).toBe(1_000);
  });

  it("hạn mức nợ chốt trong batch: 2 hóa đơn ghi nợ song song không cùng vượt hạn mức", async () => {
    const { store, b } = await setup();
    const kh = await createContact(store.owner, { debtLimit: 50_000 });
    // Mỗi hóa đơn nợ 45.000: một cái thì được, hai cái cộng lại vượt 50.000.
    const line = { productId: b.id, unitName: "Gói", qty: 10_000, unitPrice: 4_500 };
    const results = await Promise.all(
      [1, 2].map(() =>
        store.owner.api.sales.$post({ json: saleInput([line], { contactId: kh.id, paid: 0 }) }),
      ),
    );
    const statuses: number[] = results.map((r) => r.status);
    expect(statuses.sort()).toEqual([201, 409]);
    const failed = results.find((r) => (r.status as number) === 409)!;
    expect((await errorOf(failed)).code).toBe("DEBT_LIMIT_EXCEEDED");
    expect((await contactRow(kh.id)).debt).toBe(45_000);
    expect(await stockOf(b.id)).toBe(40_000);
  });

  it("ghi nợ toàn bộ: paymentMethod = null", async () => {
    const { store, b } = await setup();
    const kh = await createContact(store.owner);
    const doc = await sell(
      store.owner,
      saleInput([{ productId: b.id, unitName: "Gói", qty: 1_000, unitPrice: 4_500 }], {
        contactId: kh.id,
        paid: 0,
        paymentMethod: "transfer",
      }),
    );
    expect(doc.paymentMethod).toBeNull();
  });

  it("khách ngừng giao dịch → INVALID_CONTACT; tổng quá lớn → AMOUNT_TOO_LARGE", async () => {
    const { store, b } = await setup();
    const kh = await createContact(store.owner, { isActive: false });
    const line = { productId: b.id, unitName: "Gói", qty: 1_000, unitPrice: 4_500 };
    const inactive = await store.owner.api.sales.$post({
      json: saleInput([line], { contactId: kh.id }),
    });
    expect((await errorOf(inactive)).code).toBe("INVALID_CONTACT");
    const huge = await store.owner.api.sales.$post({
      json: saleInput(
        Array.from({ length: 3 }, () => ({
          ...line,
          qty: 1_000_000_000,
          unitPrice: 1_000_000_000,
        })),
        { paid: 0 },
      ),
    });
    expect((await errorOf(huge)).code).toBe("AMOUNT_TOO_LARGE");
  });

  it("idempotencyKey đã dùng cho chứng từ loại khác → IDEMPOTENCY_CONFLICT", async () => {
    const { store, b } = await setup();
    const key = crypto.randomUUID();
    const kk = await db
      .select()
      .from(documents)
      .where(and(eq(documents.storeId, store.storeId), eq(documents.type, "stock_count")))
      .get();
    await db.update(documents).set({ idempotencyKey: key }).where(eq(documents.id, kk!.id));
    const res = await store.owner.api.sales.$post({
      json: saleInput([{ productId: b.id, unitName: "Gói", qty: 1_000, unitPrice: 4_500 }], {
        idempotencyKey: key,
      }),
    });
    expect((await errorOf(res)).code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("hủy phiếu kiểm kho đã hoàn thành (tồn đầu kỳ) → INVALID_STATUS", async () => {
    const { store } = await setup();
    const kk = await db
      .select()
      .from(documents)
      .where(and(eq(documents.storeId, store.storeId), eq(documents.type, "stock_count")))
      .get();
    const res = await store.owner.api.documents[":id"].cancel.$post({ param: { id: kk!.id } });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("INVALID_STATUS");
  });

  it("hủy 1 trong 2 hóa đơn nợ: debt_since giữ nguyên, balance_after đúng", async () => {
    const { store, b } = await setup();
    const kh = await createContact(store.owner);
    const line = { productId: b.id, unitName: "Gói", qty: 10_000, unitPrice: 4_500 };
    const first = await sell(store.owner, saleInput([line], { contactId: kh.id, paid: 0 }));
    const since = (await contactRow(kh.id)).debtSince;
    await sell(store.owner, saleInput([line], { contactId: kh.id, paid: 5_000 }));
    await store.owner.api.documents[":id"].cancel.$post({ param: { id: first.id } });
    const row = await contactRow(kh.id);
    expect(row.debt).toBe(40_000);
    expect(row.debtSince).toBe(since);
    const entries = await db.select().from(debtEntries).where(eq(debtEntries.contactId, kh.id));
    expect(entries.map((e) => e.balanceAfter)).toEqual([45_000, 85_000, 40_000]);
  });

  it("hủy sau khi khách đã trả bớt nợ: nợ thành âm (khách trả trước), debt_since = NULL", async () => {
    const { store, b } = await setup();
    const kh = await createContact(store.owner);
    const doc = await sell(
      store.owner,
      saleInput([{ productId: b.id, unitName: "Gói", qty: 10_000, unitPrice: 4_500 }], {
        contactId: kh.id,
        paid: 0,
      }),
    );
    // Thu nợ là việc của giai đoạn 07; ở đây giả lập khách đã trả 30.000.
    await db.update(contacts).set({ debt: 15_000 }).where(eq(contacts.id, kh.id));
    await store.owner.api.documents[":id"].cancel.$post({ param: { id: doc.id } });
    const row = await contactRow(kh.id);
    expect(row.debt).toBe(-30_000);
    expect(row.debtSince).toBeNull();
  });
});
