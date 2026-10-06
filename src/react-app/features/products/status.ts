import type { StockStatus } from "../../components/ui/StatusDot";

/** Trạng thái hiển thị, cùng quy tắc với bộ lọc của server (repositories/products.ts). */
export function productStatus(p: { isActive: boolean; stock: number; minStock: number }): StockStatus {
  if (!p.isActive) return "inactive";
  if (p.stock <= 0) return "out";
  if (p.minStock > 0 && p.stock <= p.minStock) return "low";
  return "ok";
}
