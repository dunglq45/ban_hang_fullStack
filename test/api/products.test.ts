import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/worker/db/client";
import { documentLines, documents, products, stockMovements } from "../../src/worker/db/schema";
import { errorOf } from "../helpers/api";
import { createProduct, productInput } from "../helpers/catalog";
import { purchase, purchaseInput, saleInput, sell } from "../helpers/sales";
import { addStaff, createStore } from "../helpers/stores";

const db = createDatabase(env.DB);

describe("tạo hàng hóa", () => {
  it("mã tự sinh SP000001, có đơn vị quy đổi, tồn đầu kỳ ghi qua phiếu KK và sổ kho", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, {
      barcode: "8934567890123",
      openingStock: 24_000,
      units: [{ name: "Thùng", factor: 12, salePrice: 440_000, barcode: "18934567890120" }],
    });
    expect(p).toMatchObject({
      code: "SP000001",
      name: "Nước mắm 500ml",
      baseUnit: "Chai",
      stock: 24_000,
      costPrice: 31_000,
      salePrice: 38_000,
      units: [{ name: "Thùng", factor: 12, salePrice: 440_000, barcode: "18934567890120" }],
    });

    const row = await db.select().from(products).where(eq(products.id, p.id)).get();
    expect(row?.nameSearch).toBe("nuoc mam 500ml sp000001 8934567890123");

    const docs = await db.select().from(documents).where(eq(documents.storeId, store.storeId));
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ type: "stock_count", code: "KK000001", status: "completed" });
    const lines = await db
      .select()
      .from(documentLines)
      .where(eq(documentLines.documentId, docs[0]!.id));
    expect(lines).toMatchObject([
      { productId: p.id, systemQty: 0, actualQty: 24_000, baseQty: 24_000, lineTotal: 744_000 },
    ]);
    const moves = await db.select().from(stockMovements).where(eq(stockMovements.productId, p.id));
    expect(moves).toMatchObject([
      {
        type: "adjust",
        qtyChange: 24_000,
        stockAfter: 24_000,
        unitCost: 31_000,
        note: "Tồn đầu kỳ",
      },
    ]);
  });

  it("tồn đầu kỳ = 0 thì không tạo phiếu kiểm kho", async () => {
    const store = await createStore();
    await createProduct(store.owner);
    const docs = await db.select().from(documents).where(eq(documents.storeId, store.storeId));
    expect(docs).toEqual([]);
  });

  it("mã nhập tay đúng mẫu đẩy bộ đếm lên; trùng mã → CODE_TAKEN", async () => {
    const store = await createStore();
    await createProduct(store.owner, { code: "SP000050" });
    const next = await createProduct(store.owner, { name: "Mì gói" });
    expect(next.code).toBe("SP000051");
    const custom = await createProduct(store.owner, { name: "Gạo", code: "GAO-ST25" });
    expect(custom.code).toBe("GAO-ST25");

    const dup = await store.owner.api.products.$post({ json: productInput({ code: "SP000050" }) });
    expect(dup.status).toBe(409);
    expect((await errorOf(dup)).code).toBe("CODE_TAKEN");
  });

  it("mã vạch trùng với hàng khác hoặc với đơn vị của hàng khác → BARCODE_TAKEN", async () => {
    const store = await createStore();
    await createProduct(store.owner, {
      barcode: "111",
      units: [{ name: "Thùng", factor: 12, salePrice: null, barcode: "222" }],
    });
    for (const json of [
      productInput({ name: "A", barcode: "111" }),
      productInput({ name: "B", barcode: "222" }),
      productInput({
        name: "C",
        units: [{ name: "Lốc", factor: 6, salePrice: null, barcode: "111" }],
      }),
    ]) {
      const res = await store.owner.api.products.$post({ json });
      expect(res.status).toBe(409);
      expect((await errorOf(res)).code).toBe("BARCODE_TAKEN");
    }
  });

  it("đơn vị: factor > 1, tên không trùng nhau và không trùng đơn vị cơ bản", async () => {
    const store = await createStore();
    const cases = [
      [{ name: "Lốc", factor: 1, salePrice: null, barcode: null }],
      [{ name: "chai", factor: 6, salePrice: null, barcode: null }],
      [
        { name: "Thùng", factor: 12, salePrice: null, barcode: null },
        { name: "THÙNG", factor: 24, salePrice: null, barcode: null },
      ],
      [{ name: "Thùng", factor: 12, salePrice: null, barcode: "999" }],
    ];
    for (const [i, units] of cases.entries()) {
      const res = await store.owner.api.products.$post({
        json: productInput({ units, barcode: i === 3 ? "999" : null }),
      });
      expect(res.status, JSON.stringify(units)).toBe(400);
      expect((await errorOf(res)).code).toBe("VALIDATION_ERROR");
    }
  });

  it("nhóm hàng phải thuộc cửa hàng; staff không tạo được hàng", async () => {
    const store = await createStore();
    const bad = await store.owner.api.products.$post({
      json: productInput({ categoryId: "khong-co" }),
    });
    expect((await errorOf(bad)).code).toBe("INVALID_CATEGORY");
    const staff = await addStaff(store);
    const res = await staff.api.products.$post({ json: productInput() });
    expect(res.status).toBe(403);
  });

  it("gửi lại cùng idempotencyKey (mạng chập chờn, bấm hai lần) trả lại hàng cũ, không tạo thêm", async () => {
    const store = await createStore();
    const key = crypto.randomUUID();
    const input = productInput({ idempotencyKey: key, openingStock: 24_000 });

    const first = await store.owner.api.products.$post({ json: input });
    expect(first.status).toBe(201);
    const created = await first.json();

    // Gửi lại với nội dung khác cũng trả về hàng CŨ (không so nội dung, giống chứng từ).
    const second = await store.owner.api.products.$post({
      json: { ...input, name: "Tên khác" },
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ id: created.id, name: created.name });

    const rows = await db.select().from(products).where(eq(products.storeId, store.storeId));
    expect(rows).toHaveLength(1);
    const docs = await db.select().from(documents).where(eq(documents.storeId, store.storeId));
    expect(docs).toHaveLength(1); // không tạo thêm phiếu "Tồn đầu kỳ"

    // Hai request song song (race): request thứ hai vấp UNIQUE idempotency, đọc lại và trả hàng cũ.
    const key2 = crypto.randomUUID();
    const [a, b] = await Promise.all([
      store.owner.api.products.$post({
        json: productInput({ idempotencyKey: key2, name: "Đua A" }),
      }),
      store.owner.api.products.$post({
        json: productInput({ idempotencyKey: key2, name: "Đua B" }),
      }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    const [ja, jb] = await Promise.all([a.json(), b.json()]);
    expect(ja.id).toBe(jb.id);
    const rows2 = await db
      .select()
      .from(products)
      .where(and(eq(products.storeId, store.storeId), eq(products.idempotencyKey, key2)));
    expect(rows2).toHaveLength(1);
  });
});

describe("sửa hàng hóa", () => {
  it("thay toàn bộ đơn vị, bỏ qua stock/costPrice, cập nhật name_search, bỏ trống mã thì giữ mã", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, {
      openingStock: 5_000,
      units: [{ name: "Thùng", factor: 12, salePrice: null, barcode: null }],
    });
    const res = await store.owner.api.products[":id"].$put({
      param: { id: p.id },
      json: {
        ...productInput({ name: "Nước tương Maggi", code: null, salePrice: 20_000 }),
        units: [{ name: "Lốc", factor: 6, salePrice: 115_000, barcode: "333" }],
        // Gửi kèm cũng bị bỏ qua:
        ...({ stock: 999_000, costPrice: 1 } as object),
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      code: p.code,
      name: "Nước tương Maggi",
      salePrice: 20_000,
      stock: 5_000,
      costPrice: 31_000,
      units: [{ name: "Lốc", factor: 6, salePrice: 115_000, barcode: "333" }],
    });
    const found = await store.owner.api.products.$get({ query: { q: "nuoc tuong" } });
    expect((await found.json()).items.map((i) => i.id)).toEqual([p.id]);
    const old = await store.owner.api.products.$get({ query: { q: "nuoc mam" } });
    expect((await old.json()).items).toEqual([]);
  });

  it("đang tồn âm thì không tắt được cho phép bán âm → NEGATIVE_STOCK", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { allowNegative: true });
    await db.update(products).set({ stock: -2_000 }).where(eq(products.id, p.id));
    const res = await store.owner.api.products[":id"].$put({
      param: { id: p.id },
      json: productInput({ allowNegative: false }),
    });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("NEGATIVE_STOCK");
  });

  it("mã vạch của chính nó không tính là trùng khi sửa", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { barcode: "777" });
    const res = await store.owner.api.products[":id"].$put({
      param: { id: p.id },
      json: productInput({ barcode: "777", name: "Đổi tên" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("danh sách hàng hóa", () => {
  async function seed() {
    const store = await createStore();
    const owner = store.owner;
    const ids = {
      nuocMam: (await createProduct(owner, { name: "Nước mắm 500ml", openingStock: 2_000 })).id,
      mi: (
        await createProduct(owner, {
          name: "Mì Hảo Hảo",
          minStock: 0,
          openingStock: 50_000,
          costPrice: 3_500,
        })
      ).id,
      duong: (await createProduct(owner, { name: "Đường cát 1kg", openingStock: 0 })).id,
      ngung: (await createProduct(owner, { name: "Bánh cũ", isActive: false, openingStock: 1_000 }))
        .id,
      gao: (
        await createProduct(owner, {
          name: "Gạo ST25",
          barcode: "8930001",
          openingStock: 1_500,
          costPrice: 20_000,
          minStock: 0,
        })
      ).id,
    };
    return { store, ids };
  }

  it('tìm không dấu: "nuoc mam" ra "Nước mắm 500ml"; tìm theo mã và mã vạch', async () => {
    const { store, ids } = await seed();
    const api = store.owner.api.products;
    const byName = await (await api.$get({ query: { q: "nuoc mam" } })).json();
    expect(byName.items.map((i) => i.name)).toEqual(["Nước mắm 500ml"]);
    const byAccent = await (await api.$get({ query: { q: "ĐƯỜNG" } })).json();
    expect(byAccent.items.map((i) => i.id)).toEqual([ids.duong]);
    const byBarcode = await (await api.$get({ query: { q: "8930001" } })).json();
    expect(byBarcode.items.map((i) => i.id)).toEqual([ids.gao]);
    const byCode = await (await api.$get({ query: { q: "sp000002" } })).json();
    expect(byCode.items.map((i) => i.id)).toEqual([ids.mi]);
    const wildcard = await (await api.$get({ query: { q: "%" } })).json();
    expect(wildcard.items).toEqual([]);
  });

  it("lọc sắp hết / hết hàng / ngừng bán và đếm từng tab", async () => {
    const { store, ids } = await seed();
    const api = store.owner.api.products;
    const get = async (status: "all" | "low" | "out" | "inactive") =>
      (await api.$get({ query: { status } })).json();

    const low = await get("low");
    expect(low.items.map((i) => i.id)).toEqual([ids.nuocMam]);
    const out = await get("out");
    expect(out.items.map((i) => i.id)).toEqual([ids.duong]);
    const inactive = await get("inactive");
    expect(inactive.items.map((i) => i.id)).toEqual([ids.ngung]);
    const all = await get("all");
    expect(all.total).toBe(5);
    expect(all.counts).toEqual({ all: 5, low: 1, out: 1, inactive: 1 });
  });

  it("sắp xếp, phân trang và giá trị tồn kho (chỉ owner)", async () => {
    const { store } = await seed();
    const page1 = await (
      await store.owner.api.products.$get({ query: { sort: "stock_desc", pageSize: "2" } })
    ).json();
    expect(page1.items.map((i) => i.name)).toEqual(["Mì Hảo Hảo", "Nước mắm 500ml"]);
    expect(page1).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    // 2 chai × 31.000 + 50 × 3.500 + 1 × 31.000 (ngừng bán vẫn tính) + 1,5 × 20.000
    expect(page1.stockValue).toBe(62_000 + 175_000 + 31_000 + 30_000);

    const page3 = await (
      await store.owner.api.products.$get({ query: { sort: "name", page: "3", pageSize: "2" } })
    ).json();
    expect(page3.items.map((i) => i.name)).toEqual(["Nước mắm 500ml"]);
  });
});

describe("staff không thấy giá vốn", () => {
  it("list, chi tiết, tra mã vạch, sổ kho: không có costPrice, stockValue, unitCost", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { barcode: "555", openingStock: 3_000 });
    const staff = await addStaff(store);

    const list = await (await staff.api.products.$get({ query: {} })).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).not.toHaveProperty("costPrice");
    expect(list).not.toHaveProperty("stockValue");

    const detail = await (await staff.api.products[":id"].$get({ param: { id: p.id } })).json();
    expect(detail).not.toHaveProperty("costPrice");
    expect(detail).toMatchObject({ salePrice: 38_000, stock: 3_000 });

    const lookup = await (
      await staff.api.products.lookup.$get({ query: { barcode: "555" } })
    ).json();
    expect(lookup.product).not.toHaveProperty("costPrice");

    const moves = await (
      await staff.api.products[":id"].movements.$get({ param: { id: p.id }, query: {} })
    ).json();
    expect(moves.items).toHaveLength(1);
    expect(moves.items[0]).not.toHaveProperty("unitCost");

    const pos = await (await staff.api.products.pos.$get()).json();
    expect(JSON.stringify(pos)).not.toContain("costPrice");

    // Owner thì có.
    const ownerList = await (await store.owner.api.products.$get({ query: {} })).json();
    expect(ownerList.items[0]?.costPrice).toBe(31_000);
    expect(ownerList.stockValue).toBe(93_000);
  });
});

describe("tra mã vạch, POS, lịch sử kho", () => {
  it("mã vạch hàng → unit null; mã vạch thùng → kèm đơn vị; không có → 404", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, {
      barcode: "8934",
      units: [{ name: "Thùng", factor: 12, salePrice: 440_000, barcode: "18934" }],
    });
    const api = store.owner.api.products.lookup;
    const a = await (await api.$get({ query: { barcode: "8934" } })).json();
    expect(a).toMatchObject({ product: { id: p.id }, unit: null });
    const b = await (await api.$get({ query: { barcode: "18934" } })).json();
    expect(b).toMatchObject({ product: { id: p.id }, unit: { name: "Thùng", factor: 12 } });
    const none = await api.$get({ query: { barcode: "000" } });
    expect(none.status).toBe(404);
  });

  it("POS chỉ có hàng đang bán và hiện ở POS, kèm đơn vị", async () => {
    const store = await createStore();
    const shown = await createProduct(store.owner, {
      minStock: 5_000,
      units: [{ name: "Thùng", factor: 12, salePrice: null, barcode: null }],
    });
    await createProduct(store.owner, { name: "Ẩn", showInPos: false });
    await createProduct(store.owner, { name: "Ngừng", isActive: false });
    const pos = await (await store.owner.api.products.pos.$get()).json();
    expect(pos.items.map((i) => i.id)).toEqual([shown.id]);
    expect(pos.items[0]).toMatchObject({
      code: shown.code,
      baseUnit: "Chai",
      salePrice: 38_000,
      minStock: 5_000,
      units: [{ name: "Thùng", factor: 12 }],
    });
  });

  it("lịch sử kho kèm mã chứng từ; lọc theo loại và thời gian", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, { openingStock: 10_000 });
    const api = store.owner.api.products[":id"].movements;
    const all = await (await api.$get({ param: { id: p.id }, query: {} })).json();
    expect(all.items).toMatchObject([
      {
        type: "adjust",
        qtyChange: 10_000,
        stockAfter: 10_000,
        documentCode: "KK000001",
        documentType: "stock_count",
        contactName: null,
        note: "Tồn đầu kỳ",
      },
    ]);
    const sales = await (await api.$get({ param: { id: p.id }, query: { type: "sale" } })).json();
    expect(sales.total).toBe(0);
    const future = await (
      await api.$get({ param: { id: p.id }, query: { from: String(Date.now() + 60_000) } })
    ).json();
    expect(future.items).toEqual([]);
  });
});

describe("nhập hàng từ Excel", () => {
  it("3 dòng (1 dòng lỗi) → 2 thành công, tạo nhóm mới, tồn đầu kỳ cùng một phiếu", async () => {
    const store = await createStore();
    const res = await store.owner.api.products.import.$post({
      json: {
        rows: [
          {
            name: "Bia Sài Gòn",
            category: "Bia rượu",
            unit: "Lon",
            costPrice: 9_500,
            salePrice: 12_000,
            stock: 48_000,
            minStock: 12_000,
            barcode: "8935",
          },
          {
            name: "",
            category: "Bia rượu",
            unit: "Lon",
            costPrice: 1,
            salePrice: 2,
            stock: 0,
            minStock: 0,
          },
          {
            code: "SP000900",
            name: "Nước suối",
            category: "đồ uống",
            unit: "Chai",
            costPrice: 3_000,
            salePrice: 5_000,
            stock: 0,
            minStock: 0,
          },
        ],
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      total: 3,
      succeeded: 2,
      failed: 1,
      createdCategories: ["Bia rượu"],
    });
    expect(body.rows).toMatchObject([
      { row: 1, ok: true, code: "SP000001" },
      { row: 2, ok: false, error: "Vui lòng nhập tên hàng" },
      { row: 3, ok: true, code: "SP000900" },
    ]);

    const list = await (await store.owner.api.products.$get({ query: { sort: "code" } })).json();
    expect(list.items.map((i) => [i.name, i.categoryName, i.stock])).toEqual([
      ["Bia Sài Gòn", "Bia rượu", 48_000],
      // "đồ uống" khớp nhóm mặc định "Đồ uống" (không phân biệt dấu, hoa thường)
      ["Nước suối", "Đồ uống", 0],
    ]);
    const kk = await db
      .select()
      .from(documents)
      .where(and(eq(documents.storeId, store.storeId), eq(documents.type, "stock_count")));
    expect(kk).toHaveLength(1);
  });

  it("trùng mã/mã vạch trong file hoặc với hàng đã có → dòng đó lỗi, dòng khác vẫn lưu", async () => {
    const store = await createStore();
    await createProduct(store.owner, { code: "CU-01", barcode: "100" });
    const row = (name: string, extra: object = {}) => ({
      name,
      unit: "Cái",
      costPrice: 0,
      salePrice: 1_000,
      stock: 0,
      minStock: 0,
      ...extra,
    });
    const body = await (
      await store.owner.api.products.import.$post({
        json: {
          rows: [
            row("A", { code: "CU-01" }),
            row("B", { barcode: "100" }),
            row("C", { barcode: "200" }),
            row("D", { barcode: "200" }),
            row("E", { stock: -1 }),
          ],
        },
      })
    ).json();
    expect(body.rows.map((r) => r.ok)).toEqual([false, false, true, false, false]);
    expect(body.succeeded).toBe(1);
  });

  it("quá 500 dòng → VALIDATION_ERROR", async () => {
    const store = await createStore();
    const res = await store.owner.api.products.import.$post({
      json: { rows: Array.from({ length: 501 }, () => ({})) },
    });
    expect((await errorOf(res)).code).toBe("VALIDATION_ERROR");
  });
});

describe("nhập Excel: nhóm lỗi thì ghi lại từng dòng", () => {
  const row = (name: string, extra: object = {}) => ({
    name,
    unit: "Cái",
    costPrice: 1_000,
    salePrice: 2_000,
    stock: 1_000,
    minStock: 0,
    ...extra,
  });

  it("dòng mã tự sinh và dòng nhập tay trùng mã đó trong cùng nhóm: dòng đầu lưu, dòng sau CODE_TAKEN", async () => {
    const store = await createStore();
    const body = await (
      await store.owner.api.products.import.$post({
        json: { rows: [row("A"), row("B", { code: "SP000001" }), row("C")] },
      })
    ).json();
    expect(body.rows).toMatchObject([
      { row: 1, ok: true, code: "SP000001" },
      { row: 2, ok: false, error: "Mã hàng này đã tồn tại" },
      { row: 3, ok: true, code: "SP000002" },
    ]);
    // Sổ kho khớp tồn với từng hàng đã lưu.
    const list = await (await store.owner.api.products.$get({ query: { sort: "code" } })).json();
    expect(list.items.map((i) => [i.code, i.stock])).toEqual([
      ["SP000001", 1_000],
      ["SP000002", 1_000],
    ]);
    const moves = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.storeId, store.storeId));
    expect(moves).toHaveLength(2);
  });

  it("hơn 20 dòng: chia nhiều batch, mỗi batch một phiếu tồn đầu kỳ, mã liên tục", async () => {
    const store = await createStore();
    const rows = Array.from({ length: 45 }, (_, i) => row(`Hàng ${i + 1}`));
    const body = await (await store.owner.api.products.import.$post({ json: { rows } })).json();
    expect(body.succeeded).toBe(45);
    expect(body.rows.at(-1)).toMatchObject({ row: 45, code: "SP000045" });
    const kk = await db
      .select()
      .from(documents)
      .where(and(eq(documents.storeId, store.storeId), eq(documents.type, "stock_count")));
    expect(kk.map((d) => d.code).sort()).toEqual(["KK000001", "KK000002", "KK000003"]);
  });
});

describe("chi tiết hàng: đã bán 30 ngày, phiếu nhập gần nhất", () => {
  it("cộng hóa đơn bán (theo đơn vị cơ bản), bỏ hóa đơn đã hủy và hóa đơn quá 30 ngày", async () => {
    const store = await createStore();
    const p = await createProduct(store.owner, {
      openingStock: 100_000,
      units: [{ name: "Thùng", factor: 12, salePrice: null, barcode: null }],
    });
    const fresh = await (
      await store.owner.api.products[":id"].$get({ param: { id: p.id } })
    ).json();
    expect(fresh).toMatchObject({ sold30d: 0, lastPurchase: null });

    await sell(
      store.owner,
      saleInput([{ productId: p.id, unitName: "Chai", qty: 3_000, unitPrice: 38_000 }]),
    );
    await sell(
      store.owner,
      saleInput([{ productId: p.id, unitName: "Thùng", qty: 1_000, unitPrice: 400_000 }]),
    );
    const cancelled = await sell(
      store.owner,
      saleInput([{ productId: p.id, unitName: "Chai", qty: 5_000, unitPrice: 38_000 }]),
    );
    await store.owner.api.documents[":id"].cancel.$post({ param: { id: cancelled.id } });
    // Hóa đơn cũ hơn 30 ngày: lùi thời gian tạo.
    const old = await sell(
      store.owner,
      saleInput([{ productId: p.id, unitName: "Chai", qty: 7_000, unitPrice: 38_000 }]),
    );
    await db
      .update(documents)
      .set({ createdAt: Date.now() - 31 * 86_400_000 })
      .where(eq(documents.id, old.id));

    const pn = await purchase(
      store.owner,
      purchaseInput([{ productId: p.id, unitName: "Chai", qty: 10_000, unitPrice: 30_000 }]),
    );
    const res = await store.owner.api.products[":id"].$get({ param: { id: p.id } });
    const detail = await res.json();
    expect(detail.sold30d).toBe(15_000);
    expect(detail.lastPurchase).toEqual({ id: pn.id, code: pn.code, createdAt: pn.createdAt });

    // Nhân viên thấy đã bán 30 ngày, không thấy giá vốn lẫn phiếu nhập gần nhất (gắn với giá vốn).
    const staff = await addStaff(store);
    const staffView = await (await staff.api.products[":id"].$get({ param: { id: p.id } })).json();
    expect(staffView).toMatchObject({ sold30d: 15_000 });
    expect(staffView).not.toHaveProperty("costPrice");
    expect(staffView).not.toHaveProperty("lastPurchase");
  });
});
