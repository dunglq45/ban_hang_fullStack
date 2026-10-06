import type { SQL } from "drizzle-orm";
import type { z } from "zod";
import type {
  createContactSchema,
  listContactsQuerySchema,
  updateContactSchema,
} from "../../shared/schemas/contact";
import { contactSearchText } from "../../shared/text";
import type { StoreDb } from "../db/client";
import type { ContactType, CounterKind, UserRole } from "../db/schema";
import { codeNumber } from "../lib/codes";
import { isConstraintError } from "../lib/db-errors";
import { AppError } from "../lib/errors";
import { contactSearchValue } from "../lib/search";
import { uuidv7 } from "../lib/uuid";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Khách hàng KH000001, nhà cung cấp NCC000001. */
const CODE_KIND: Record<ContactType, CounterKind> = { customer: "KH", supplier: "NCC" };

export async function listContacts(db: StoreDb, query: z.output<typeof listContactsQuerySchema>) {
  const page = await db.contacts.list(
    {
      type: query.type,
      q: query.q,
      hasDebt: query.hasDebt,
      debtSinceBefore:
        query.overdueDays !== undefined ? Date.now() - query.overdueDays * DAY_MS : undefined,
    },
    query.sort,
    query.page,
    query.pageSize,
  );
  return { ...page, page: query.page, pageSize: query.pageSize };
}

export async function getContact(db: StoreDb, id: string) {
  const contact = await db.contacts.findById(id);
  if (!contact) throw new AppError("NOT_FOUND", "Không tìm thấy khách hàng / nhà cung cấp");
  return contact;
}

function mapWriteError(err: unknown): never {
  if (isConstraintError(err, "UNIQUE", "contacts.code")) {
    throw new AppError("CODE_TAKEN", "Mã này đã tồn tại");
  }
  throw err;
}

/**
 * Hạn mức nợ và trạng thái (ngừng giao dịch) chỉ chủ cửa hàng đặt được: staff được thêm/sửa thông
 * liên hệ của khách khi bán hàng, nhưng không được tự nới hạn mức nợ.
 */
export async function createContact(
  db: StoreDb,
  role: UserRole,
  input: z.output<typeof createContactSchema>,
) {
  const kind = CODE_KIND[input.type];
  const statements = [];
  let code: string | SQL<string>;
  if (input.code) {
    code = input.code;
    const n = codeNumber(kind, input.code);
    if (n !== null) statements.push(db.codes.atLeast(kind, n));
  } else {
    const next = db.codes.next(kind);
    statements.push(next.bump);
    code = next.code;
  }
  const now = Date.now();
  const id = uuidv7();
  try {
    await db.batchAll([
      ...statements,
      db.contacts.insert({
        id,
        type: input.type,
        code,
        name: input.name,
        nameSearch: contactSearchValue({ name: input.name, code, phone: input.phone }),
        phone: input.phone,
        address: input.address,
        note: input.note,
        debtLimit: role === "owner" ? input.debtLimit : null,
        isActive: role === "owner" ? input.isActive : true,
        createdAt: now,
        updatedAt: now,
      }),
    ]);
  } catch (err) {
    mapWriteError(err);
  }
  return getContact(db, id);
}

/** Sửa thông tin; loại, mã và công nợ không đổi ở đây. */
export async function updateContact(
  db: StoreDb,
  role: UserRole,
  id: string,
  input: z.output<typeof updateContactSchema>,
) {
  const current = await getContact(db, id);
  const [row] = await db.contacts.update(id, {
    name: input.name,
    nameSearch: contactSearchText({ name: input.name, code: current.code, phone: input.phone }),
    phone: input.phone,
    address: input.address,
    note: input.note,
    debtLimit: role === "owner" ? input.debtLimit : current.debtLimit,
    isActive: role === "owner" ? input.isActive : current.isActive,
    updatedAt: Date.now(),
  });
  if (!row) throw new AppError("NOT_FOUND", "Không tìm thấy khách hàng / nhà cung cấp");
  return row;
}
