import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { contactSearchText, productSearchText } from "../../src/shared/text";
import { createDatabase } from "../../src/worker/db/client";
import { contactSearchValue, productSearchValue } from "../../src/worker/lib/search";

const db = createDatabase(env.DB);

/** Chạy biểu thức name_search (mã là SQL) trong SQLite để so với bản tính bằng JS. */
async function evalSql(value: unknown) {
  const row = await db.get<{ v: string }>(sql`SELECT ${value} AS v`);
  return row.v;
}

describe("name_search khi mã là subquery", () => {
  const cases = [
    { name: "Nước mắm Nam Ngư 500ml", code: "SP000052", barcode: "8934567890123" },
    { name: "  Đường   cát  ", code: "SP-01.A", barcode: null },
  ];

  it.each(cases)("hàng hóa: $name", async (p) => {
    const code = sql<string>`${p.code}`;
    const value = productSearchValue({ name: p.name.trim(), code, barcode: p.barcode });
    expect(await evalSql(value)).toBe(productSearchText({ ...p, name: p.name.trim() }));
  });

  it("danh bạ: tên + mã + SĐT", async () => {
    const value = contactSearchValue({
      name: "Chị Lan",
      code: sql<string>`${"KH000001"}`,
      phone: "0912345678",
    });
    expect(await evalSql(value)).toBe(
      contactSearchText({ name: "Chị Lan", code: "KH000001", phone: "0912345678" }),
    );
  });

  it("mã là chuỗi thì dùng thẳng productSearchText", () => {
    const p = { name: "Mì", code: "SP1", barcode: null };
    expect(productSearchValue(p)).toBe(productSearchText(p));
  });
});
