// Hủy chứng từ (chỉ owner): sinh bút toán đảo, không sửa/xóa dòng cũ (quy tắc 4).
// Câu chặn ngay sau UPDATE status trong mỗi batch bảo đảm hai request hủy đồng thời chỉ một cái
// có hiệu lực.
import type { StoreDb } from "../db/client";
import { AppError } from "../lib/errors";
import { isGuardError } from "../lib/guard";
import type { SessionUser } from "../types";
import { cancelSale, getDocument } from "./documents";
import { cancelPurchase } from "./purchases";

export async function cancelDocument(db: StoreDb, actor: SessionUser, id: string) {
  const doc = await db.documents.findById(id);
  if (!doc) throw new AppError("NOT_FOUND", "Không tìm thấy chứng từ");
  if (doc.status === "cancelled") {
    throw new AppError("ALREADY_CANCELLED", `Chứng từ ${doc.code} đã bị hủy trước đó`);
  }

  switch (doc.type) {
    case "sale":
      await cancelSale(db, actor, doc);
      break;
    case "purchase":
      // Phiếu nháp: chỉ đổi trạng thái; đã hoàn thành: trừ tồn, tính ngược giá vốn, trừ nợ NCC.
      await cancelPurchase(db, actor, doc);
      break;
    case "stock_count":
      // Phiếu kiểm đã hoàn thành không hủy được: muốn sửa thì làm phiếu kiểm mới.
      if (doc.status !== "draft") {
        throw new AppError(
          "INVALID_STATUS",
          "Phiếu kiểm kho đã hoàn thành không hủy được. Hãy tạo phiếu kiểm mới để điều chỉnh",
        );
      }
      try {
        await db.batchAll([
          db.documents.markCancelled(doc.id, actor.id, Date.now(), "draft"),
          db.guardChanges(1),
        ]);
      } catch (err) {
        if (isGuardError(err)) {
          throw new AppError("INVALID_STATUS", `Phiếu ${doc.code} đã hoàn thành hoặc đã bị hủy`);
        }
        throw err;
      }
      break;
    default:
      throw new AppError("BAD_REQUEST", "Chưa hỗ trợ hủy loại chứng từ này");
  }
  return getDocument(db, actor.role, id);
}
