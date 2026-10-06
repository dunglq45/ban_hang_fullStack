// Gom các repository của một cửa hàng. Mỗi repository nhận storeId qua closure,
// nên code gọi không có cách nào truyền storeId khác vào.
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "../db/client";
import type { CounterKind } from "../db/schema";
import { codeStatements, counterAtLeast } from "../lib/codes";
import { guardChanges } from "../lib/guard";
import { categoriesRepository } from "./categories";
import { contactsRepository } from "./contacts";
import { debtsRepository } from "./debts";
import { documentsRepository } from "./documents";
import { paymentsRepository } from "./payments";
import { productsRepository } from "./products";
import { reportsRepository } from "./reports";
import { stockRepository } from "./stock";
import { storeRepository } from "./store";
import { usersRepository } from "./users";

export function createRepositories(db: Database, storeId: string) {
  return {
    storeId,
    /** Chạy nhiều câu lệnh nguyên tử (D1 không có interactive transaction). */
    batch: db.batch.bind(db),
    /** Như batch nhưng nhận mảng độ dài bất kỳ (câu lệnh sinh động); mảng rỗng thì không làm gì. */
    async batchAll(statements: BatchItem<"sqlite">[]): Promise<void> {
      const [first, ...rest] = statements;
      if (first) await db.batch([first, ...rest]);
    },
    /** Câu chặn: lỗi (rollback batch) nếu câu ngay trước không đổi đúng `expected` dòng. */
    guardChanges: (expected = 1) => guardChanges(db, storeId, expected),
    codes: {
      /** Câu tăng bộ đếm + subquery lấy mã; đặt `bump` trước câu dùng `code` trong cùng batch. */
      next: (kind: CounterKind) => codeStatements(db, storeId, kind),
      /** Đẩy bộ đếm lên ít nhất n (khi người dùng tự nhập mã đúng mẫu, vd. SP000200). */
      atLeast: (kind: CounterKind, n: number) => counterAtLeast(db, storeId, kind, n),
    },
    store: storeRepository(db, storeId),
    users: usersRepository(db, storeId),
    categories: categoriesRepository(db, storeId),
    products: productsRepository(db, storeId),
    contacts: contactsRepository(db, storeId),
    stock: stockRepository(db, storeId),
    documents: documentsRepository(db, storeId),
    debts: debtsRepository(db, storeId),
    payments: paymentsRepository(db, storeId),
    reports: reportsRepository(db, storeId),
  };
}
