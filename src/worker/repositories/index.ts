// Gom các repository của một cửa hàng. Mỗi repository nhận storeId qua closure,
// nên code gọi không có cách nào truyền storeId khác vào.
import type { Database } from "../db/client";
import type { CounterKind } from "../db/schema";
import { codeStatements } from "../lib/codes";
import { categoriesRepository } from "./categories";
import { storeRepository } from "./store";
import { usersRepository } from "./users";

export function createRepositories(db: Database, storeId: string) {
  return {
    storeId,
    /** Chạy nhiều câu lệnh nguyên tử (D1 không có interactive transaction). */
    batch: db.batch.bind(db),
    codes: {
      /** Câu tăng bộ đếm + subquery lấy mã; đặt `bump` trước câu dùng `code` trong cùng batch. */
      next: (kind: CounterKind) => codeStatements(db, storeId, kind),
    },
    store: storeRepository(db, storeId),
    users: usersRepository(db, storeId),
    categories: categoriesRepository(db, storeId),
  };
}
