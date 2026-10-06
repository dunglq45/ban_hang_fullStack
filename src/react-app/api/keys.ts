// Khóa cache TanStack Query dùng ở nhiều nơi.

export const meQueryKey = ["auth", "me"] as const;
export const debtSummaryQueryKey = ["debts", "summary"] as const;
export const posProductsQueryKey = ["products", "pos"] as const;
export const categoriesQueryKey = ["categories"] as const;
export const contactQueryKey = (id: string) => ["contacts", "detail", id] as const;
export const contactSearchQueryKey = (type: string, q: string) =>
  ["contacts", type, "search", q] as const;
export const documentListQueryKey = (params: object) => ["documents", "list", params] as const;
export const documentQueryKey = (id: string) => ["documents", "detail", id] as const;
/** Phiếu kiểm nằm dưới "documents" để invalidate chung với chứng từ. */
export const stockCountQueryKey = (id: string) => ["documents", "stock-count", id] as const;

/** Dữ liệu đổi sau khi bán: tồn kho, công nợ, chứng từ, báo cáo. */
export const AFTER_SALE_INVALIDATE = [
  ["products"],
  ["contacts"],
  ["debts"],
  ["documents"],
  ["reports"],
] as const;
export const productListQueryKey = (params: object) => ["products", "list", params] as const;
export const productQueryKey = (id: string) => ["products", "detail", id] as const;
export const movementsQueryKey = (id: string, params: object) =>
  ["products", "movements", id, params] as const;
