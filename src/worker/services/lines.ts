// Phần dùng chung khi lập chứng từ có dòng hàng (bán, nhập): tra hàng/đơn vị, tính tiền,
// phân bổ chiết khấu, idempotency, báo hàng thiếu tồn.
import { formatQty } from "../../shared/qty";
import { MAX_AMOUNT } from "../../shared/schemas/common";
import { toSearch } from "../../shared/text";
import type { StoreDb } from "../db/client";
import type { DocumentType, UserRole } from "../db/schema";
import { AppError } from "../lib/errors";
import { type DocumentDetail, getDocument } from "./documents";

export type ProductForDocument =
  Awaited<ReturnType<StoreDb["products"]["forDocument"]>> extends Map<string, infer P> ? P : never;

export function productOrThrow(
  map: Map<string, ProductForDocument>,
  productId: string,
): ProductForDocument {
  const p = map.get(productId);
  if (!p) {
    throw new AppError("NOT_FOUND", "Không tìm thấy hàng hóa", undefined, { productId });
  }
  return p;
}

/** Hệ số quy đổi theo tên đơn vị (không phân biệt dấu/hoa thường); sai tên → INVALID_UNIT. */
export function resolveUnit(
  p: ProductForDocument,
  unitName: string,
): { name: string; factor: number } {
  const key = toSearch(unitName);
  if (toSearch(p.baseUnit) === key) return { name: p.baseUnit, factor: 1 };
  const unit = p.units.find((u) => toSearch(u.name) === key);
  if (!unit) {
    throw new AppError("INVALID_UNIT", `${p.name} không có đơn vị "${unitName}"`, undefined, {
      productId: p.id,
    });
  }
  return { name: unit.name, factor: unit.factor };
}

/** Tổng tiền chứng từ: subtotal ≤ MAX_AMOUNT, discount ≤ subtotal, paid lưu tối đa bằng total. */
export function documentTotals(lineTotals: number[], discount: number, paidInput: number) {
  const subtotal = lineTotals.reduce((s, t) => s + t, 0);
  if (subtotal > MAX_AMOUNT) {
    throw new AppError("AMOUNT_TOO_LARGE", "Tổng tiền chứng từ quá lớn");
  }
  if (discount > subtotal) {
    throw new AppError("INVALID_DISCOUNT", "Chiết khấu lớn hơn tổng tiền hàng");
  }
  const total = subtotal - discount;
  const paid = Math.min(paidInput, total);
  return { subtotal, total, paid, debtAmount: total - paid };
}

/**
 * Chia chiết khấu cả phiếu cho từng dòng theo tỷ lệ thành tiền. Làm tròn trên tổng LŨY KẾ nên
 * tổng các phần luôn đúng bằng discount (không lệch 1 đồng do làm tròn từng dòng).
 */
export function allocateDiscount(lineTotals: number[], discount: number): number[] {
  const subtotal = lineTotals.reduce((s, t) => s + t, 0);
  if (discount === 0 || subtotal === 0) return lineTotals.map(() => 0);
  let cumulative = 0;
  let allocated = 0;
  return lineTotals.map((t) => {
    cumulative += t;
    const upTo = Math.round((discount * cumulative) / subtotal);
    const share = upTo - allocated;
    allocated = upTo;
    return share;
  });
}

/** Chứng từ đã tạo với cùng idempotencyKey (nếu có). Key thuộc chứng từ loại khác → lỗi. */
export async function replayDocument(
  db: StoreDb,
  role: UserRole,
  key: string,
  type: DocumentType,
): Promise<DocumentDetail | null> {
  const existing = await db.documents.findByIdempotencyKey(key);
  if (!existing) return null;
  if (existing.type !== type) {
    throw new AppError("IDEMPOTENCY_CONFLICT", "Mã chống gửi trùng đã dùng cho chứng từ khác");
  }
  return getDocument(db, role, existing.id);
}

export interface ShortageItem {
  productId: string;
  name: string;
  unit: string;
  stock: number;
  requested: number;
}

/**
 * Sau khi batch vấp CHECK tồn kho: đọc tồn hiện tại, so với số cần trừ (gộp theo hàng)
 * để chỉ ra những mặt hàng thiếu (bỏ qua hàng cho phép bán âm).
 */
export async function shortages(
  db: StoreDb,
  required: Map<string, number>,
): Promise<ShortageItem[]> {
  const current = await db.products.forDocument([...required.keys()]);
  return [...required.entries()].flatMap(([productId, requested]) => {
    const p = current.get(productId);
    if (!p || p.allowNegative || p.stock >= requested) return [];
    return [{ productId, name: p.name, unit: p.baseUnit, stock: p.stock, requested }];
  });
}

export function describeShortage(item: ShortageItem): string {
  return `${item.name} chỉ còn ${formatQty(Math.max(item.stock, 0), item.unit)}`;
}

/** Cộng dồn số lượng cơ bản theo mặt hàng. */
export function sumByProduct(lines: { productId: string; baseQty: number }[]) {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.productId, (m.get(l.productId) ?? 0) + l.baseQty);
  return m;
}
