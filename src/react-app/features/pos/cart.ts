// Logic giỏ hàng của màn Bán hàng: hàm thuần, không phụ thuộc React, để test riêng.
// Tiền là số nguyên VND, số lượng là milli của đơn vị đã chọn (xem src/shared/qty.ts).
import type { z } from "zod";
import { formatQty, lineAmount, MILLI, toBaseQty } from "../../../shared/qty";
import { MAX_DOCUMENT_LINES, type createSaleSchema } from "../../../shared/schemas/document";
import { uuidv7 } from "../../../shared/uuid";

export type SaleInput = z.input<typeof createSaleSchema>;
export type PaymentMethod = "cash" | "transfer";

/** Thông tin hàng cần để bán (danh sách POS hoặc kết quả tra mã vạch). */
export interface SellableProduct {
  id: string;
  code: string;
  name: string;
  baseUnit: string;
  salePrice: number;
  stock: number;
  minStock: number;
  allowNegative: boolean;
  units: Array<{ name: string; factor: number; salePrice: number | null; barcode: string | null }>;
}

/** Một đơn vị bán được của hàng: đơn vị cơ bản (factor 1) hoặc đơn vị quy đổi. */
export interface UnitOption {
  name: string;
  factor: number;
  /** Giá bán niêm yết theo đơn vị này. */
  price: number;
}

export interface CartLine {
  /** Khóa dòng trong giỏ (hàng + đơn vị). */
  key: string;
  productId: string;
  code: string;
  name: string;
  unitName: string;
  factor: number;
  /** milli theo đơn vị đã chọn */
  qty: number;
  unitPrice: number;
  /** Các đơn vị chọn được, chụp lúc thêm vào giỏ. */
  units: UnitOption[];
  baseUnit: string;
}

export interface CartCustomer {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  /** Nợ hiện tại (trước đơn này). */
  debt: number;
  debtLimit: number | null;
}

export interface Cart {
  /** id của tab hóa đơn */
  id: string;
  /** Số thứ tự hiển thị: "Hóa đơn 1" */
  number: number;
  /** Sinh khi mở đơn, giữ nguyên khi gửi lại; chỉ đổi khi bán xong (đơn mới). */
  idempotencyKey: string;
  lines: CartLine[];
  customer: CartCustomer | null;
  discount: number;
  /** Tiền khách đưa; null = trả vừa đủ. */
  paid: number | null;
  paymentMethod: PaymentMethod;
  /** Lỗi theo mặt hàng của lần gửi gần nhất (thiếu hàng, dưới giá vốn...), theo productId;
   * xóa khi giỏ thay đổi. */
  lineErrors: Record<string, string>;
}

export function emptyCart(number: number): Cart {
  return {
    id: uuidv7(),
    number,
    idempotencyKey: uuidv7(),
    lines: [],
    customer: null,
    discount: 0,
    paid: null,
    paymentMethod: "cash",
    lineErrors: {},
  };
}

/** Đơn vị bán được; đơn vị quy đổi không đặt giá riêng thì giá = giá cơ bản × hệ số. */
export function unitOptions(product: SellableProduct): UnitOption[] {
  return [
    { name: product.baseUnit, factor: 1, price: product.salePrice },
    ...product.units.map((u) => ({
      name: u.name,
      factor: u.factor,
      price: u.salePrice ?? product.salePrice * u.factor,
    })),
  ];
}

const lineKey = (productId: string, unitName: string) => `${productId}:${unitName}`;

/** Giỏ đổi nội dung → bỏ lỗi theo dòng cũ (số liệu không còn đúng). */
function changed(cart: Cart, patch: Partial<Cart>): Cart {
  return { ...cart, ...patch, lineErrors: {} };
}

export class CartLimitError extends Error {}

/**
 * Thêm hàng (mặc định 1 đơn vị). Cùng hàng, cùng đơn vị thì cộng dồn số lượng.
 * `unitName` bỏ trống = đơn vị cơ bản.
 */
export function addProduct(
  cart: Cart,
  product: SellableProduct,
  unitName?: string,
  qty = MILLI,
): Cart {
  const units = unitOptions(product);
  const unit = units.find((u) => u.name === unitName) ?? units[0]!;
  const key = lineKey(product.id, unit.name);
  const existing = cart.lines.find((l) => l.key === key);
  if (existing) {
    return changed(cart, {
      lines: cart.lines.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l)),
    });
  }
  if (cart.lines.length >= MAX_DOCUMENT_LINES) {
    throw new CartLimitError(`Mỗi hóa đơn tối đa ${MAX_DOCUMENT_LINES} dòng`);
  }
  const line: CartLine = {
    key,
    productId: product.id,
    code: product.code,
    name: product.name,
    unitName: unit.name,
    factor: unit.factor,
    qty,
    unitPrice: unit.price,
    units,
    baseUnit: product.baseUnit,
  };
  return changed(cart, { lines: [...cart.lines, line] });
}

export function setLineQty(cart: Cart, key: string, qty: number): Cart {
  return changed(cart, { lines: cart.lines.map((l) => (l.key === key ? { ...l, qty } : l)) });
}

export function setLinePrice(cart: Cart, key: string, unitPrice: number): Cart {
  return changed(cart, {
    lines: cart.lines.map((l) => (l.key === key ? { ...l, unitPrice } : l)),
  });
}

/**
 * Đổi đơn vị của dòng: giá về giá niêm yết của đơn vị mới, số lượng giữ nguyên con số.
 * Nếu giỏ đã có dòng cùng hàng với đơn vị mới thì gộp vào dòng đó.
 */
export function setLineUnit(cart: Cart, key: string, unitName: string): Cart {
  const line = cart.lines.find((l) => l.key === key);
  const unit = line?.units.find((u) => u.name === unitName);
  if (!line || !unit || unit.name === line.unitName) return cart;
  const newKey = lineKey(line.productId, unit.name);
  const target = cart.lines.find((l) => l.key === newKey);
  const lines = target
    ? cart.lines
        .filter((l) => l.key !== key)
        .map((l) => (l.key === newKey ? { ...l, qty: l.qty + line.qty } : l))
    : cart.lines.map((l) =>
        l.key === key
          ? { ...l, key: newKey, unitName: unit.name, factor: unit.factor, unitPrice: unit.price }
          : l,
      );
  return changed(cart, { lines });
}

export function removeLine(cart: Cart, key: string): Cart {
  return changed(cart, { lines: cart.lines.filter((l) => l.key !== key) });
}

export function setCustomer(cart: Cart, customer: CartCustomer | null): Cart {
  return { ...cart, customer };
}

export function setDiscount(cart: Cart, discount: number): Cart {
  return { ...cart, discount };
}

export function setPaid(cart: Cart, paid: number | null): Cart {
  return { ...cart, paid };
}

export function setPaymentMethod(cart: Cart, paymentMethod: PaymentMethod): Cart {
  return { ...cart, paymentMethod };
}

export function setLineErrors(cart: Cart, lineErrors: Record<string, string>): Cart {
  return { ...cart, lineErrors };
}

export interface CartSummary {
  /** Số dòng hàng ("3 món"). */
  itemCount: number;
  /** Tổng tiền hàng (trước giảm giá). */
  subtotal: number;
  discount: number;
  /** Khách cần trả. */
  total: number;
  /** Khách thanh toán (ô trống = vừa đủ). */
  paid: number;
  /** Tiền thừa trả khách. */
  change: number;
  /** Còn thiếu, ghi nợ. */
  debtAmount: number;
  /** Dư nợ của khách sau đơn này (null nếu khách lẻ). */
  debtAfter: number | null;
}

export function lineTotal(line: CartLine): number {
  return lineAmount(line.qty, line.unitPrice);
}

export function summarize(cart: Cart): CartSummary {
  const subtotal = cart.lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const discount = Math.min(cart.discount, subtotal);
  const total = subtotal - discount;
  const paid = cart.paid ?? total;
  const debtAmount = Math.max(0, total - paid);
  return {
    itemCount: cart.lines.length,
    subtotal,
    discount,
    total,
    paid,
    change: Math.max(0, paid - total),
    debtAmount,
    debtAfter: cart.customer ? cart.customer.debt + debtAmount : null,
  };
}

/** Câu báo lỗi nếu chưa thanh toán được; null nếu được. */
export function checkoutError(cart: Cart): string | null {
  if (cart.lines.length === 0) return "Hóa đơn chưa có mặt hàng nào";
  if (cart.lines.some((l) => l.qty <= 0)) return "Số lượng phải lớn hơn 0";
  const subtotal = cart.lines.reduce((sum, l) => sum + lineTotal(l), 0);
  if (cart.discount > subtotal) return "Giảm giá không được lớn hơn tổng tiền hàng";
  const { debtAmount } = summarize(cart);
  if (debtAmount > 0 && !cart.customer) {
    return "Khách lẻ phải trả đủ. Chọn khách hàng để ghi nợ phần còn thiếu";
  }
  return null;
}

/** Tổng số lượng cơ bản (milli) theo mặt hàng. */
export function baseQtyByProduct(cart: Cart): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of cart.lines) {
    m.set(l.productId, (m.get(l.productId) ?? 0) + toBaseQty(l.qty, l.factor));
  }
  return m;
}

/**
 * Cảnh báo sớm (chưa chặn): hàng không cho bán âm mà số trong giỏ vượt tồn đang biết.
 * Trả về tồn hiện có theo productId. Server mới là nơi quyết định.
 */
export function stockWarnings(
  cart: Cart,
  stockOf: (productId: string) => { stock: number; allowNegative: boolean } | undefined,
): Map<string, number> {
  const warnings = new Map<string, number>();
  for (const [productId, qty] of baseQtyByProduct(cart)) {
    const p = stockOf(productId);
    if (p && !p.allowNegative && qty > p.stock) warnings.set(productId, p.stock);
  }
  return warnings;
}

// Bậc làm tròn tiền mặt thường gặp.
const ROUNDING_STEPS = [10_000, 50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000];

/**
 * Nút tiền nhanh ngoài "Vừa đủ": tối đa 3 mức làm tròn lên lớn hơn số tiền cần trả.
 * 113.000 → 120.000, 150.000, 200.000.
 */
export function quickAmounts(total: number, count = 3): number[] {
  if (total <= 0) return [];
  const amounts = new Set<number>();
  for (const step of ROUNDING_STEPS) {
    const rounded = Math.ceil(total / step) * step;
    if (rounded > total) amounts.add(rounded);
  }
  return [...amounts].sort((a, b) => a - b).slice(0, count);
}

/** Body gửi POST /api/sales. Khách thanh toán bỏ trống = trả vừa đủ. */
export function toSaleInput(cart: Cart, force = false): SaleInput {
  const { discount, paid } = summarize(cart);
  return {
    idempotencyKey: cart.idempotencyKey,
    contactId: cart.customer?.id ?? null,
    lines: cart.lines.map((l) => ({
      productId: l.productId,
      unitName: l.unitName,
      qty: l.qty,
      unitPrice: l.unitPrice,
    })),
    discount,
    paid,
    paymentMethod: cart.paymentMethod,
    force,
  };
}

/**
 * Lỗi từ POST /api/sales → câu lỗi theo mặt hàng để tô đỏ đúng dòng.
 * OUT_OF_STOCK: `details.items[{ productId, stock }]`; các lỗi một hàng (PRICE_BELOW_COST,
 * PRODUCT_INACTIVE, INVALID_UNIT, NOT_FOUND): `details.productId` kèm câu lỗi của server.
 */
export function lineErrorsFromApi(
  cart: Cart,
  code: string,
  message: string,
  details: unknown,
): Record<string, string> {
  const d = (details ?? {}) as { items?: unknown; productId?: unknown };
  const result: Record<string, string> = {};
  const lineOf = (productId: unknown) =>
    typeof productId === "string" ? cart.lines.find((l) => l.productId === productId) : undefined;

  if (code === "OUT_OF_STOCK" && Array.isArray(d.items)) {
    for (const item of d.items as Array<{ productId?: unknown; stock?: unknown }>) {
      const line = lineOf(item.productId);
      if (line && typeof item.stock === "number") {
        result[line.productId] =
          `Không đủ hàng: chỉ còn ${formatQty(Math.max(item.stock, 0), line.baseUnit)}`;
      }
    }
    return result;
  }
  const line = lineOf(d.productId);
  if (line) result[line.productId] = message;
  return result;
}

/** Hóa đơn server trả về (khi gửi trùng idempotencyKey) có đúng là nội dung giỏ đang gửi không. */
export function matchesSale(
  input: SaleInput,
  doc: {
    contactId: string | null;
    discount: number;
    lines: Array<{ productId: string; unitName: string; qty: number; unitPrice: number }>;
  },
): boolean {
  const sig = (l: { productId: string; unitName: string; qty: number; unitPrice: number }) =>
    `${l.productId}|${l.unitName}|${l.qty}|${l.unitPrice}`;
  const a = input.lines.map(sig).sort();
  const b = doc.lines.map(sig).sort();
  return (
    (input.contactId ?? null) === doc.contactId &&
    (input.discount ?? 0) === doc.discount &&
    a.length === b.length &&
    a.every((x, i) => x === b[i])
  );
}
