import type { ReactNode } from "react";
import { Link } from "react-router";
import { useSession } from "../../api/auth";
import { usePayment } from "../../api/debts";
import { errorMessage } from "../../api/errors";
import { useDocument } from "../../api/inventory";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { buttonClass } from "../../components/ui/button-class";
import { Dialog } from "../../components/ui/Dialog";
import { Spinner } from "../../components/ui/Spinner";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { formatDateTime, formatMoney, formatQty } from "../../lib/format";
import { InvoiceDialog } from "../documents/InvoiceDialog";
import { METHOD_TEXT } from "./debt-utils";

export type LedgerRef = {
  kind: "document" | "payment";
  id: string;
  code: string | null;
  type: string | null;
};

const DOC_TITLE: Record<string, string> = {
  sale: "Hóa đơn bán hàng",
  sale_return: "Phiếu trả hàng",
  purchase: "Phiếu nhập hàng",
  stock_count: "Phiếu kiểm kho",
};

/** Bấm mã chứng từ trong sổ nợ: xem nhanh hóa đơn (kèm in lại, hủy) / phiếu nhập / phiếu thu chi. */
export function LedgerRefDialog({ target, onClose }: { target: LedgerRef; onClose: () => void }) {
  if (target.kind === "document" && target.type === "sale") {
    return <InvoiceDialog id={target.id} onClose={onClose} />;
  }
  return target.kind === "document" ? (
    <DocumentPreview id={target.id} type={target.type} onClose={onClose} />
  ) : (
    <PaymentPreview id={target.id} type={target.type} onClose={onClose} />
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink tabular-nums">{children}</span>
    </div>
  );
}

function StatusLine({ status }: { status: string }) {
  if (status === "cancelled") return <Badge tone="danger">Đã hủy</Badge>;
  if (status === "draft") return <Badge tone="neutral">Phiếu nháp</Badge>;
  return <Badge tone="success">Hoàn thành</Badge>;
}

function DocumentPreview({
  id,
  type,
  onClose,
}: {
  id: string;
  type: string | null;
  onClose: () => void;
}) {
  const { user } = useSession();
  const query = useDocument(id);
  const doc = query.data;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={
        doc
          ? `${DOC_TITLE[doc.type] ?? "Chứng từ"} ${doc.code}`
          : (DOC_TITLE[type ?? ""] ?? "Chứng từ")
      }
      description={doc ? formatDateTime(doc.createdAt) : undefined}
      footer={
        <>
          {doc?.type === "purchase" && user.role === "owner" && (
            <Link to={`/nhap-hang/${doc.id}`} className={buttonClass({ variant: "secondary" })}>
              Mở phiếu nhập
            </Link>
          )}
          <Button onClick={onClose}>Đóng</Button>
        </>
      }
    >
      {query.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : query.isError ? (
        <Alert>{errorMessage(query.error)}</Alert>
      ) : doc ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-body">
            <StatusLine status={doc.status} />
            {doc.contact && <span>{doc.contact.name}</span>}
            <span className="text-ink-muted">· Người lập: {doc.createdBy.name}</span>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Hàng hóa</TH>
                <TH numeric>Số lượng</TH>
                <TH numeric>Đơn giá</TH>
                <TH numeric>Thành tiền</TH>
              </TR>
            </THead>
            <TBody>
              {doc.lines.map((l) => (
                <TR key={l.id}>
                  <TD>{l.productName}</TD>
                  <TD numeric>
                    {formatQty(l.qty)} {l.unitName}
                  </TD>
                  <TD numeric>{formatMoney(l.unitPrice)}</TD>
                  <TD numeric>{formatMoney(l.lineTotal)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="ml-auto flex w-full max-w-xs flex-col gap-1.5">
            {doc.discount > 0 && <Row label="Giảm giá">{formatMoney(doc.discount)}</Row>}
            <Row label="Tổng tiền">{formatMoney(doc.total)}</Row>
            <Row label="Đã trả">{formatMoney(doc.paid)}</Row>
            <Row label="Ghi nợ">
              <span className="text-warn">{formatMoney(doc.debtAmount)}</span>
            </Row>
          </div>
          {doc.note && <p className="text-sm text-ink-body">Ghi chú: {doc.note}</p>}
        </div>
      ) : null}
    </Dialog>
  );
}

function PaymentPreview({
  id,
  type,
  onClose,
}: {
  id: string;
  type: string | null;
  onClose: () => void;
}) {
  const query = usePayment(id);
  const p = query.data;
  const title = (p?.type ?? type) === "disbursement" ? "Phiếu chi" : "Phiếu thu";

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={p ? `${title} ${p.code}` : title}
      description={p ? formatDateTime(p.createdAt) : undefined}
      footer={<Button onClick={onClose}>Đóng</Button>}
    >
      {query.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : query.isError ? (
        <Alert>{errorMessage(query.error)}</Alert>
      ) : p ? (
        <div className="flex flex-col gap-2">
          <div>
            <StatusLine status={p.status} />
          </div>
          <Row label={p.type === "disbursement" ? "Trả cho" : "Thu của"}>{p.contact.name}</Row>
          <Row label="Số tiền">{formatMoney(p.amount)}</Row>
          <Row label="Hình thức">{METHOD_TEXT[p.method]}</Row>
          {p.balanceAfter !== null && (
            <Row label="Dư nợ sau phiếu">{formatMoney(p.balanceAfter)}</Row>
          )}
          <Row label="Người lập">{p.createdBy.name}</Row>
          {p.note && <Row label="Ghi chú">{p.note}</Row>}
        </div>
      ) : null}
    </Dialog>
  );
}
