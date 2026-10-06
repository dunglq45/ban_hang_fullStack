// Nhiều hóa đơn song song (tab "Hóa đơn 1", "Hóa đơn 2"...), lưu vào localStorage để tải lại
// trang không mất đơn. Reducer thuần để test riêng.
import { z } from "zod";
import { uuidv7 } from "../../../shared/uuid";
import { type Cart, type CartCustomer, emptyCart } from "./cart";

export const MAX_TABS = 10;

export interface PosTabsState {
  tabs: Cart[];
  activeId: string;
}

export type PosTabsAction =
  | { type: "new" }
  | { type: "select"; id: string }
  | { type: "close"; id: string }
  | { type: "update"; id: string; update: (cart: Cart) => Cart }
  /** Bán xong: thay bằng đơn trống (idempotencyKey mới), giữ số thứ tự tab. */
  | { type: "reset"; id: string }
  /** Giữ nội dung nhưng đổi idempotencyKey (key cũ đã thuộc một hóa đơn khác). */
  | { type: "rekey"; id: string }
  /**
   * "Ghi nợ" từ Sổ nợ: bán cho khách này. Đơn đang mở còn trống thì dùng luôn, có tab trống của
   * đúng khách này thì chuyển sang, không thì mở đơn mới (đủ 10 đơn thì giữ nguyên).
   */
  | { type: "openForCustomer"; customer: CartCustomer };

export function initialTabs(): PosTabsState {
  const cart = emptyCart(1);
  return { tabs: [cart], activeId: cart.id };
}

/** Số thứ tự nhỏ nhất chưa dùng: đóng "Hóa đơn 2" thì đơn mới lại là "Hóa đơn 2". */
function nextNumber(tabs: Cart[]) {
  const used = new Set(tabs.map((t) => t.number));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

export function posTabsReducer(state: PosTabsState, action: PosTabsAction): PosTabsState {
  switch (action.type) {
    case "new": {
      if (state.tabs.length >= MAX_TABS) return state;
      const cart = emptyCart(nextNumber(state.tabs));
      const tabs = [...state.tabs, cart].sort((a, b) => a.number - b.number);
      return { tabs, activeId: cart.id };
    }
    case "select":
      return state.tabs.some((t) => t.id === action.id) ? { ...state, activeId: action.id } : state;
    case "close": {
      const index = state.tabs.findIndex((t) => t.id === action.id);
      if (index < 0) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      if (tabs.length === 0) return initialTabs();
      const activeId =
        state.activeId === action.id ? tabs[Math.min(index, tabs.length - 1)]!.id : state.activeId;
      return { tabs, activeId };
    }
    case "update":
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.id === action.id ? action.update(t) : t)),
      };
    case "reset":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...emptyCart(t.number), id: t.id } : t,
        ),
      };
    case "openForCustomer": {
      const isBlank = (t: Cart) => t.lines.length === 0 && t.discount === 0 && t.paid === null;
      const same = state.tabs.find((t) => isBlank(t) && t.customer?.id === action.customer.id);
      // Dùng lại đơn trống của khách này, cập nhật nợ/hạn mức mới nhất.
      if (same) {
        return {
          tabs: state.tabs.map((t) => (t.id === same.id ? { ...t, customer: action.customer } : t)),
          activeId: same.id,
        };
      }
      const active = state.tabs.find((t) => t.id === state.activeId);
      if (active && isBlank(active) && active.customer === null) {
        return {
          ...state,
          tabs: state.tabs.map((t) =>
            t.id === active.id ? { ...t, customer: action.customer } : t,
          ),
        };
      }
      if (state.tabs.length >= MAX_TABS) return state;
      const cart = { ...emptyCart(nextNumber(state.tabs)), customer: action.customer };
      const tabs = [...state.tabs, cart].sort((a, b) => a.number - b.number);
      return { tabs, activeId: cart.id };
    }
    case "rekey":
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.id === action.id ? { ...t, idempotencyKey: uuidv7() } : t)),
      };
  }
}

// --- Lưu trữ ---------------------------------------------------------------------------------

const unitSchema = z.object({
  name: z.string(),
  factor: z.number().int().positive(),
  price: z.number().int().nonnegative(),
});

const cartSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  idempotencyKey: z.string(),
  lines: z.array(
    z.object({
      key: z.string(),
      productId: z.string(),
      code: z.string(),
      name: z.string(),
      unitName: z.string(),
      factor: z.number().int().positive(),
      qty: z.number().int().positive(),
      unitPrice: z.number().int().nonnegative(),
      units: z.array(unitSchema),
      baseUnit: z.string(),
    }),
  ),
  customer: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      phone: z.string().nullable(),
      debt: z.number(),
      debtLimit: z.number().nullable(),
    })
    .nullable(),
  discount: z.number().int().nonnegative(),
  paid: z.number().int().nonnegative().nullable(),
  paymentMethod: z.enum(["cash", "transfer"]),
  lineErrors: z.record(z.string(), z.string()),
});

const stateSchema = z.object({
  version: z.literal(1),
  tabs: z.array(cartSchema).min(1).max(MAX_TABS),
  activeId: z.string(),
});

/** Khóa lưu theo cửa hàng và người dùng: máy dùng chung không lẫn đơn của nhau. */
export function storageKey(storeId: string, userId: string) {
  return `pos:v1:${storeId}:${userId}`;
}

/** Đọc đơn đã lưu; dữ liệu hỏng hoặc khác phiên bản thì bắt đầu lại. */
export function loadTabs(key: string): PosTabsState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initialTabs();
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return initialTabs();
    const { tabs, activeId } = parsed.data;
    return { tabs, activeId: tabs.some((t) => t.id === activeId) ? activeId : tabs[0]!.id };
  } catch {
    return initialTabs();
  }
}

export function saveTabs(key: string, state: PosTabsState) {
  try {
    localStorage.setItem(key, JSON.stringify({ version: 1, ...state }));
  } catch {
    // Hết chỗ hoặc trình duyệt chặn lưu: vẫn bán được, chỉ không giữ đơn khi tải lại.
  }
}
