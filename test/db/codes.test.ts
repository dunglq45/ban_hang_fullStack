import { env } from "cloudflare:test";
import { and, eq, type SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase, getDb } from "../../src/worker/db/client";
import { formatCode } from "../../src/shared/codes";
import { counters, documents, stores } from "../../src/worker/db/schema";
import { uuidv7 } from "../../src/worker/lib/uuid";

const db = createDatabase(env.DB);

async function createStore(name: string) {
  const id = uuidv7();
  await db.insert(stores).values({ id, name, createdAt: Date.now() });
  return id;
}

function saleInsert(storeId: string, id: string, code: SQL<string>) {
  return db.insert(documents).values({
    id,
    storeId,
    type: "sale",
    code,
    status: "completed",
    createdBy: "test",
    createdAt: Date.now(),
  });
}

/** Một batch: tăng bộ đếm HD rồi INSERT hóa đơn lấy mã qua subquery. Trả về mã đã ghi. */
async function createSale(storeId: string) {
  const repo = getDb(env, storeId);
  const { bump, code } = repo.codes.next("HD");
  const id = uuidv7();
  await repo.batch([bump, saleInsert(storeId, id, code)]);
  const row = await db
    .select({ code: documents.code })
    .from(documents)
    .where(and(eq(documents.storeId, storeId), eq(documents.id, id)))
    .get();
  return row?.code;
}

describe("codes", () => {
  it("formatCode đệm 6 chữ số", () => {
    expect(formatCode("SP", 12)).toBe("SP000012");
    expect(formatCode("NCC", 1)).toBe("NCC000001");
  });

  it("hai batch liên tiếp ra HD000001, HD000002", async () => {
    const storeId = await createStore("Tạp hóa A");
    expect(await createSale(storeId)).toBe("HD000001");
    expect(await createSale(storeId)).toBe("HD000002");
  });

  it("mỗi cửa hàng có bộ đếm riêng", async () => {
    const a = await createStore("Cửa hàng A");
    const b = await createStore("Cửa hàng B");
    expect(await createSale(a)).toBe("HD000001");
    expect(await createSale(a)).toBe("HD000002");
    expect(await createSale(b)).toBe("HD000001");
    expect(await createSale(a)).toBe("HD000003");

    const rows = await db.select().from(counters).where(eq(counters.kind, "HD"));
    const byStore = Object.fromEntries(rows.map((r) => [r.storeId, r.value]));
    expect(byStore[a]).toBe(3);
    expect(byStore[b]).toBe(1);
  });

  it("các loại mã khác nhau đếm độc lập", async () => {
    const storeId = await createStore("Cửa hàng C");
    expect(await createSale(storeId)).toBe("HD000001");
    const repo = getDb(env, storeId);
    const pn = repo.codes.next("PN");
    await repo.batch([pn.bump]);
    const row = await db
      .select({ value: counters.value })
      .from(counters)
      .where(and(eq(counters.storeId, storeId), eq(counters.kind, "PN")))
      .get();
    expect(row?.value).toBe(1);
  });

  it("batch lỗi thì bộ đếm không tăng (nguyên tử)", async () => {
    const storeId = await createStore("Cửa hàng D");
    expect(await createSale(storeId)).toBe("HD000001");
    const existing = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.storeId, storeId))
      .get();

    // Câu thứ hai trùng id hóa đơn đã có → cả batch hủy, kể cả câu tăng bộ đếm.
    const repo = getDb(env, storeId);
    const { bump, code } = repo.codes.next("HD");
    await expect(repo.batch([bump, saleInsert(storeId, existing!.id, code)])).rejects.toThrow();

    expect(await createSale(storeId)).toBe("HD000002");
  });
});
