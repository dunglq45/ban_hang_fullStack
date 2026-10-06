import type { z } from "zod";
import type { listDocumentsQuerySchema } from "../../shared/schemas/document";
import type { StoreDb } from "../db/client";
import type { UserRole } from "../db/schema";
import { isConstraintError } from "../lib/db-errors";
import { isGuardError } from "../lib/guard";
import { AppError } from "../lib/errors";
import { uuidv7 } from "../lib/uuid";
import type { SessionUser } from "../types";

/** Staff chỉ xem hóa đơn bán: phiếu nhập/kiểm kho chứa giá vốn (quy tắc 8). */
function assertCanView(role: UserRole, type: string) {
  if (role !== "owner" && type !== "sale") {
    throw new AppError("FORBIDDEN", "Bạn chỉ xem được hóa đơn bán hàng");
  }
}

export async function listDocuments(
  db: StoreDb,
  role: UserRole,
  query: z.output<typeof listDocumentsQuerySchema>,
) {
  if (query.type) assertCanView(role, query.type);
  const page = await db.documents.list(
    {
      type: role === "owner" ? query.type : "sale",
      status: query.status,
      contactId: query.contactId,
      from: query.from,
      to: query.to,
      q: query.q,
    },
    query.page,
    query.pageSize,
  );
  return { ...page, page: query.page, pageSize: query.pageSize };
}

/**
 * Chứng từ đầy đủ để hiển thị và in hóa đơn: cửa hàng, khách (kèm tổng nợ hiện tại), dòng hàng,
 * tổng tiền, đã trả, ghi nợ, người tạo/hủy. Staff không nhận giá vốn của dòng.
 */
export async function getDocument(db: StoreDb, role: UserRole, id: string) {
  const header = await db.documents.header(id);
  if (!header) throw new AppError("NOT_FOUND", "Không tìm thấy chứng từ");
  assertCanView(role, header.type);
  const [lines, store] = await Promise.all([db.documents.lines(id), db.store.get()]);
  const {
    contactCode,
    contactName,
    contactPhone,
    contactAddress,
    contactDebt,
    createdById,
    createdByName,
    cancelledById,
    cancelledByName,
    ...doc
  } = header;
  return {
    ...doc,
    contact:
      doc.contactId && contactName !== null
        ? {
            id: doc.contactId,
            code: contactCode ?? "",
            name: contactName,
            phone: contactPhone,
            address: contactAddress,
            debt: contactDebt ?? 0,
          }
        : null,
    createdBy: { id: createdById, name: createdByName ?? "" },
    cancelledBy: cancelledById ? { id: cancelledById, name: cancelledByName ?? "" } : null,
    store: store
      ? {
          name: store.name,
          phone: store.phone,
          address: store.address,
          receiptFooter: store.receiptFooter,
        }
      : null,
    lines: lines.map(({ costPrice, ...line }) =>
      role === "owner" ? { ...line, costPrice } : line,
    ),
  };
}

export type DocumentDetail = Awaited<ReturnType<typeof getDocument>>;

/**
 * Hủy chứng từ (chỉ owner, chỉ status completed): sinh bút toán đảo, không sửa/xóa dòng cũ.
 * Câu chặn ngay sau UPDATE status bảo đảm hai request hủy đồng thời chỉ một cái có hiệu lực.
 */
export async function cancelDocument(db: StoreDb, actor: SessionUser, id: string) {
  const doc = await db.documents.findById(id);
  if (!doc) throw new AppError("NOT_FOUND", "Không tìm thấy chứng từ");
  if (doc.status === "cancelled") {
    throw new AppError("ALREADY_CANCELLED", `Chứng từ ${doc.code} đã bị hủy trước đó`);
  }
  if (doc.status !== "completed") {
    throw new AppError("INVALID_STATUS", "Chỉ hủy được chứng từ đã hoàn thành");
  }
  if (doc.type !== "sale") {
    throw new AppError("BAD_REQUEST", "Chưa hỗ trợ hủy loại chứng từ này");
  }

  const lines = await db.documents.lines(id);
  const now = Date.now();
  const note = `Hủy ${doc.code}`;
  try {
    await db.batchAll([
      db.documents.markCancelled(id, actor.id, now),
      db.guardChanges(1),
      // Hủy bán: cộng lại tồn theo đúng số đã trừ, giá vốn ghi theo giá đã chụp ở dòng phiếu.
      ...lines.flatMap((l) =>
        db.stock.reverseLineStatements({
          documentId: id,
          productId: l.productId,
          delta: l.baseQty,
          unitCost: l.costPrice,
          movementId: uuidv7(),
          note,
          now,
        }),
      ),
      ...(doc.debtAmount > 0 && doc.contactId
        ? db.debts.changeStatements({
            contactId: doc.contactId,
            amount: -doc.debtAmount,
            now,
            entryId: uuidv7(),
            documentId: id,
            note,
          })
        : []),
    ]);
  } catch (err) {
    if (isGuardError(err)) {
      throw new AppError("ALREADY_CANCELLED", `Chứng từ ${doc.code} đã bị hủy trước đó`);
    }
    // Cộng lại tồn mà vẫn âm, trong khi hàng đã tắt "cho phép bán âm".
    if (isConstraintError(err, "CHECK", "products_stock_check")) {
      throw new AppError(
        "NEGATIVE_STOCK",
        'Tồn kho của một mặt hàng trong chứng từ đang âm. Hãy kiểm kho hoặc bật "Cho phép bán khi hết hàng" rồi hủy lại',
      );
    }
    throw err;
  }
  return getDocument(db, actor.role, id);
}
