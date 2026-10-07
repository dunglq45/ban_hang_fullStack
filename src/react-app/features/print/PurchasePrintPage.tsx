import { useParams, useSearchParams } from "react-router";
import { useDocument } from "../../api/inventory";
import { errorMessage } from "../../api/errors";
import { Alert } from "../../components/ui/Alert";
import { Spinner } from "../../components/ui/Spinner";
import { formatDateTime, formatMoney, formatPhone, formatQty } from "../../lib/format";
import { PAYMENT_METHOD_LABEL } from "../documents/document-status";
import { PrintScreen, PrintToolbar } from "./print-shell";
import { useAutoPrint } from "./use-auto-print";

/** In phiếu nhập hàng khổ A5: đối chiếu với nhà cung cấp lúc nhận hàng. */
export function PurchasePrintPage() {
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
          <Spinner size={28} label="Đang tải phiếu nhập" className="text-primary" />
        </div>
      </PrintScreen>
    );
  }
  if (query.isError || !doc || doc.type !== "purchase") {
    return (
      <PrintScreen>
        <div className="p-4">
          <Alert>{query.isError ? errorMessage(query.error) : "Không tìm thấy phiếu nhập"}</Alert>
        </div>
      </PrintScreen>
    );
  }

  return (
    <PrintScreen>
      <PrintToolbar>Phiếu nhập {doc.code}</PrintToolbar>
      <style>{`@media print { @page { size: A5; margin: 12mm; } }`}</style>
      <div className="mx-auto flex max-w-[148mm] flex-col gap-4 bg-white px-6 py-7 text-[13px] leading-normal text-black shadow-[0_4px_16px_rgba(16,24,40,0.12)] print:px-0 print:py-0 print:shadow-none">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-bold uppercase">{doc.store?.name ?? "Cửa hàng"}</div>
            {doc.store?.address && <div>{doc.store.address}</div>}
            {doc.store?.phone && <div>ĐT: {formatPhone(doc.store.phone)}</div>}
          </div>
          <div className="text-right">
            <div className="font-semibold">Số: {doc.code}</div>
            <div>{formatDateTime(doc.completedAt ?? doc.createdAt)}</div>
          </div>
        </div>

        <div className="text-center text-lg font-bold uppercase">Phiếu nhập hàng</div>
        {doc.status === "cancelled" && (
          <div className="text-center font-bold">
            (ĐÃ HỦY{doc.cancelledAt ? ` lúc ${formatDateTime(doc.cancelledAt)}` : ""})
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="font-semibold">Nhà cung cấp: </span>
            {doc.contact ? doc.contact.name : "Không chọn"}
            {doc.contact?.phone && ` · ${formatPhone(doc.contact.phone)}`}
          </div>
          <div>
            <span className="font-semibold">Người nhập: </span>
            {doc.createdBy.name}
          </div>
        </div>
        {doc.note && (
          <div>
            <span className="font-semibold">Ghi chú: </span>
            {doc.note}
          </div>
        )}

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-y border-black">
              <th className="py-1.5 pr-2 font-semibold">#</th>
              <th className="py-1.5 pr-2 font-semibold">Mã hàng</th>
              <th className="py-1.5 pr-2 font-semibold">Tên hàng</th>
              <th className="py-1.5 pr-2 text-right font-semibold">SL</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Đơn giá</th>
              <th className="py-1.5 text-right font-semibold">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={l.id} className="border-b border-black/30">
                <td className="py-1.5 pr-2">{i + 1}</td>
                <td className="py-1.5 pr-2">{l.productCode}</td>
                <td className="py-1.5 pr-2">{l.productName}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatQty(l.qty, l.unitName)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(l.unitPrice)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">
                  {formatMoney(l.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto flex w-full max-w-[70mm] flex-col gap-1">
          <div className="flex justify-between">
            <span>Tổng tiền hàng</span>
            <span>{formatMoney(doc.subtotal)}</span>
          </div>
          {doc.discount > 0 && (
            <div className="flex justify-between">
              <span>Chiết khấu</span>
              <span>{formatMoney(doc.discount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-black pt-1 font-bold">
            <span>Tổng cộng</span>
            <span>{formatMoney(doc.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>
              Đã trả
              {doc.paid > 0 && doc.paymentMethod
                ? ` (${PAYMENT_METHOD_LABEL[doc.paymentMethod].toLowerCase()})`
                : ""}
            </span>
            <span>{formatMoney(doc.paid)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Còn nợ nhà cung cấp</span>
            <span>{formatMoney(doc.debtAmount)}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6 text-center">
          <div>
            <div className="font-semibold">Người giao hàng</div>
            <div className="h-16" />
          </div>
          <div>
            <div className="font-semibold">Người nhận hàng</div>
            <div className="h-16" />
          </div>
        </div>
      </div>
    </PrintScreen>
  );
}
