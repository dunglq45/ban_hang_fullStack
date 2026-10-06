// Quy tắc 8: staff không được thấy giá vốn, lợi nhuận, giá trị tồn. Mọi route trả dữ liệu hàng hóa
// hoặc sổ kho đều đi qua các hàm ở đây, không tự xóa trường ở từng route.
import type { UserRole } from "../db/schema";

type WithoutCost<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Bỏ `costPrice` khỏi một mặt hàng (và các đơn vị con nếu có) khi người xem là staff. */
export function serializeProduct<T extends { costPrice: number }>(
  product: T,
  role: UserRole,
): WithoutCost<T, "costPrice"> {
  if (role === "owner") return product;
  const { costPrice: _hidden, ...rest } = product;
  return rest;
}

export function serializeProducts<T extends { costPrice: number }>(items: T[], role: UserRole) {
  return items.map((p) => serializeProduct(p, role));
}

/** Sổ kho: `unitCost` là giá vốn tại thời điểm ghi, chỉ owner được xem. */
export function serializeMovement<T extends { unitCost: number }>(
  movement: T,
  role: UserRole,
): WithoutCost<T, "unitCost"> {
  if (role === "owner") return movement;
  const { unitCost: _hidden, ...rest } = movement;
  return rest;
}

/** Giá trị chỉ owner được xem (vd. stockValue); staff nhận undefined (trường bị bỏ khỏi JSON). */
export function ownerOnly<T>(value: T, role: UserRole): T | undefined {
  return role === "owner" ? value : undefined;
}
