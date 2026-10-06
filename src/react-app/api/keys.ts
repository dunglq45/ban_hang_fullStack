// Khóa cache TanStack Query dùng ở nhiều nơi.

export const meQueryKey = ["auth", "me"] as const;
export const debtSummaryQueryKey = ["debts", "summary"] as const;
export const posProductsQueryKey = ["products", "pos"] as const;
export const categoriesQueryKey = ["categories"] as const;
export const customerSearchQueryKey = (q: string) => ["contacts", "customer", "search", q] as const;
export const contactQueryKey = (id: string) => ["contacts", "detail", id] as const;

/** Dữ liệu đổi sau khi bán: tồn kho, công nợ, chứng từ, báo cáo. */
export const AFTER_SALE_INVALIDATE = [
  ["products"],
  ["contacts"],
  ["debts"],
  ["documents"],
  ["reports"],
] as const;
