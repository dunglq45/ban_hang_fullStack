import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/worker/db/client";
import { documents, payments, productUnits, products, stores } from "../../src/worker/db/schema";
import { isConstraintError } from "../../src/worker/lib/db-errors";
import { uuidv7 } from "../../src/worker/lib/uuid";

const db = createDatabase(env.DB);

async function createStore() {
  const id = uuidv7();
  await db.insert(stores).values({ id, name: "Cửa hàng", createdAt: 0 });
  return id;
}

function productRow(storeId: string, code: string) {
  return {
    id: uuidv7(),
    storeId,
    code,
    name: "Mì gói",
    nameSearch: "mi goi",
    baseUnit: "Gói",
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("schema", () => {
  it("migration tạo đủ 14 bảng", async () => {
    const rows = await db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' AND name <> 'd1_migrations' ORDER BY name`,
    );
    expect(rows.map((r) => r.name)).toEqual([
      "categories",
      "contacts",
      "counters",
      "debt_entries",
      "document_lines",
      "documents",
      "login_attempts",
      "payments",
      "product_units",
      "products",
      "sessions",
      "stock_movements",
      "stores",
      "users",
    ]);
  });

  it("CHECK tồn kho: không cho âm trừ khi allow_negative = 1", async () => {
    const storeId = await createStore();
    const strict = productRow(storeId, "SP000001");
    await db.insert(products).values({ ...strict, stock: 1000 });
    const err = await db
      .run(sql`UPDATE products SET stock = stock - 2000 WHERE id = ${strict.id}`)
      .catch((e: unknown) => e);
    expect(isConstraintError(err, "CHECK", "products_stock_check")).toBe(true);
    expect(isConstraintError(err, "UNIQUE")).toBe(false);

    const loose = productRow(storeId, "SP000002");
    await db.insert(products).values({ ...loose, allowNegative: true });
    await db.run(sql`UPDATE products SET stock = stock - 2000 WHERE id = ${loose.id}`);
  });

  it("UNIQUE (store_id, code): trùng mã trong một cửa hàng bị chặn, khác cửa hàng thì được", async () => {
    const a = await createStore();
    const b = await createStore();
    await db.insert(products).values(productRow(a, "SP000001"));
    await db.insert(products).values(productRow(b, "SP000001"));
    const err = await db
      .insert(products)
      .values(productRow(a, "SP000001"))
      .catch((e: unknown) => e);
    expect(isConstraintError(err, "UNIQUE", "products.store_id")).toBe(true);
  });

  describe("UNIQUE (store_id, idempotency_key)", () => {
    let seq = 0;
    function doc(storeId: string, idempotencyKey: string | null) {
      seq++;
      return {
        id: uuidv7(),
        storeId,
        type: "sale" as const,
        code: `HD9${String(seq).padStart(5, "0")}`,
        status: "completed" as const,
        idempotencyKey,
        createdBy: "test",
        createdAt: 0,
      };
    }
    function payment(storeId: string, idempotencyKey: string | null) {
      seq++;
      return {
        id: uuidv7(),
        storeId,
        type: "receipt" as const,
        code: `PT9${String(seq).padStart(5, "0")}`,
        contactId: "c",
        amount: 1000,
        method: "cash" as const,
        status: "completed" as const,
        idempotencyKey,
        createdBy: "test",
        createdAt: 0,
      };
    }

    it("documents: trùng key cùng cửa hàng bị chặn, khác cửa hàng thì được", async () => {
      const a = await createStore();
      const b = await createStore();
      const key = uuidv7();
      await db.insert(documents).values(doc(a, key));
      await db.insert(documents).values(doc(b, key));
      const err = await db
        .insert(documents)
        .values(doc(a, key))
        .catch((e: unknown) => e);
      expect(isConstraintError(err, "UNIQUE", "documents.idempotency_key")).toBe(true);
    });

    it("documents: nhiều dòng idempotency_key = NULL không xung đột", async () => {
      const a = await createStore();
      await db.insert(documents).values([doc(a, null), doc(a, null)]);
    });

    it("payments: trùng key cùng cửa hàng bị chặn, NULL không xung đột", async () => {
      const a = await createStore();
      const key = uuidv7();
      await db.insert(payments).values([payment(a, key), payment(a, null), payment(a, null)]);
      const err = await db
        .insert(payments)
        .values(payment(a, key))
        .catch((e: unknown) => e);
      expect(isConstraintError(err, "UNIQUE", "payments.idempotency_key")).toBe(true);
    });
  });

  it("CHECK amount > 0 (payments) và factor > 1 (product_units)", async () => {
    const a = await createStore();
    const payErr = await db
      .insert(payments)
      .values({
        id: uuidv7(),
        storeId: a,
        type: "receipt",
        code: "PT000001",
        contactId: "c",
        amount: 0,
        method: "cash",
        status: "completed",
        createdBy: "test",
        createdAt: 0,
      })
      .catch((e: unknown) => e);
    expect(isConstraintError(payErr, "CHECK", "payments_amount_check")).toBe(true);

    const p = productRow(a, "SP000001");
    await db.insert(products).values(p);
    const unitErr = await db
      .insert(productUnits)
      .values({ id: uuidv7(), storeId: a, productId: p.id, name: "Lẻ", factor: 1 })
      .catch((e: unknown) => e);
    expect(isConstraintError(unitErr, "CHECK", "product_units_factor_check")).toBe(true);
  });
});
