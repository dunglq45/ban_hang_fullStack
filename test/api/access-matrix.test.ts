// Ma trận phân quyền cho MỌI route của app (rà soát bảo mật giai đoạn 15). Quyền mong đợi lấy từ
// bảng endpoint của tài liệu API (src/worker/dev/openapi.ts, test docs.test.ts bắt thêm route mới
// vào bảng), nên route mới tự được kiểm tra:
// - chưa đăng nhập → 401 (trừ route public);
// - nhân viên gọi route "owner" → 403;
// - nhân viên gọi mọi route GET "user" trên dữ liệu thật → không có trường giá vốn/lợi nhuận/giá trị.
import { describe, expect, it } from "vitest";
import { app } from "../../src/worker/app";
import { documentedAccess } from "../../src/worker/dev/openapi";
import { rawFetch } from "../helpers/api";
import { createContact, createProduct } from "../helpers/catalog";
import { purchase, purchaseInput, saleInput, sell } from "../helpers/sales";
import { addStaff, createStore } from "../helpers/stores";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const FAKE_ID = "01900000-0000-7000-8000-000000000000";

const routes = [
  ...new Set(
    app.routes
      .filter((r) => METHODS.has(r.method) && !r.path.startsWith("/api/docs"))
      .map((r) => `${r.method} ${r.path}`),
  ),
];
const access = documentedAccess();

function fillParams(path: string, ids: Record<string, string> = {}): string {
  return path
    .replace("/:key{.+}", `/${ids.key ?? "khong-co/anh.png"}`)
    .replace(/:id\b/g, ids.id ?? FAKE_ID);
}

function call(route: string, cookie?: string, path?: string) {
  const [method, pattern] = route.split(" ") as [string, string];
  const write = method !== "GET";
  return rawFetch(path ?? fillParams(pattern), {
    method,
    headers: {
      "X-Requested-With": "fetch",
      ...(write ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: write ? "{}" : undefined,
  });
}

/** Tên trường (ở mọi độ sâu) lộ giá vốn hoặc thứ suy ra từ giá vốn. */
const SENSITIVE_KEY = /cost|profit|margin|value/i;

function sensitiveKeys(value: unknown, at = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => sensitiveKeys(v, `${at}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(SENSITIVE_KEY.test(k) ? [`${at}.${k}`] : []),
      ...sensitiveKeys(v, `${at}.${k}`),
    ]);
  }
  return [];
}

describe("ma trận phân quyền mọi route", () => {
  it("mọi route đều có quyền khai báo trong bảng endpoint", () => {
    expect(routes.filter((r) => !access.has(r))).toEqual([]);
  });

  it("chưa đăng nhập: mọi route không public trả 401", async () => {
    const wrong: string[] = [];
    for (const route of routes) {
      if (access.get(route) === "public") continue;
      const res = await call(route);
      if (res.status !== 401) wrong.push(`${route} → ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });

  it("nhân viên: mọi route chỉ dành cho chủ trả 403", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const wrong: string[] = [];
    for (const route of routes) {
      if (access.get(route) !== "owner") continue;
      const res = await call(route, staff.cookie);
      if (res.status !== 403) wrong.push(`${route} → ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });

  it("nhân viên: không route GET nào trả giá vốn, lợi nhuận, giá trị chênh lệch", async () => {
    const store = await createStore();
    const staff = await addStaff(store);
    const owner = store.owner.api;
    const product = await createProduct(store.owner, {
      barcode: "8930000000017",
      openingStock: 20_000,
      units: [{ name: "Thùng", factor: 24, salePrice: 900_000, barcode: null }],
    });
    const customer = await createContact(store.owner);
    const sale = await sell(
      staff,
      saleInput([{ productId: product.id, unitName: "Chai", qty: 2_000, unitPrice: 38_000 }], {
        contactId: customer.id,
        paid: 10_000,
      }),
    );
    const receipt = await (
      await staff.api.payments.$post({
        json: {
          idempotencyKey: crypto.randomUUID(),
          type: "receipt",
          contactId: customer.id,
          amount: 5_000,
          method: "cash",
          note: null,
        },
      })
    ).json();
    // Nhập hàng còn nợ NCC: sổ kho có dòng nhập (giá vốn), sổ nợ NCC có bút toán phiếu nhập.
    const supplier = await createContact(store.owner, {
      type: "supplier",
      name: "Đại lý Hưng Thịnh",
      phone: null,
    });
    await purchase(
      store.owner,
      purchaseInput(
        [{ productId: product.id, unitName: "Thùng", qty: 1_000, unitPrice: 700_000 }],
        {
          contactId: supplier.id,
          paid: 200_000,
        },
      ),
    );
    const count = await (await owner["stock-counts"].$post({ json: {} })).json();
    await owner["stock-counts"][":id"].lines.$patch({
      param: { id: count.id },
      json: { lines: [{ lineId: count.lines[0]!.id, actualQty: 17_000, reason: "Vỡ" }] },
    });

    const paths: Record<string, string[]> = {
      "GET /api/auth/me": ["/api/auth/me"],
      "GET /api/categories": ["/api/categories"],
      "GET /api/products": ["/api/products", "/api/products?status=low"],
      "GET /api/products/lookup": ["/api/products/lookup?barcode=8930000000017"],
      "GET /api/products/pos": ["/api/products/pos"],
      "GET /api/products/:id": [`/api/products/${product.id}`],
      "GET /api/products/:id/movements": [`/api/products/${product.id}/movements`],
      "GET /api/contacts": ["/api/contacts?type=customer", "/api/contacts?type=supplier"],
      "GET /api/contacts/:id": [`/api/contacts/${customer.id}`, `/api/contacts/${supplier.id}`],
      "GET /api/contacts/:id/debt-entries": [
        `/api/contacts/${customer.id}/debt-entries`,
        `/api/contacts/${supplier.id}/debt-entries`,
      ],
      "GET /api/debts/summary": ["/api/debts/summary"],
      "GET /api/documents": ["/api/documents", "/api/documents?type=sale"],
      "GET /api/documents/:id": [`/api/documents/${sale.id}`],
      "GET /api/payments/:id": [`/api/payments/${receipt.id}`],
      "GET /api/stock-counts/:id": [`/api/stock-counts/${count.id}`],
    };
    // Ảnh trả về nhị phân, không có JSON để rà.
    const skipped = new Set(["GET /api/images/:key{.+}", "GET /api/health"]);
    const staffGets = routes.filter(
      (r) => r.startsWith("GET ") && access.get(r) !== "owner" && !skipped.has(r),
    );
    // Route GET mới cho nhân viên mà chưa có dữ liệu mẫu ở đây thì test báo để bổ sung.
    expect(staffGets.filter((r) => !paths[r])).toEqual([]);

    // Dữ liệu mẫu thật sự có dòng nhập hàng trong phản hồi của staff (tránh rà trên mảng rỗng).
    const movements = await call(
      "GET /api/products/:id/movements",
      staff.cookie,
      `/api/products/${product.id}/movements`,
    );
    expect(JSON.stringify(await movements.json())).toContain('"purchase"');

    const leaks: string[] = [];
    for (const route of staffGets) {
      for (const path of paths[route]!) {
        const res = await call(route, staff.cookie, path);
        expect(res.status, `${path}: ${await res.clone().text()}`).toBe(200);
        leaks.push(...sensitiveKeys(await res.json()).map((k) => `${path} ${k}`));
      }
    }
    expect(leaks).toEqual([]);

    // Đối chứng: chủ cửa hàng thấy giá vốn ở cùng các route (bộ lọc tên trường không bắt hụt).
    const ownerView = await rawFetch(`/api/products/${product.id}`, {
      headers: { Cookie: store.owner.cookie },
    });
    expect(sensitiveKeys(await ownerView.json())).not.toEqual([]);
  });
});
