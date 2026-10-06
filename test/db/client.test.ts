import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createDatabase, getDb } from "../../src/worker/db/client";
import { stores } from "../../src/worker/db/schema";
import { uuidv7 } from "../../src/worker/lib/uuid";

const db = createDatabase(env.DB);

async function createStore() {
  const id = uuidv7();
  await db.insert(stores).values({ id, name: "Cửa hàng", createdAt: 0 });
  return id;
}

describe("getDb", () => {
  it("repository gắn storeId: ghi và đọc chỉ trong cửa hàng của mình", async () => {
    const a = getDb(env, await createStore());
    const b = getDb(env, await createStore());

    const drinkId = uuidv7();
    await a.batch([
      a.categories.insert({ id: drinkId, name: "Đồ uống", sortOrder: 2 }),
      a.categories.insert({ id: uuidv7(), name: "Gia vị", sortOrder: 1 }),
    ]);
    await b.categories.insert({ id: uuidv7(), name: "Vật liệu", sortOrder: 1 });

    expect((await a.categories.list()).map((c) => c.name)).toEqual(["Gia vị", "Đồ uống"]);
    expect((await b.categories.list()).map((c) => c.name)).toEqual(["Vật liệu"]);
    expect((await a.categories.findById(drinkId))?.storeId).toBe(a.storeId);
    expect(await b.categories.findById(drinkId)).toBeUndefined();
  });

  it("từ chối storeId rỗng", () => {
    expect(() => getDb(env, "")).toThrow();
  });
});
