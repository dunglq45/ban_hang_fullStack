// Dữ liệu mẫu hàng hóa / danh bạ cho test API (dùng lại cho các giai đoạn sau).
import type { CreateContactInput } from "../../src/shared/schemas/contact";
import type { CreateProductInput } from "../../src/shared/schemas/product";
import type { TestUser } from "./stores";

export function productInput(overrides: Partial<CreateProductInput> = {}): CreateProductInput {
  return {
    name: "Nước mắm 500ml",
    code: null,
    barcode: null,
    categoryId: null,
    baseUnit: "Chai",
    costPrice: 31_000,
    salePrice: 38_000,
    minStock: 6_000,
    units: [],
    openingStock: 0,
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  };
}

/** Tạo hàng qua API (chủ cửa hàng), ném lỗi nếu thất bại. */
export async function createProduct(owner: TestUser, overrides: Partial<CreateProductInput> = {}) {
  const res = await owner.api.products.$post({ json: productInput(overrides) });
  if (res.status !== 201) throw new Error(`tạo hàng thất bại: ${await res.text()}`);
  return res.json();
}

export function contactInput(overrides: Partial<CreateContactInput> = {}): CreateContactInput {
  return {
    type: "customer",
    code: null,
    name: "Chị Lan",
    phone: "0912345678",
    address: "Hẻm 12, chợ Đồng",
    note: null,
    debtLimit: null,
    ...overrides,
  };
}

export async function createContact(user: TestUser, overrides: Partial<CreateContactInput> = {}) {
  const res = await user.api.contacts.$post({ json: contactInput(overrides) });
  if (res.status !== 201) throw new Error(`tạo đối tác thất bại: ${await res.text()}`);
  return res.json();
}
