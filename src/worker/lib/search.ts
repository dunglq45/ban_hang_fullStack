// Giá trị cột name_search khi mã có thể là subquery bộ đếm (mã tự sinh trong batch, chưa biết trước).
// Kết quả phải giống hệt productSearchText / contactSearchText (src/shared/text.ts); có test đối chiếu.
import { type SQL, sql } from "drizzle-orm";
import { contactSearchText, productSearchText, toSearch } from "../../shared/text";

/**
 * toSearch(`${name} ${code} ${extra}`) với code là SQL: tách ra thành
 * toSearch(name) || ' ' || lower(code) || ' ' || toSearch(extra). Tương đương vì mã chỉ gồm
 * [A-Za-z0-9._-] (không dấu, không khoảng trắng) nên toSearch(code) = lower(code).
 */
function withSqlCode(
  name: string,
  code: SQL<string>,
  extra: string | null | undefined,
): SQL<string> {
  const tail = extra ? toSearch(extra) : "";
  return tail
    ? sql<string>`${toSearch(name)} || ' ' || lower(${code}) || ' ' || ${tail}`
    : sql<string>`${toSearch(name)} || ' ' || lower(${code})`;
}

export function productSearchValue(p: {
  name: string;
  code: string | SQL<string>;
  barcode: string | null;
}): string | SQL<string> {
  return typeof p.code === "string"
    ? productSearchText({ name: p.name, code: p.code, barcode: p.barcode })
    : withSqlCode(p.name, p.code, p.barcode);
}

export function contactSearchValue(c: {
  name: string;
  code: string | SQL<string>;
  phone: string | null;
}): string | SQL<string> {
  return typeof c.code === "string"
    ? contactSearchText({ name: c.name, code: c.code, phone: c.phone })
    : withSqlCode(c.name, c.code, c.phone);
}
