// Tìm hàng phía client trên danh sách POS (đã tải sẵn) để gõ là ra ngay.
import { toSearch } from "../../../shared/text";
import type { SellableProduct } from "./cart";

export interface SearchableProduct extends SellableProduct {
  /** toSearch(tên + mã + mã vạch), server tính sẵn. */
  nameSearch: string;
  categoryId: string | null;
  barcode: string | null;
}

/**
 * Lọc theo từ khóa (mọi từ đều phải có, không dấu; khớp cả mã vạch đơn vị quy đổi) hoặc theo nhóm.
 * Đang gõ tìm thì tìm trên mọi nhóm.
 */
export function filterProducts<P extends SearchableProduct>(
  products: P[],
  query: string,
  categoryId: string | null,
): P[] {
  const words = toSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) {
    return categoryId ? products.filter((p) => p.categoryId === categoryId) : products;
  }
  return products.filter((p) => {
    const haystack =
      `${p.nameSearch} ${p.units.map((u) => u.barcode ?? "").join(" ")}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export interface ExactMatch<P> {
  product: P;
  /** Đơn vị khớp mã vạch (null = đơn vị cơ bản). */
  unitName: string | null;
}

/** Khớp chính xác mã vạch (hàng hoặc đơn vị quy đổi), rồi đến mã hàng (không phân biệt hoa thường). */
export function findExact<P extends SearchableProduct>(
  products: P[],
  code: string,
): ExactMatch<P> | null {
  const c = code.trim();
  if (!c) return null;
  for (const p of products) {
    if (p.barcode === c) return { product: p, unitName: null };
    const unit = p.units.find((u) => u.barcode === c);
    if (unit) return { product: p, unitName: unit.name };
  }
  const lower = c.toLowerCase();
  const byCode = products.find((p) => p.code.toLowerCase() === lower);
  return byCode ? { product: byCode, unitName: null } : null;
}

export type StockLevel = "ok" | "low" | "out";

/** Mức tồn để tô màu ô hàng: hết (≤ 0), sắp hết (≤ mức tối thiểu), bình thường. */
export function stockLevel(p: Pick<SellableProduct, "stock" | "minStock">): StockLevel {
  if (p.stock <= 0) return "out";
  if (p.minStock > 0 && p.stock <= p.minStock) return "low";
  return "ok";
}
