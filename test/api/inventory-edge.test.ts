// Các ca biên và lỗi của nhập hàng / kiểm kho (bổ sung sau review giai đoạn 06).
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase, getDb } from "../../src/worker/db/client";
import { products } from "../../src/worker/db/schema";
import { isGuardError } from "../../src/worker/lib/guard";
import { errorOf } from "../helpers/api";
import { createContact, createProduct } from "../helpers/catalog";
import { purchase, purchaseInput, saleInput, sell } from "../helpers/sales";
import { addStaff, createStore, createTwoStores } from "../helpers/stores";

const db = createDatabase(env.DB);

async function productRow(id: string) {
  return (await db.select().from(products).where(eq(products.id, id)).get())!;
}

describe("nhập hàng: ca biên", () => {
  it("hoàn thành phiếu nháp song song 2 lần → chỉ nhập kho 1 lần", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { costPrice: 20_000, openingStock: 10_000 });
    const draft = await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 10_000, unitPrice: 30_000 }], {
        status: "draft",
      }),
    );
    const api = store.owner.api.purchases[":id"].complete;
    const results = await Promise.all([
      api.$post({ param: { id: draft.id } }),
      api.$post({ param: { id: draft.id } }),
    ]);
    const statuses: number[] = results.map((r) => r.status);
    expect(statuses.sort()).toEqual([200, 409]);
    expect(await productRow(p.id)).toMatchObject({ stock: 20_000, costPrice: 25_000 });
  });

  it("phiếu vừa bị sửa giữa lúc hoàn thành → không nhập theo dữ liệu cũ", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner);
    const draft = await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 1_000, unitPrice: 30_000 }], {
        status: "draft",
      }),
    );
    // Giả lập: service đã đọc dòng cũ, rồi một PUT thay toàn bộ dòng trước khi batch chạy.
    const oldLineId = draft.lines[0]!.id;
    await store.owner.api.purchases[":id"].$put({
      param: { id: draft.id },
      json: purchaseInput([{ productId: p.id, unitName: "Chai", qty: 5_000, unitPrice: 30_000 }]),
    });
    const storeDb = getDb(env, store.storeId);
    const err = await storeDb
      .batchAll([
        storeDb.documents.markCompleted(draft.id, Date.now(), oldLineId),
        storeDb.guardChanges(1),
      ])
      .catch((e: unknown) => e);
    expect(isGuardError(err)).toBe(true);
    // Hoàn thành bình thường thì theo dòng mới (5 chai).
    await store.owner.api.purchases[":id"].complete.$post({ param: { id: draft.id } });
    expect((await productRow(p.id)).stock).toBe(5_000);
  });

  it("giá vốn tính ngược chặn dưới 0; hủy khi cho phép bán âm thì được (tồn âm)", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { costPrice: 1_000, openingStock: 1_000 });
    const doc = await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 1_000, unitPrice: 100_000 }]),
    );
    // Ghi thẳng giá vốn thấp để công thức tính ngược ra số âm.
    await db.update(products).set({ costPrice: 10_000 }).where(eq(products.id, p.id));
    await store.owner.api.documents[":id"].cancel.$post({ param: { id: doc.id } });
    expect(await productRow(p.id)).toMatchObject({ stock: 1_000, costPrice: 0 });

    const neg = await createProduct(store.owner, { name: "Âm", allowNegative: true });
    const doc2 = await purchase(
      store.owner,
      purchaseInput([{ productId: neg.id, unitName: "Chai", qty: 2_000, unitPrice: 10_000 }]),
    );
    await sell(
      store.owner,
      saleInput([{ productId: neg.id, unitName: "Chai", qty: 2_000, unitPrice: 38_000 }]),
    );
    const res = await store.owner.api.documents[":id"].cancel.$post({ param: { id: doc2.id } });
    expect(res.status).toBe(200);
    expect((await productRow(neg.id)).stock).toBe(-2_000);
  });

  it("lỗi: key của hóa đơn bán, sai đơn vị, chiết khấu quá, NCC ngừng giao dịch khi hoàn thành", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { openingStock: 10_000 });
    const line = { productId: p.id, unitName: "Chai", qty: 1_000, unitPrice: 30_000 };
    const sold = saleInput([{ ...line, unitPrice: 38_000 }]);
    await sell(store.owner, sold);
    const conflict = await store.owner.api.purchases.$post({
      json: purchaseInput([line], { idempotencyKey: sold.idempotencyKey }),
    });
    expect((await errorOf(conflict)).code).toBe("IDEMPOTENCY_CONFLICT");
    const unit = await store.owner.api.purchases.$post({
      json: purchaseInput([{ ...line, unitName: "Thùng" }]),
    });
    expect((await errorOf(unit)).code).toBe("INVALID_UNIT");
    const disc = await store.owner.api.purchases.$post({
      json: purchaseInput([line], { discount: 40_000, paid: 0 }),
    });
    expect((await errorOf(disc)).code).toBe("INVALID_DISCOUNT");

    const ncc = await createContact(store.owner, { type: "supplier", name: "NCC" });
    const draft = await purchase(
      store.owner,
      purchaseInput([line], { status: "draft", contactId: ncc.id, paid: 0 }),
    );
    await store.owner.api.contacts[":id"].$put({
      param: { id: ncc.id },
      json: {
        name: "NCC",
        phone: null,
        address: null,
        note: null,
        debtLimit: null,
        isActive: false,
      },
    });
    const done = await store.owner.api.purchases[":id"].complete.$post({
      param: { id: draft.id },
    });
    expect((await errorOf(done)).code).toBe("INVALID_CONTACT");
  });

  it("staff không xem, không hủy được phiếu nhập", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner);
    const staff = await addStaff(store);
    const doc = await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 1_000, unitPrice: 30_000 }]),
    );
    expect((await staff.api.documents[":id"].$get({ param: { id: doc.id } })).status).toBe(403);
    const cancel = await staff.api.documents[":id"].cancel.$post({ param: { id: doc.id } });
    expect(cancel.status).toBe(403);
  });
});

describe("kiểm kho: ca biên", () => {
  async function countFor(owner: Awaited<ReturnType<typeof createStore>>["owner"], ids: string[]) {
    return (await owner.api["stock-counts"].$post({ json: { productIds: ids } })).json();
  }

  it("nhóm có hơn 200 hàng → TOO_MANY_LINES", async () => {
    const store = await createStore();
    const rows = Array.from({ length: 201 }, (_, i) => ({
      name: `Hàng ${i + 1}`,
      category: "Nhóm lớn",
      unit: "Cái",
      costPrice: 0,
      salePrice: 1_000,
      stock: 0,
      minStock: 0,
    }));
    const imported = await (await store.owner.api.products.import.$post({ json: { rows } })).json();
    expect(imported.succeeded).toBe(201);
    const cats = await (await store.owner.api.categories.$get()).json();
    const big = cats.items.find((c) => c.name === "Nhóm lớn")!;
    const res = await store.owner.api["stock-counts"].$post({ json: { categoryId: big.id } });
    expect((await errorOf(res)).code).toBe("TOO_MANY_LINES");
  });

  it("hoàn thành dùng số đếm mới nhất của dòng (đọc trong batch), lệch phải có lý do", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { barcode: "111", openingStock: 10_000 });
    const staff = await addStaff(store);
    const count = await countFor(store.owner, [p.id]);
    const scan = () =>
      staff.api["stock-counts"][":id"].scan.$post({
        param: { id: count.id },
        json: { barcode: "111" },
      });
    await scan();
    const api = store.owner.api["stock-counts"][":id"];
    const noReason = await api.complete.$post({ param: { id: count.id } });
    expect((await errorOf(noReason)).code).toBe("REASON_REQUIRED");
    await api.lines.$patch({
      param: { id: count.id },
      json: { lines: [{ lineId: count.lines[0]!.id, actualQty: 1_000, reason: "Mất, thất lạc" }] },
    });
    await scan();
    expect((await api.complete.$post({ param: { id: count.id } })).status).toBe(200);
    expect((await productRow(p.id)).stock).toBe(2_000);
  });

  it("câu chặn lý do trong batch: dòng lệch không có lý do làm cả batch rollback", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { openingStock: 10_000 });
    const count = await countFor(store.owner, [p.id]);
    const storeDb = getDb(env, store.storeId);
    await storeDb.batchAll([
      storeDb.documents.setCountLine(count.id, count.lines[0]!.id, 7_000, null),
    ]);
    const err = await storeDb
      .batchAll([
        storeDb.documents.markCompleted(count.id, Date.now()),
        storeDb.guardChanges(1),
        storeDb.stock.guardCountReasons(count.id),
        ...storeDb.stock.completeCountLineStatements({
          documentId: count.id,
          lineId: count.lines[0]!.id,
          productId: p.id,
          movementId: crypto.randomUUID(),
          now: Date.now(),
        }),
      ])
      .catch((e: unknown) => e);
    expect(isGuardError(err)).toBe(true);
    expect((await productRow(p.id)).stock).toBe(10_000);
    const view = await (
      await store.owner.api["stock-counts"][":id"].$get({ param: { id: count.id } })
    ).json();
    expect(view.status).toBe("draft");
  });

  it("PATCH lineId của phiếu khác → NOT_FOUND; quét trên phiếu đã hủy → INVALID_STATUS", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { barcode: "111" });
    const q = await createProduct(store.owner, { name: "Khác" });
    const a = await countFor(store.owner, [p.id]);
    const b = await countFor(store.owner, [q.id]);
    const res = await store.owner.api["stock-counts"][":id"].lines.$patch({
      param: { id: a.id },
      json: { lines: [{ lineId: b.lines[0]!.id, actualQty: 1 }] },
    });
    expect(res.status).toBe(404);
    await store.owner.api.documents[":id"].cancel.$post({ param: { id: a.id } });
    const scan = await store.owner.api["stock-counts"][":id"].scan.$post({
      param: { id: a.id },
      json: { barcode: "111" },
    });
    expect((await errorOf(scan)).code).toBe("INVALID_STATUS");
  });

  it("cô lập: B không quét trên phiếu của A, không hủy phiếu của A, không kiểm theo nhóm của A", async () => {
    const { a, b } = await createTwoStores();
    const p = await createProduct(a.owner, { barcode: "8934", openingStock: 1_000 });
    const count = await countFor(a.owner, [p.id]);
    const scan = await b.owner.api["stock-counts"][":id"].scan.$post({
      param: { id: count.id },
      json: { barcode: "8934" },
    });
    expect(scan.status).toBe(404);
    const cancel = await b.owner.api.documents[":id"].cancel.$post({ param: { id: count.id } });
    expect(cancel.status).toBe(404);
    const cat = await (await a.owner.api.categories.$post({ json: { name: "Nhóm A" } })).json();
    const byCat = await b.owner.api["stock-counts"].$post({ json: { categoryId: cat.id } });
    expect((await errorOf(byCat)).code).toBe("INVALID_CATEGORY");
    const view = await (
      await a.owner.api["stock-counts"][":id"].$get({ param: { id: count.id } })
    ).json();
    expect(view).toMatchObject({ status: "draft", lines: [{ actualQty: null }] });
  });
});
