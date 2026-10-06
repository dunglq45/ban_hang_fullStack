// Dữ liệu mẫu "hoạt động" cho D1 local (scripts/seed.ts gọi sau khi nạp dữ liệu nền):
// ~40 hóa đơn trong 7 ngày qua, 3 phiếu nhập, thu nợ, trả nợ NCC, 1 phiếu kiểm kho.
// Mọi thao tác đi qua CHÍNH các service như request thật (không insert tay), chỉ "lùi đồng hồ"
// (Date.now) về thời điểm của từng thao tác. Chỉ dùng cho dev, không được import từ route.
import { toMilli } from "../../shared/qty";
import { DAY_MS, vnDayStart } from "../../shared/period";
import { createSaleSchema, createPurchaseSchema } from "../../shared/schemas/document";
import type { SaleLineInput } from "../../shared/schemas/document";
import { createPaymentSchema } from "../../shared/schemas/payment";
import { getDb, type StoreDb } from "../db/client";
import { createPayment } from "../services/payments";
import { createPurchase } from "../services/purchases";
import { createSale } from "../services/sales";
import {
  completeStockCount,
  createStockCount,
  getStockCount,
  updateStockCountLines,
} from "../services/stock-counts";
import type { SessionUser } from "../types";

export interface SeedProduct {
  /** số trong mã SP (khóa trong dữ liệu seed) */
  no: number;
  id: string;
  unit: string;
  price: number;
  /** milli */
  stock: number;
  /** milli */
  min: number;
}

export interface SeedContext {
  storeId: string;
  owner: SessionUser;
  staff: SessionUser;
  products: SeedProduct[];
  /** tên → id */
  customers: Map<string, string>;
  suppliers: Map<string, string>;
  now: number;
}

export interface SeedSummary {
  sales: number;
  purchases: number;
  payments: number;
  stockCounts: number;
}

/** Hàng đang "cần nhập" theo design (Tổng quan): không bán thêm để giữ đúng tồn mẫu. */
const KEEP_STOCK = new Set([31, 52, 71, 88, 98]);
/** Số hóa đơn ngẫu nhiên mỗi ngày, từ 6 ngày trước tới hôm nay (cộng 2 hóa đơn cố định = 40). */
const SALES_PER_DAY = [5, 6, 5, 5, 6, 6, 5];

/** Bộ sinh số ngẫu nhiên có hạt giống: lần seed nào cũng ra cùng dữ liệu. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chạy fn như thể "bây giờ" là ts (services đọc thời gian qua Date.now). */
async function at<T>(ts: number, fn: () => Promise<T>): Promise<T> {
  const real = Date.now;
  Date.now = () => ts;
  try {
    return await fn();
  } finally {
    Date.now = real;
  }
}

export async function seedActivity(d1: D1Database, ctx: SeedContext): Promise<SeedSummary> {
  const db: StoreDb = getDb({ DB: d1 }, ctx.storeId);
  const rand = mulberry32(2026);
  const today = vnDayStart(ctx.now);
  /** Thời điểm d ngày trước, h giờ m phút (giờ VN). */
  const time = (daysAgo: number, h: number, m = 0) =>
    today - daysAgo * DAY_MS + (h * 60 + m) * 60_000;
  const product = (no: number) => {
    const p = ctx.products.find((x) => x.no === no);
    if (!p) throw new Error(`Seed thiếu SP${no}`);
    return p;
  };
  const customer = (name: string) => ctx.customers.get(name)!;
  const supplier = (name: string) => ctx.suppliers.get(name)!;
  const line = (no: number, qty: number, unitName?: string, unitPrice?: number): SaleLineInput => {
    const p = product(no);
    return {
      productId: p.id,
      unitName: unitName ?? p.unit,
      qty: toMilli(qty),
      unitPrice: unitPrice ?? p.price,
    };
  };
  const total = (lines: SaleLineInput[]) =>
    lines.reduce((s, l) => s + Math.round((l.qty * l.unitPrice) / 1000), 0);

  // Ngân sách bán của từng hàng: luôn chừa lại trên mức tối thiểu để hàng không tự rơi vào "cần nhập".
  const budget = new Map(ctx.products.map((p) => [p.no, p.stock - p.min - 1000]));
  const take = (no: number, qty: number) => budget.set(no, budget.get(no)! - toMilli(qty));

  const summary: SeedSummary = { sales: 0, purchases: 0, payments: 0, stockCounts: 0 };
  type Event = { ts: number; run: () => Promise<unknown> };
  const events: Event[] = [];

  const sale = (
    ts: number,
    actor: SessionUser,
    lines: SaleLineInput[],
    extra: { contactId?: string; paid?: number; discount?: number; method?: "cash" | "transfer" },
  ) => {
    const discount = extra.discount ?? 0;
    events.push({
      ts,
      run: async () => {
        await createSale(
          db,
          actor,
          createSaleSchema.parse({
            idempotencyKey: crypto.randomUUID(),
            contactId: extra.contactId ?? null,
            lines,
            discount,
            paid: extra.paid ?? total(lines) - discount,
            paymentMethod: extra.method ?? "cash",
          }),
        );
        summary.sales++;
      },
    });
  };

  const purchase = (
    ts: number,
    supplierName: string,
    lines: SaleLineInput[],
    paid: number | "all",
    method: "cash" | "transfer" = "cash",
  ) => {
    events.push({
      ts,
      run: async () => {
        await createPurchase(
          db,
          ctx.owner,
          createPurchaseSchema.parse({
            idempotencyKey: crypto.randomUUID(),
            status: "completed",
            contactId: supplier(supplierName),
            lines,
            paid: paid === "all" ? total(lines) : paid,
            paymentMethod: method,
          }),
        );
        summary.purchases++;
      },
    });
  };

  const payment = (
    ts: number,
    actor: SessionUser,
    type: "receipt" | "disbursement",
    contactId: string,
    amount: number,
    method: "cash" | "transfer" = "cash",
  ) => {
    events.push({
      ts,
      run: async () => {
        await createPayment(
          db,
          actor,
          createPaymentSchema.parse({
            idempotencyKey: crypto.randomUUID(),
            type,
            contactId,
            amount,
            method,
          }),
        );
        summary.payments++;
      },
    });
  };

  // --- Thao tác cố định (khớp với ví dụ ở design/SoNo.dc.html) ---
  // Phiếu nhập: hàng nhập thêm không cộng vào ngân sách bán (chỉ là dư thêm).
  purchase(
    time(6, 8),
    "Đại lý Hưng Thịnh",
    [line(12, 100, "Gói", 3600), line(3, 2, "Thùng", 84_000), line(5, 48, "Lon", 7800)],
    500_000,
  );
  purchase(
    time(4, 8),
    "Công ty Phân phối Sài Gòn",
    [line(60, 50, "Kg", 27_000), line(9, 24, "Lon", 14_000)],
    "all",
  );
  purchase(
    time(2, 8),
    "Đại lý Hưng Thịnh",
    [line(75, 20, "Gói", 7500), line(73, 20, "Gói", 9000)],
    "all",
    "transfer",
  );
  // Chú Hải mua chịu (còn nợ 215.000 từ 3 ngày trước).
  const haiLines = [line(47, 2), line(60, 3), line(127, 1)];
  haiLines.forEach((l, i) => take([47, 60, 127][i]!, l.qty / 1000));
  sale(time(3, 10, 15), ctx.owner, haiLines, { contactId: customer("Chú Hải"), paid: 10_000 });
  // Thu nợ trong tháng: 3 lần, tổng 540.000.
  payment(time(3, 16), ctx.staff, "receipt", customer("Bác Bình"), 200_000);
  payment(time(2, 17, 30), ctx.owner, "receipt", customer("Anh Minh"), 150_000, "transfer");
  payment(time(1, 15), ctx.staff, "receipt", customer("Chị Lan"), 190_000);
  // Trả bớt nợ NCC.
  payment(
    time(1, 9),
    ctx.owner,
    "disbursement",
    supplier("Đại lý Hưng Thịnh"),
    500_000,
    "transfer",
  );
  // Hôm nay Chị Lan mua, trả thiếu 13.000 → nợ 363.000.
  const lanLines = [line(33, 1), line(90, 3)];
  take(33, 1);
  take(90, 3);
  const todayMid = today + Math.floor((ctx.now - today) / 2);
  sale(todayMid, ctx.staff, lanLines, { contactId: customer("Chị Lan"), paid: 28_000 });

  // Kiểm kho chiều hôm qua: Muối lệch −1 (vỡ), Tiêu khớp, Nước tương +1 (nhập thiếu phiếu).
  take(90, 1);
  events.push({
    ts: time(1, 19),
    run: async () => {
      const ids = [90, 101, 127].map((no) => product(no).id);
      const created = await createStockCount(db, ctx.owner, {
        categoryId: null,
        productIds: ids,
        note: "Kiểm gia vị cuối tuần",
      });
      const count = await getStockCount(db, ctx.owner.role, created.id);
      const delta = [-1000, 0, 1000];
      const reasons = ["Vỡ, hỏng", null, "Nhập thiếu phiếu"];
      await updateStockCountLines(db, ctx.staff, created.id, {
        lines: ids.map((pid, i) => {
          const l = count.lines.find((x) => x.productId === pid)!;
          return { lineId: l.id, actualQty: l.currentStock + delta[i]!, reason: reasons[i]! };
        }),
      });
      await completeStockCount(db, ctx.owner, created.id);
      summary.stockCounts++;
    },
  });

  // --- Hóa đơn bán lẻ ngẫu nhiên (có hạt giống) ---
  const pool = ctx.products.filter((p) => !KEEP_STOCK.has(p.no));
  const regulars = ["Anh Minh", "Bác Bình", "Anh Tuấn (thợ hồ)"];
  SALES_PER_DAY.forEach((count, i) => {
    const daysAgo = SALES_PER_DAY.length - 1 - i;
    for (let k = 0; k < count; k++) {
      const ts =
        daysAgo === 0
          ? today + Math.floor(((ctx.now - today) * (k + 1)) / (count + 2))
          : time(daysAgo, 7) + Math.floor(((14 * 60 * (k + rand())) / count) * 60_000);
      const lines: SaleLineInput[] = [];
      const nLines = 1 + Math.floor(rand() * 4);
      for (let tries = 0; lines.length < nLines && tries < 20; tries++) {
        const p = pool[Math.floor(rand() * pool.length)]!;
        if (lines.some((l) => l.productId === p.id)) continue;
        const qty =
          p.no === 60
            ? [1, 1.5, 2, 5][Math.floor(rand() * 4)]!
            : 1 + Math.floor(rand() * (p.price < 10_000 ? 5 : 2));
        if (budget.get(p.no)! < toMilli(qty)) continue;
        take(p.no, qty);
        lines.push(line(p.no, qty));
      }
      if (lines.length === 0) continue;
      const actor = rand() < 0.4 ? ctx.staff : ctx.owner;
      const sum = total(lines);
      // Chủ đôi khi bớt lẻ cho khách.
      const discount = actor === ctx.owner && sum > 50_000 && rand() < 0.3 ? sum % 5000 : 0;
      const regular =
        rand() < 0.2 ? customer(regulars[Math.floor(rand() * regulars.length)]!) : undefined;
      sale(ts, actor, lines, {
        contactId: regular,
        discount,
        method: rand() < 0.25 ? "transfer" : "cash",
      });
    }
  });

  // Chạy theo thứ tự thời gian, như các request thật lần lượt đến.
  events.sort((a, b) => a.ts - b.ts);
  for (const e of events) {
    await at(Math.min(e.ts, ctx.now), e.run);
  }
  return summary;
}
