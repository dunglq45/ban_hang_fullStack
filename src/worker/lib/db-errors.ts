// Drizzle bọc lỗi D1 thành "Failed query: ..." và để lỗi gốc ở `cause`.
// Các hàm ở đây dò cả chuỗi cause để nhận ra vi phạm ràng buộc (ví dụ CHECK tồn kho → OUT_OF_STOCK).

export type ConstraintKind = "CHECK" | "UNIQUE" | "FOREIGN KEY" | "NOT NULL";

function messages(err: unknown): string[] {
  const out: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur instanceof Error && depth < 5; depth++) {
    out.push(cur.message);
    cur = cur.cause;
  }
  return out;
}

/** true nếu lỗi (hoặc cause của nó) là vi phạm ràng buộc loại `kind`, tùy chọn khớp tên ràng buộc/cột. */
export function isConstraintError(err: unknown, kind: ConstraintKind, name?: string): boolean {
  return messages(err).some(
    (m) => m.includes(`${kind} constraint failed`) && (name === undefined || m.includes(name)),
  );
}
