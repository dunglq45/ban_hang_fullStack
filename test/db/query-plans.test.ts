// Rà hiệu năng (giai đoạn 15): ghi lại mọi câu SQL mà các màn danh sách và báo cáo chạy, rồi
// EXPLAIN QUERY PLAN từng câu. Bảng lớn dần theo thời gian (chứng từ, dòng chứng từ, sổ kho,
// sổ công nợ, phiếu thu chi, hàng hóa, danh bạ) không được quét toàn bảng: phải đi qua index
// bắt đầu bằng store_id.
// Giới hạn: kế hoạch lấy trên DB nhỏ, chưa có thống kê (sqlite_stat1); nếu production chạy ANALYZE
// thì planner có thể chọn khác (trừ chỗ đã ép thứ tự bằng CROSS JOIN). Luật chỉ bắt trường hợp đọc
// theo `store_id` đơn thuần; `(store_id, type)` không kèm khoảng ngày vẫn qua vì danh sách có
// LIMIT và đi theo thứ tự index (created_at), dừng sớm sau một trang.
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../../src/worker/app";
import { createContact, createProduct } from "../helpers/catalog";
import { saleInput, sell } from "../helpers/sales";
import { createStore } from "../helpers/stores";

interface Captured {
  sql: string;
  params: unknown[];
}

/** D1 bọc lại để ghi câu SQL + tham số mỗi lần prepare/bind. */
function recordingDb(captured: Captured[]): D1Database {
  return new Proxy(env.DB, {
    get(target, prop) {
      if (prop === "prepare") {
        return (sql: string) => {
          const entry: Captured = { sql, params: [] };
          captured.push(entry);
          const stmt = target.prepare(sql);
          return new Proxy(stmt, {
            get(s, p) {
              if (p === "bind") {
                return (...params: unknown[]) => {
                  entry.params = params;
                  return s.bind(...params);
                };
              }
              const value = Reflect.get(s, p, s) as unknown;
              return typeof value === "function" ? value.bind(s) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const BIG_TABLES = [
  "documents",
  "document_lines",
  "stock_movements",
  "debt_entries",
  "payments",
  "products",
  "product_units",
  "contacts",
];
/**
 * Bảng phình mãi theo thời gian (chứng từ, sổ cái): chỉ lọc store_id là đọc hết lịch sử của cửa
 * hàng. Hàng hóa/danh bạ thì chấp nhận (vài nghìn dòng, tìm "chứa chữ" vốn không dùng index được).
 */
const GROWING_TABLES = [
  "documents",
  "document_lines",
  "stock_movements",
  "debt_entries",
  "payments",
];

/** Dòng kế hoạch đọc hết một bảng lớn, hoặc hết lịch sử một cửa hàng ở bảng phình theo thời gian. */
function badSteps(plan: { detail: string }[]): string[] {
  return plan
    .map((r) => r.detail.trim())
    .filter((d) => {
      // "SCAN t", "SCAN t AS x", "SCAN t USING [COVERING] INDEX i": đều là đọc toàn bảng/toàn index.
      const scan = /^SCAN (\w+)/.exec(d);
      if (scan) return BIG_TABLES.includes(scan[1]!);
      const storeOnly =
        /^SEARCH (\w+)(?: AS \w+)? USING (?:COVERING )?INDEX \w+ \(store_id=\?\)/.exec(d);
      return storeOnly !== null && GROWING_TABLES.includes(storeOnly[1]!);
    });
}

describe("kế hoạch truy vấn của màn danh sách và báo cáo", () => {
  it("không quét toàn bảng lớn, không đọc hết lịch sử cửa hàng", async () => {
    const store = await createStore();
    const product = await createProduct(store.owner, {
      barcode: "8930000000017",
      openingStock: 50_000,
    });
    const customer = await createContact(store.owner);
    const sale = await sell(
      store.owner,
      saleInput([{ productId: product.id, unitName: "Chai", qty: 1_000, unitPrice: 38_000 }], {
        contactId: customer.id,
        paid: 0,
      }),
    );

    const from = Date.now() - 7 * 86_400_000;
    const paths = [
      ...["name", "code", "newest", "stock_asc", "stock_desc"].map(
        (sort) => `/api/products?sort=${sort}`,
      ),
      ...["low", "out", "inactive"].map((status) => `/api/products?status=${status}&q=nuoc`),
      "/api/products?categoryId=01900000-0000-7000-8000-000000000000&page=2",
      "/api/products/pos",
      "/api/products/lookup?barcode=8930000000017",
      `/api/products/${product.id}`,
      `/api/products/${product.id}/movements?type=sale&from=${from}`,
      ...["name", "debt_desc", "debt_since_asc"].map(
        (sort) => `/api/contacts?type=customer&hasDebt=true&sort=${sort}`,
      ),
      "/api/contacts?type=supplier&q=lan&overdueDays=30",
      `/api/contacts/${customer.id}`,
      `/api/contacts/${customer.id}/debt-entries?page=2`,
      "/api/debts/summary",
      "/api/documents?type=sale&status=completed",
      `/api/documents?type=sale&from=${from}&to=${Date.now()}`,
      `/api/documents?type=sale&contactId=${customer.id}`,
      "/api/documents?type=purchase&q=PN0001",
      "/api/documents?type=stock_count&status=draft",
      `/api/documents/${sale.id}`,
      ...["today", "7d", "month"].map((period) => `/api/reports/overview?period=${period}`),
      "/api/reports/revenue-daily?days=30",
      "/api/reports/top-products?period=7d&sort=revenue",
      "/api/reports/restock",
    ];

    const captured: Captured[] = [];
    const recordingEnv = { ...env, DB: recordingDb(captured) };
    for (const path of paths) {
      const res = await app.request(
        path,
        { headers: { Cookie: store.owner.cookie } },
        recordingEnv,
      );
      expect(res.status, `${path}: ${await res.clone().text()}`).toBe(200);
    }

    const selects = captured.filter((c) => /^\s*(select|with)\b/i.test(c.sql));
    expect(selects.length).toBeGreaterThan(20);
    const problems: string[] = [];
    for (const { sql, params } of selects) {
      const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .bind(...params)
        .all<{ detail: string }>();
      const scans = badSteps(plan.results);
      if (scans.length > 0) problems.push(`${scans.join(", ")} ← ${sql}`);
    }
    expect(problems).toEqual([]);
  });
});
