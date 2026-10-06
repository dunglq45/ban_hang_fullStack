// Logic phiếu nhập hàng: hàm thuần, không phụ thuộc React, để test riêng.
// Tiền là số nguyên VND; số lượng là milli của đơn vị đã chọn (xem src/shared/qty.ts).
import type { z } from "zod";
import { formatQty, lineAmount, MILLI } from "../../../shared/qty";
import { MAX_DOCUMENT_LINES, type updatePurchaseSchema } from "../../../shared/schemas/document";
import type { PickedContact } from "../contacts/ContactPicker";

export type PurchaseBody = z.input<typeof updatePurchaseSchema>;
export type PaymentMethod = "cash" | "transfer";

/** Thông tin hàng cần để nhập (chi tiết hàng hóa hoặc kết quả tra mã vạch, quyền chủ). */
export interface PurchaseProduct {
  id: string;
  code: string;
  name: string;
  baseUnit: string;
  /** Giá vốn bình quân theo đơn vị cơ bản; staff không có (phiếu nhập chỉ chủ dùng). */
  costPrice?: number;
  /** milli đơn vị cơ bản */
  stock: number;
  units: Array<{ name: string; factor: number }>;
}

export interface PurchaseUnit {
  name: string;
  factor: number;
}

export interface PurchaseLine {
  /** Khóa dòng: hàng + đơn vị. */
  key: string;
  productId: string;
  code: string;
  name: string;
  baseUnit: string;
  /** Tồn hiện tại (milli đơn vị cơ bản), chụp lúc thêm. */
  stock: number;
  /** Giá vốn hiện tại theo đơn vị cơ bản, để gợi ý giá nhập khi đổi đơn vị. */
  costPrice: number;
  units: PurchaseUnit[];
  unitName: string;
  factor: number;
  /** milli theo đơn vị đã chọn; null khi ô số lượng đang gõ dở/không hợp lệ. */
  qty: number | null;
  /** Giá nhập theo đơn vị đã chọn (trước chiết khấu phiếu). */
  unitPrice: number;
}

export interface PurchaseDraft {
  supplier: PickedContact | null;
  lines: PurchaseLine[];
  discount: number;
  /** Đã trả NCC; null = trả đủ. */
  paid: number | null;
  paymentMethod: PaymentMethod;
  note: string;
}

export const emptyDraft = (): PurchaseDraft => ({
  supplier: null,
  lines: [],
  discount: 0,
  paid: null,
  paymentMethod: "cash",
  note: "",
});

export class PurchaseLimitError extends Error {}

export function lineKey(productId: string, unitName: string) {
  return `${productId}|${unitName}`;
}

function unitsOf(p: PurchaseProduct): PurchaseUnit[] {
  return [
    { name: p.baseUnit, factor: 1 },
    ...[...p.units]
      .sort((a, b) => a.factor - b.factor)
      .map((u) => ({ name: u.name, factor: u.factor })),
  ];
}

/** Giá nhập gợi ý = giá vốn hiện tại × hệ số quy đổi. */
export function suggestedPrice(costPrice: number, factor: number) {
  return costPrice * factor;
}

/**
 * Thêm hàng; cùng hàng + đơn vị thì cộng số lượng (quét trùng). Trả kèm khóa dòng vừa thêm/cộng
 * để màn hình cuộn tới.
 */
export function addProduct(
  lines: PurchaseLine[],
  product: PurchaseProduct,
  unitName?: string,
  qty = MILLI,
): { lines: PurchaseLine[]; key: string } {
  const units = unitsOf(product);
  const unit = units.find((u) => u.name === unitName) ?? units[0]!;
  const key = lineKey(product.id, unit.name);
  if (lines.some((l) => l.key === key)) {
    return {
      key,
      lines: lines.map((l) => (l.key === key ? { ...l, qty: (l.qty ?? 0) + qty } : l)),
    };
  }
  if (lines.length >= MAX_DOCUMENT_LINES) {
    throw new PurchaseLimitError(`Mỗi phiếu nhập tối đa ${MAX_DOCUMENT_LINES} dòng`);
  }
  const costPrice = product.costPrice ?? 0;
  const line: PurchaseLine = {
    key,
    productId: product.id,
    code: product.code,
    name: product.name,
    baseUnit: product.baseUnit,
    stock: product.stock,
    costPrice,
    units,
    unitName: unit.name,
    factor: unit.factor,
    qty,
    unitPrice: suggestedPrice(costPrice, unit.factor),
  };
  return { key, lines: [...lines, line] };
}

/** Đổi đơn vị: giá nhập về giá vốn × hệ số mới; trùng dòng sẵn có thì gộp số lượng. */
export function setLineUnit(lines: PurchaseLine[], key: string, unitName: string): PurchaseLine[] {
  const line = lines.find((l) => l.key === key);
  const unit = line?.units.find((u) => u.name === unitName);
  if (!line || !unit || unit.name === line.unitName) return lines;
  const newKey = lineKey(line.productId, unit.name);
  if (lines.some((l) => l.key === newKey)) {
    return lines
      .filter((l) => l.key !== key)
      .map((l) => (l.key === newKey ? { ...l, qty: (l.qty ?? 0) + (line.qty ?? 0) } : l));
  }
  return lines.map((l) =>
    l.key === key
      ? {
          ...l,
          key: newKey,
          unitName: unit.name,
          factor: unit.factor,
          unitPrice: suggestedPrice(l.costPrice, unit.factor),
        }
      : l,
  );
}

export function updateLine(
  lines: PurchaseLine[],
  key: string,
  patch: Partial<Pick<PurchaseLine, "qty" | "unitPrice">>,
): PurchaseLine[] {
  return lines.map((l) => (l.key === key ? { ...l, ...patch } : l));
}

export function removeLine(lines: PurchaseLine[], key: string): PurchaseLine[] {
  return lines.filter((l) => l.key !== key);
}

export function lineTotal(line: PurchaseLine) {
  return line.qty === null ? 0 : lineAmount(line.qty, line.unitPrice);
}

/** Ghi chú dưới tên hàng: tồn hiện tại và quy đổi của đơn vị đang chọn. */
export function lineNote(line: PurchaseLine) {
  const stock = formatQty(line.stock, line.baseUnit.toLowerCase());
  if (line.factor === 1) return `Tồn hiện tại: ${stock}`;
  const base = line.qty ?? MILLI;
  return `${formatQty(base, line.unitName.toLowerCase())} = ${formatQty(
    base * line.factor,
    line.baseUnit.toLowerCase(),
  )} · tồn ${stock}`;
}

export interface PurchaseSummary {
  /** Số mặt hàng (khác nhau) trong phiếu. */
  productCount: number;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  /** Còn nợ NCC sau phiếu này. */
  debt: number;
  /** Tổng nợ NCC sau phiếu = nợ hiện tại + còn nợ của phiếu. */
  supplierDebtAfter: number | null;
}

export function summarize(draft: PurchaseDraft): PurchaseSummary {
  const subtotal = draft.lines.reduce((s, l) => s + lineTotal(l), 0);
  const total = Math.max(0, subtotal - draft.discount);
  const paid = Math.min(draft.paid ?? total, total);
  const debt = total - paid;
  return {
    productCount: new Set(draft.lines.map((l) => l.productId)).size,
    subtotal,
    discount: draft.discount,
    total,
    paid,
    debt,
    supplierDebtAfter: draft.supplier ? draft.supplier.debt + debt : null,
  };
}

/** Lỗi chặn lưu/hoàn thành (câu hiển thị cho người dùng), null nếu hợp lệ. */
export function draftError(draft: PurchaseDraft): string | null {
  if (draft.lines.length === 0) return "Phiếu nhập chưa có mặt hàng nào";
  const bad = draft.lines.find((l) => l.qty === null || l.qty <= 0);
  if (bad) return `Số lượng của ${bad.name} chưa hợp lệ`;
  const s = summarize(draft);
  if (draft.discount > s.subtotal) return "Chiết khấu lớn hơn tổng tiền hàng";
  if (s.debt > 0 && !draft.supplier) {
    return "Còn nợ thì cần chọn nhà cung cấp để ghi sổ nợ";
  }
  return null;
}

export function toPurchaseBody(draft: PurchaseDraft): PurchaseBody {
  const s = summarize(draft);
  const note = draft.note.trim();
  return {
    contactId: draft.supplier?.id ?? null,
    lines: draft.lines.map((l) => ({
      productId: l.productId,
      unitName: l.unitName,
      qty: l.qty ?? 0,
      unitPrice: l.unitPrice,
    })),
    discount: draft.discount,
    paid: s.paid,
    paymentMethod: draft.paymentMethod,
    note: note || null,
  };
}

/** Dòng đã lưu của phiếu nháp (đơn vị, số lượng, giá) + thông tin hàng hiện tại → dòng sửa được. */
export function linesFromDocument(
  saved: Array<{
    productId: string;
    unitName: string;
    factor: number;
    qty: number;
    unitPrice: number;
  }>,
  products: Map<string, PurchaseProduct>,
): PurchaseLine[] {
  let lines: PurchaseLine[] = [];
  for (const s of saved) {
    const p = products.get(s.productId);
    if (!p) continue;
    // Đơn vị đã bị xóa khỏi hàng hóa sau khi lưu nháp: vẫn giữ đơn vị đã lưu (không tự đổi sang
    // đơn vị khác với cùng con số), server sẽ báo lỗi khi lưu nếu người dùng không đổi.
    const product = unitsOf(p).some((u) => u.name === s.unitName)
      ? p
      : { ...p, units: [...p.units, { name: s.unitName, factor: s.factor }] };
    const added = addProduct(lines, product, s.unitName, s.qty);
    lines = added.lines.map((l) => (l.key === added.key ? { ...l, unitPrice: s.unitPrice } : l));
  }
  return lines;
}
