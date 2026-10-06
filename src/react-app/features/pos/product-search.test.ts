import { describe, expect, it } from "vitest";
import { filterProducts, findExact, type SearchableProduct, stockLevel } from "./product-search";

function product(over: Partial<SearchableProduct>): SearchableProduct {
  return {
    id: "p",
    code: "SP000001",
    name: "Hàng",
    nameSearch: "hang sp000001",
    categoryId: null,
    barcode: null,
    baseUnit: "Cái",
    salePrice: 1_000,
    stock: 10_000,
    minStock: 0,
    allowNegative: false,
    units: [],
    ...over,
  };
}

const nuocMam = product({
  id: "nm",
  code: "SP000052",
  name: "Nước mắm 500ml",
  nameSearch: "nuoc mam 500ml sp000052 8934567000052",
  barcode: "8934567000052",
  categoryId: "gia-vi",
});
const mi = product({
  id: "mi",
  code: "SP000012",
  name: "Mì gói tôm chua cay",
  nameSearch: "mi goi tom chua cay sp000012",
  categoryId: "mi-gao",
  units: [{ name: "Thùng", factor: 30, salePrice: 125_000, barcode: "8930000000301" }],
});
const all = [nuocMam, mi];

describe("tìm hàng ở POS", () => {
  it("gõ không dấu, nhiều từ, mã hàng hoặc mã vạch đều ra", () => {
    expect(filterProducts(all, "nuoc mam", null)).toEqual([nuocMam]);
    expect(filterProducts(all, "Mì  CHUA", null)).toEqual([mi]);
    expect(filterProducts(all, "sp0000", null)).toEqual(all);
    expect(filterProducts(all, "8930000000301", null)).toEqual([mi]);
    expect(filterProducts(all, "bia", null)).toEqual([]);
  });

  it("không gõ thì lọc theo nhóm; đang gõ thì tìm mọi nhóm", () => {
    expect(filterProducts(all, "", "gia-vi")).toEqual([nuocMam]);
    expect(filterProducts(all, "", null)).toEqual(all);
    expect(filterProducts(all, "mi goi", "gia-vi")).toEqual([mi]);
  });

  it("khớp chính xác mã vạch hàng, mã vạch đơn vị, rồi mã hàng", () => {
    expect(findExact(all, "8934567000052")).toEqual({ product: nuocMam, unitName: null });
    expect(findExact(all, " 8930000000301 ")).toEqual({ product: mi, unitName: "Thùng" });
    expect(findExact(all, "sp000012")).toEqual({ product: mi, unitName: null });
    expect(findExact(all, "893456")).toBeNull();
    expect(findExact(all, "")).toBeNull();
  });

  it("mức tồn", () => {
    expect(stockLevel({ stock: 0, minStock: 5_000 })).toBe("out");
    expect(stockLevel({ stock: -1_000, minStock: 0 })).toBe("out");
    expect(stockLevel({ stock: 4_000, minStock: 5_000 })).toBe("low");
    expect(stockLevel({ stock: 4_000, minStock: 0 })).toBe("ok");
  });
});
