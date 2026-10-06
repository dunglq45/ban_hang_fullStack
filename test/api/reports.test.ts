import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase, getDb } from "../../src/worker/db/client";
import { documents } from "../../src/worker/db/schema";
import { overview, revenueDaily, topProducts } from "../../src/worker/services/reports";
import { errorOf } from "../helpers/api";
import { createContact, createProduct } from "../helpers/catalog";
import { saleInput, sell } from "../helpers/sales";
import { addStaff, createStore, createTwoStores } from "../helpers/stores";

const db = createDatabase(env.DB);

// 00:00 ngày 06/10/2026 giờ VN.
const MIDNIGHT_VN = Date.UTC(2026, 9, 5, 17, 0, 0);

async function setCreatedAt(id: string, ts: number) {
  await db.update(documents).set({ createdAt: ts, completedAt: ts }).where(eq(documents.id, id));
}

/**
 * Nước mắm: vốn 31.000, bán 38.000, tồn 10, tối thiểu 6. Hai hóa đơn còn hiệu lực + một hóa đơn
 * đã hủy:
 * - s1: 2 chai, chiết khấu 6.000 → 70.000 (vốn 62.000)
 * - s2: 1 chai + 5 gói mì (vốn 3.000, bán 4.500) → 60.500 (vốn 46.000), khách nợ 30.500
 * - s3: 1 chai, bị hủy → không tính
 */
async function setup() {
  const store = await createStore();
  const mam = await createProduct(store.owner, { name: "Nước mắm 500ml", openingStock: 10_000 });
  const mi = await createProduct(store.owner, {
    name: "Mì gói tôm chua cay",
    baseUnit: "Gói",
    costPrice: 3_000,
    salePrice: 4_500,
    minStock: 0,
    openingStock: 100_000,
  });
  const out = await createProduct(store.owner, { name: "Bột giặt 3kg", minStock: 5_000 });
  const lan = await createContact(store.owner, { name: "Chị Lan" });
  const line = (qty: number) => ({
    productId: mam.id,
    unitName: "Chai",
    qty,
    unitPrice: 38_000,
  });
  const s1 = await sell(store.owner, saleInput([line(2_000)], { discount: 6_000 }));
  const s2 = await sell(
    store.owner,
    saleInput([line(1_000), { productId: mi.id, unitName: "Gói", qty: 5_000, unitPrice: 4_500 }], {
      contactId: lan.id,
      paid: 30_000,
    }),
  );
  const s3 = await sell(store.owner, saleInput([line(1_000)]));
  await store.owner.api.documents[":id"].cancel.$post({ param: { id: s3.id } });
  return { store, mam, mi, out, lan, s1, s2 };
}

describe("báo cáo", () => {
  it("overview hôm nay: doanh thu sau chiết khấu, lợi nhuận gộp theo giá vốn, phải thu, hàng cần nhập", async () => {
    const { store } = await setup();
    const res = await store.owner.api.reports.overview.$get({ query: { period: "today" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      revenue: 130_500,
      orders: 2,
      averageOrder: 65_250,
      costOfGoods: 108_000,
      grossProfit: 22_500,
      margin: 17.2, // 22.500 / 130.500 = 17,24%
      receivable: { amount: 30_500, customers: 1, overdueAmount: 0, overdueCustomers: 0 },
      // Nước mắm còn 7 (≤ 6? không) → chỉ Bột giặt hết hàng.
      restock: { total: 1, out: 1, low: 0 },
    });
  });

  it("đơn lúc 23:30 giờ VN tính vào đúng ngày; ngày không bán ra 0", async () => {
    const { store, s1, s2 } = await setup();
    await setCreatedAt(s2.id, MIDNIGHT_VN - 30 * 60_000); // 23:30 ngày 05/10 giờ VN
    await setCreatedAt(s1.id, MIDNIGHT_VN + 10 * 60_000); // 00:10 ngày 06/10 giờ VN
    const storeDb = getDb(env, store.storeId);
    const now = MIDNIGHT_VN + 9 * 3_600_000; // 09:00 ngày 06/10 giờ VN

    const daily = await revenueDaily(storeDb, 3, now);
    expect(daily.items).toEqual([
      { date: "2026-10-04", from: MIDNIGHT_VN - 2 * 86_400_000, revenue: 0, orders: 0 },
      { date: "2026-10-05", from: MIDNIGHT_VN - 86_400_000, revenue: 60_500, orders: 1 },
      { date: "2026-10-06", from: MIDNIGHT_VN, revenue: 70_000, orders: 1 },
    ]);
    expect(daily.total).toBe(130_500);

    const today = await overview(storeDb, { period: "today" }, now);
    expect(today).toMatchObject({ revenue: 70_000, orders: 1, grossProfit: 8_000, margin: 11.4 });
    // Lúc 23:45 tối 05/10, "hôm nay" là ngày 05/10.
    const lateNight = await overview(storeDb, { period: "today" }, MIDNIGHT_VN - 15 * 60_000);
    expect(lateNight).toMatchObject({ revenue: 60_500, orders: 1 });
    const custom = await overview(
      storeDb,
      { period: "today", from: "2026-10-05", to: "2026-10-06" },
      now,
    );
    expect(custom.revenue).toBe(130_500);
    const none = await overview(storeDb, { period: "today" }, now + 86_400_000);
    expect(none).toMatchObject({ revenue: 0, orders: 0, averageOrder: 0, margin: null });
  });

  it("top-products theo số lượng / doanh thu; restock: hết hàng trước, sắp hết sau", async () => {
    const { store, mam, mi, out } = await setup();
    const storeDb = getDb(env, store.storeId);
    const byQty = await topProducts(storeDb, { period: "today", sort: "qty", limit: 10 });
    expect(byQty.items.map((t) => [t.rank, t.productId, t.qty, t.revenue])).toEqual([
      [1, mi.id, 5_000, 22_500],
      [2, mam.id, 3_000, 114_000],
    ]);
    const res = await store.owner.api.reports["top-products"].$get({
      query: { sort: "revenue", limit: "1" },
    });
    expect((await res.json()).items).toMatchObject([{ name: "Nước mắm 500ml", baseUnit: "Chai" }]);

    // Bán thêm để Nước mắm còn 6 chai (= tối thiểu) → sắp hết.
    await sell(
      store.owner,
      saleInput([{ productId: mam.id, unitName: "Chai", qty: 1_000, unitPrice: 38_000 }]),
    );
    const restock = await (await store.owner.api.reports.restock.$get({ query: {} })).json();
    expect(restock.items.map((r) => [r.id, r.status, r.stock, r.minStock])).toEqual([
      [out.id, "out", 0, 5_000],
      [mam.id, "low", 6_000, 6_000],
    ]);
    expect(restock.counts).toEqual({ out: 1, low: 1 });
  });

  it("revenue-daily qua API đủ N ngày; tham số sai → VALIDATION_ERROR; staff → 403", async () => {
    const { store } = await setup();
    const daily = await (
      await store.owner.api.reports["revenue-daily"].$get({ query: { days: "7" } })
    ).json();
    expect(daily.items).toHaveLength(7);
    expect(daily.items[6]).toMatchObject({ revenue: 130_500, orders: 2 });
    const bad = await store.owner.api.reports.overview.$get({
      query: { from: "2026-10-05", to: "2026-10-01" },
    });
    expect((await errorOf(bad)).code).toBe("VALIDATION_ERROR");
    const half = await store.owner.api.reports.overview.$get({ query: { from: "2026-10-05" } });
    expect(half.status).toBe(400);

    const staff = await addStaff(store);
    expect((await staff.api.reports.overview.$get({ query: {} })).status).toBe(403);
    expect((await staff.api.reports.restock.$get({ query: {} })).status).toBe(403);
  });

  it("cô lập: báo cáo của B không có số liệu của A", async () => {
    const { a, b } = await createTwoStores();
    const p = await createProduct(a.owner, { openingStock: 5_000 });
    await sell(
      a.owner,
      saleInput([{ productId: p.id, unitName: "Chai", qty: 1_000, unitPrice: 38_000 }]),
    );
    const ov = await (await b.owner.api.reports.overview.$get({ query: {} })).json();
    expect(ov).toMatchObject({ revenue: 0, orders: 0, restock: { total: 0 } });
    const top = await (await b.owner.api.reports["top-products"].$get({ query: {} })).json();
    expect(top.items).toEqual([]);
  });
});
