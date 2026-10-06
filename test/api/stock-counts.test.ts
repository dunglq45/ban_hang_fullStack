import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/worker/db/client";
import { products, stockMovements } from "../../src/worker/db/schema";
import { errorOf } from "../helpers/api";
import { createProduct } from "../helpers/catalog";
import { saleInput, sell } from "../helpers/sales";
import { addStaff, createStore } from "../helpers/stores";

const db = createDatabase(env.DB);

async function stockOf(id: string) {
  return (await db.select().from(products).where(eq(products.id, id)).get())!.stock;
}

async function setup() {
  const store = await createStore();
  const cat = await (await store.owner.api.categories.$post({ json: { name: "Gia vị" } })).json();
  const mk = (name: string, stock: number, extra: object = {}) =>
    createProduct(store.owner, {
      name,
      categoryId: cat.id,
      costPrice: 10_000,
      openingStock: stock,
      ...extra,
    });
  const plus = await mk("A tăng", 10_000, {
    barcode: "111",
    units: [{ name: "Thùng", factor: 12, salePrice: null, barcode: "112" }],
  });
  const minus = await mk("B giảm", 5_000);
  const same = await mk("C khớp", 3_000);
  const uncounted = await mk("D chưa đếm", 7_000);
  const other = await createProduct(store.owner, { name: "Ngoài nhóm", openingStock: 1_000 });
  return { store, cat, plus, minus, same, uncounted, other };
}

describe("kiểm kho", () => {
  it("lệch +2, −1, khớp, chưa đếm → tồn sau hoàn thành đúng, movements adjust có note lý do", async () => {
    const { store, cat, plus, minus, same, uncounted, other } = await setup();
    const created = await store.owner.api["stock-counts"].$post({
      json: { categoryId: cat.id },
    });
    expect(created.status).toBe(201);
    const count = await created.json();
    expect(count).toMatchObject({ code: "KK000006", status: "draft" });
    expect(count.lines.map((l) => [l.productName, l.systemQty])).toEqual([
      ["A tăng", 10_000],
      ["B giảm", 5_000],
      ["C khớp", 3_000],
      ["D chưa đếm", 7_000],
    ]);
    const lineOf = (id: string) => count.lines.find((l) => l.productId === id)!.id;

    const patch = await store.owner.api["stock-counts"][":id"].lines.$patch({
      param: { id: count.id },
      json: {
        lines: [
          { lineId: lineOf(plus.id), actualQty: 12_000, reason: "Nhập thiếu phiếu" },
          { lineId: lineOf(minus.id), actualQty: 4_000, reason: "Vỡ, hỏng" },
          { lineId: lineOf(same.id), actualQty: 3_000 },
        ],
      },
    });
    const draft = await patch.json();
    expect(draft.summary).toMatchObject({
      total: 4,
      counted: 3,
      uncounted: 1,
      matched: 1,
      increased: 1,
      decreased: 1,
      increaseValue: 20_000,
      decreaseValue: -10_000,
    });

    const done = await store.owner.api["stock-counts"][":id"].complete.$post({
      param: { id: count.id },
    });
    expect(done.status).toBe(200);
    const body = await done.json();
    expect(body.warnings).toEqual([]);
    expect(body.document.status).toBe("completed");
    expect([
      await stockOf(plus.id),
      await stockOf(minus.id),
      await stockOf(same.id),
      await stockOf(uncounted.id),
      await stockOf(other.id),
    ]).toEqual([12_000, 4_000, 3_000, 7_000, 1_000]);

    const moves = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.documentId, count.id));
    expect(moves.map((m) => [m.productId, m.type, m.qtyChange, m.stockAfter, m.note])).toEqual(
      expect.arrayContaining([
        [plus.id, "adjust", 2_000, 12_000, "Nhập thiếu phiếu"],
        [minus.id, "adjust", -1_000, 4_000, "Vỡ, hỏng"],
      ]),
    );
    expect(moves).toHaveLength(2);
    expect(body.document.lines.find((l) => l.productId === plus.id)).toMatchObject({
      diff: 2_000,
      diffValue: 20_000,
    });
  });

  it("bán 1 món giữa lúc kiểm → chênh lệch tính theo tồn mới và có cảnh báo", async () => {
    const { store, minus } = await setup();
    const count = await (
      await store.owner.api["stock-counts"].$post({ json: { productIds: [minus.id] } })
    ).json();
    // Đếm được 4 (lúc tạo phiếu tồn 5) rồi bán 1 → tồn hiện tại 4 → khớp, không cần lý do.
    await store.owner.api["stock-counts"][":id"].lines.$patch({
      param: { id: count.id },
      json: { lines: [{ lineId: count.lines[0]!.id, actualQty: 4_000 }] },
    });
    await sell(
      store.owner,
      saleInput([{ productId: minus.id, unitName: "Chai", qty: 1_000, unitPrice: 38_000 }]),
    );
    const view = await (
      await store.owner.api["stock-counts"][":id"].$get({ param: { id: count.id } })
    ).json();
    expect(view.lines[0]).toMatchObject({
      systemQty: 5_000,
      currentStock: 4_000,
      stockChanged: true,
      diff: 0,
    });

    const done = await (
      await store.owner.api["stock-counts"][":id"].complete.$post({ param: { id: count.id } })
    ).json();
    expect(done.warnings).toEqual([
      { productId: minus.id, name: "B giảm", systemQty: 5_000, currentStock: 4_000 },
    ]);
    expect(await stockOf(minus.id)).toBe(4_000);
    const adjust = await db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.documentId, count.id)));
    expect(adjust).toEqual([]);
  });

  it("dòng lệch không có lý do → REASON_REQUIRED; hoàn thành 2 lần → INVALID_STATUS", async () => {
    const { store, plus } = await setup();
    const count = await (
      await store.owner.api["stock-counts"].$post({ json: { productIds: [plus.id] } })
    ).json();
    const api = store.owner.api["stock-counts"][":id"];
    await api.lines.$patch({
      param: { id: count.id },
      json: { lines: [{ lineId: count.lines[0]!.id, actualQty: 9_000 }] },
    });
    const res = await api.complete.$post({ param: { id: count.id } });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({
      code: "REASON_REQUIRED",
      details: { lines: [{ productId: plus.id, name: "A tăng" }] },
    });
    expect(await stockOf(plus.id)).toBe(10_000);

    await api.lines.$patch({
      param: { id: count.id },
      json: { lines: [{ lineId: count.lines[0]!.id, actualQty: 9_000, reason: "Mất, thất lạc" }] },
    });
    expect((await api.complete.$post({ param: { id: count.id } })).status).toBe(200);
    const again = await api.complete.$post({ param: { id: count.id } });
    expect((await errorOf(again)).code).toBe("INVALID_STATUS");
    const edit = await api.lines.$patch({
      param: { id: count.id },
      json: { lines: [{ lineId: count.lines[0]!.id, actualQty: 1 }] },
    });
    expect((await errorOf(edit)).code).toBe("INVALID_STATUS");
    expect(await stockOf(plus.id)).toBe(9_000);
  });

  it("quét mã vạch: +1 đơn vị; mã vạch thùng +factor; hàng ngoài phiếu → PRODUCT_NOT_IN_COUNT", async () => {
    const { store, plus, other } = await setup();
    const staff = await addStaff(store);
    const count = await (
      await store.owner.api["stock-counts"].$post({ json: { productIds: [plus.id] } })
    ).json();
    const scan = (barcode: string) =>
      staff.api["stock-counts"][":id"].scan.$post({ param: { id: count.id }, json: { barcode } });
    expect(await (await scan("111")).json()).toMatchObject({ added: 1_000, actualQty: 1_000 });
    expect(await (await scan("112")).json()).toMatchObject({
      unitName: "Thùng",
      added: 12_000,
      actualQty: 13_000,
    });
    await store.owner.api.products[":id"].$put({
      param: { id: other.id },
      json: {
        name: "Ngoài nhóm",
        code: null,
        barcode: "999",
        categoryId: null,
        baseUnit: "Chai",
        salePrice: 38_000,
      },
    });
    const outside = await scan("999");
    expect(outside.status).toBe(404);
    expect((await errorOf(outside)).code).toBe("PRODUCT_NOT_IN_COUNT");
    expect((await scan("000")).status).toBe(404);
  });

  it("quyền: staff xem/đếm được nhưng không tạo, không hoàn thành, không thấy giá trị lệch", async () => {
    const { store, plus } = await setup();
    const staff = await addStaff(store);
    const denied = await staff.api["stock-counts"].$post({ json: { productIds: [plus.id] } });
    expect(denied.status).toBe(403);
    const count = await (
      await store.owner.api["stock-counts"].$post({ json: { productIds: [plus.id] } })
    ).json();
    const patched = await staff.api["stock-counts"][":id"].lines.$patch({
      param: { id: count.id },
      json: { lines: [{ lineId: count.lines[0]!.id, actualQty: 10_000 }] },
    });
    const view = await patched.json();
    expect(view.lines[0]).not.toHaveProperty("diffValue");
    expect(view.summary.increaseValue).toBeUndefined();
    const complete = await staff.api["stock-counts"][":id"].complete.$post({
      param: { id: count.id },
    });
    expect(complete.status).toBe(403);
  });

  it("hủy phiếu kiểm nháp được; đã hoàn thành thì không (INVALID_STATUS); quá 200 id → VALIDATION_ERROR", async () => {
    const { store, plus } = await setup();
    const make = async () =>
      (await store.owner.api["stock-counts"].$post({ json: { productIds: [plus.id] } })).json();
    const draft = await make();
    const cancel = await store.owner.api.documents[":id"].cancel.$post({
      param: { id: draft.id },
    });
    expect(await cancel.json()).toMatchObject({ status: "cancelled" });

    const done = await make();
    await store.owner.api["stock-counts"][":id"].complete.$post({ param: { id: done.id } });
    const res = await store.owner.api.documents[":id"].cancel.$post({ param: { id: done.id } });
    expect((await errorOf(res)).code).toBe("INVALID_STATUS");

    const many = await store.owner.api["stock-counts"].$post({
      json: { productIds: Array.from({ length: 201 }, (_, i) => `id-${i}`) },
    });
    expect((await errorOf(many)).code).toBe("VALIDATION_ERROR");
  });
});
