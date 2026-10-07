import { useParams, useSearchParams } from "react-router";
import { usePayment } from "../../api/debts";
import { errorMessage } from "../../api/errors";
import { Alert } from "../../components/ui/Alert";
import { Spinner } from "../../components/ui/Spinner";
import { formatDateTime, formatMoney, formatPhone } from "../../lib/format";
import { PAYMENT_METHOD_LABEL } from "../documents/document-status";
import { loadReceiptWidth } from "../pos/print-preference";
import { Dashed, PrintScreen, PrintToolbar, ReceiptRow, ThermalPaper } from "./print-shell";
import { useAutoPrint } from "./use-auto-print";

const TITLE = { receipt: "PHIẾU THU TIỀN", disbursement: "PHIẾU CHI TIỀN" } as const;
const AMOUNT_LABEL = { receipt: "SỐ TIỀN THU", disbursement: "SỐ TIỀN CHI" } as const;
const WHO_LABEL = { receipt: "Khách hàng", disbursement: "Nhà cung cấp" } as const;

/**
 * In phiếu thu nợ khách / phiếu chi trả nợ nhà cung cấp: khổ giấy nhiệt như hóa đơn (dùng chung
 * `ThermalPaper`), dùng cho cả hai route `/in/phieu-thu/:id` và `/in/phieu-chi/:id` (loại phiếu
 * đọc từ `payment.type`, không phải từ đường dẫn).
 */
export function PaymentPrintPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const auto = params.get("auto") === "1";
  const query = usePayment(id);
  const payment = query.data;
  useAutoPrint(auto, !query.isPending && !query.isError);

  if (query.isPending) {
    return (
      <PrintScreen>
        <div className="flex justify-center py-16">
          <Spinner size={28} label="Đang tải phiếu" className="text-primary" />
        </div>
      </PrintScreen>
    );
  }
  if (query.isError || !payment) {
    return (
      <PrintScreen>
        <div className="p-4">
          <Alert>{query.isError ? errorMessage(query.error) : "Không tìm thấy phiếu"}</Alert>
        </div>
      </PrintScreen>
    );
  }

  return (
    <PrintScreen>
      <PrintToolbar>Phiếu {payment.code}</PrintToolbar>
      <ThermalPaper widthMm={loadReceiptWidth()}>
        <div className="flex flex-col items-center gap-0.5 text-center">
          <div className="text-[15px] font-bold uppercase">{payment.store?.name ?? "Cửa hàng"}</div>
          {payment.store?.address && <div>{payment.store.address}</div>}
          {payment.store?.phone && <div>ĐT: {formatPhone(payment.store.phone)}</div>}
        </div>
        <Dashed />
        <div className="text-center text-[14px] font-bold">
          {TITLE[payment.type]}
          {payment.status === "cancelled" && " (ĐÃ HỦY)"}
        </div>
        <div className="flex flex-col gap-px">
          <div>
            Số: {payment.code} · {formatDateTime(payment.createdAt)}
          </div>
          <ReceiptRow label="Người lập" value={payment.createdBy.name} />
          <ReceiptRow label={WHO_LABEL[payment.type]} value={payment.contact.name} />
          {payment.contact.phone && (
            <ReceiptRow label="SĐT" value={formatPhone(payment.contact.phone)} />
          )}
        </div>
        <Dashed />
        <ReceiptRow bold label={AMOUNT_LABEL[payment.type]} value={formatMoney(payment.amount)} />
        <ReceiptRow label="Hình thức" value={PAYMENT_METHOD_LABEL[payment.method]} />
        {payment.note && (
          <div>
            <div className="font-medium">Ghi chú</div>
            <div>{payment.note}</div>
          </div>
        )}
        {payment.balanceAfter !== null && (
          <ReceiptRow
            label="Dư nợ sau phiếu"
            value={formatMoney(Math.max(0, payment.balanceAfter))}
          />
        )}
        <Dashed />
        <div className="text-center font-semibold">
          {payment.type === "receipt"
            ? payment.store?.receiptFooter || "Cảm ơn quý khách, hẹn gặp lại!"
            : "Đã trả cho nhà cung cấp"}
        </div>
      </ThermalPaper>
    </PrintScreen>
  );
}
