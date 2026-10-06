// Helper lập hóa đơn bán cho test (dùng lại ở giai đoạn sau: hủy, công nợ, báo cáo).
import type {
  CreatePurchaseInput,
  CreateSaleInput,
  PurchaseLineInput,
  SaleLineInput,
} from "../../src/shared/schemas/document";
import { lineAmount } from "../../src/shared/qty";
import type { TestUser } from "./stores";

export function saleInput(
  lines: SaleLineInput[],
  overrides: Partial<CreateSaleInput> = {},
): CreateSaleInput {
  const subtotal = lines.reduce((s, l) => s + lineAmount(l.qty, l.unitPrice), 0);
  return {
    idempotencyKey: crypto.randomUUID(),
    contactId: null,
    lines,
    discount: 0,
    paid: subtotal - (overrides.discount ?? 0),
    paymentMethod: "cash",
    ...overrides,
  };
}

/** Bán và trả về hóa đơn; ném lỗi nếu không phải 201. */
export async function sell(user: TestUser, input: CreateSaleInput) {
  const res = await user.api.sales.$post({ json: input });
  if (res.status !== 201) throw new Error(`bán hàng thất bại: ${await res.text()}`);
  return res.json();
}

export function purchaseInput(
  lines: PurchaseLineInput[],
  overrides: Partial<CreatePurchaseInput> = {},
): CreatePurchaseInput {
  const subtotal = lines.reduce((s, l) => s + lineAmount(l.qty, l.unitPrice), 0);
  return {
    idempotencyKey: crypto.randomUUID(),
    status: "completed",
    contactId: null,
    lines,
    discount: 0,
    paid: subtotal - (overrides.discount ?? 0),
    paymentMethod: "cash",
    ...overrides,
  };
}

/** Nhập hàng (owner) và trả về phiếu; ném lỗi nếu không phải 201. */
export async function purchase(user: TestUser, input: CreatePurchaseInput) {
  const res = await user.api.purchases.$post({ json: input });
  if (res.status !== 201) throw new Error(`nhập hàng thất bại: ${await res.text()}`);
  return res.json();
}
