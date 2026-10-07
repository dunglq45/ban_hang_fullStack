import { useParams, useSearchParams } from "react-router";
import { useDocument } from "../../api/inventory";
import { errorMessage } from "../../api/errors";
import { Alert } from "../../components/ui/Alert";
import { Spinner } from "../../components/ui/Spinner";
import { formatDateTime, formatMoney, formatPhone, formatQty } from "../../lib/format";
import { PAYMENT_METHOD_LABEL } from "../documents/document-status";
import { loadReceiptWidth } from "../pos/print-preference";
import { Dashed, PrintScreen, PrintToolbar, ReceiptRow, ThermalPaper } from "./print-shell";
import { useAutoPrint } from "./use-auto-print";

/**
 * In hóa đơn bán hàng khổ giấy nhiệt (58/80mm, chọn ở Cài đặt): theo `design/HoaDon.dc.html`.
 * Mở từ POS kèm `?auto=1` thì tự in rồi đóng tab; "In lại" từ danh sách hóa đơn mở trang này
 * không có `auto` nên chỉ hiện nút in thủ công.
 */
export function InvoicePrintPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const auto = params.get("auto") === "1";
  const query = useDocument(id);
  const doc = query.data;
  useAutoPrint(auto, !query.isPending && !query.isError);

  if (query.isPending) {
    return (
      <PrintScreen>
        <div className="flex justify-center py-16">
          <Spinner size={28} label="Đang tải hóa đơn" className="text-primary" />
        </div>
      </PrintScreen>
    );
  }
  if (query.isError || !doc) {
    return (
      <PrintScreen>
        <div className="p-4">
          <Alert>{query.isError ? errorMessage(query.error) : "Không tìm thấy hóa đơn"}</Alert>
        </div>
      </PrintScreen>
    );
  }

  return (
    <PrintScreen>
      <PrintToolbar>Hóa đơn {doc.code}</PrintToolbar>
      <ThermalPaper widthMm={loadReceiptWidth()}>
        <div className="flex flex-col items-center gap-0.5 text-center">
          <div className="text-[15px] font-bold uppercase">{doc.store?.name ?? "Cửa hàng"}</div>
          {doc.store?.address && <div>{doc.store.address}</div>}
          {doc.store?.phone && <div>ĐT: {formatPhone(doc.store.phone)}</div>}
        </div>
        <Dashed />
        <div className="text-center text-[14px] font-bold">
          {doc.status === "cancelled" ? "HÓA ĐƠN ĐÃ HỦY" : "HÓA ĐƠN BÁN HÀNG"}
        </div>
        <div className="flex flex-col gap-px">
          <div>
            Số: {doc.code} · {formatDateTime(doc.createdAt)}
          </div>
          <ReceiptRow label="Thu ngân" value={doc.createdBy.name} />
          {doc.contact && <ReceiptRow label="Khách hàng" value={doc.contact.name} />}
          {doc.contact?.phone && <ReceiptRow label="SĐT" value={formatPhone(doc.contact.phone)} />}
        </div>
        <Dashed />
        <div className="flex justify-between font-bold">
          <span>Mặt hàng</span>
          <span>Thành tiền</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {doc.lines.map((l) => (
            <div key={l.id}>
              <div>{l.productName}</div>
              <div className="flex justify-between gap-2">
                <span>
                  {formatQty(l.qty, l.unitName)} x {formatMoney(l.unitPrice)}
                </span>
                <span className="font-semibold">{formatMoney(l.lineTotal)}</span>
              </div>
            </div>
          ))}
        </div>
        <Dashed />
        <div className="flex flex-col gap-px">
          <ReceiptRow label="Tổng tiền hàng" value={formatMoney(doc.subtotal)} />
          {doc.discount > 0 && <ReceiptRow label="Giảm giá" value={formatMoney(doc.discount)} />}
          <ReceiptRow bold label="KHÁCH CẦN TRẢ" value={formatMoney(doc.total)} />
          {doc.paid > 0 && (
            <ReceiptRow
              label={`Khách thanh toán${doc.paymentMethod ? ` (${PAYMENT_METHOD_LABEL[doc.paymentMethod].toLowerCase()})` : ""}`}
              value={formatMoney(doc.paid)}
            />
          )}
          {doc.debtAmount > 0 && (
            <ReceiptRow bold label="Ghi nợ đơn này" value={formatMoney(doc.debtAmount)} />
          )}
          {doc.contact && (
            <ReceiptRow
              label="Tổng nợ hiện tại"
              value={formatMoney(Math.max(0, doc.contact.debt))}
            />
          )}
        </div>
        <Dashed />
        <div className="text-center font-semibold">
          {doc.store?.receiptFooter || "Cảm ơn quý khách, hẹn gặp lại!"}
        </div>
      </ThermalPaper>
    </PrintScreen>
  );
}
