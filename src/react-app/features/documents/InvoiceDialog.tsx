import { type ReactNode, useState } from "react";
import { useSession } from "../../api/auth";
import { errorMessage } from "../../api/errors";
import { useCancelDocument, useDocument } from "../../api/inventory";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { buttonClass } from "../../components/ui/button-class";
import { Dialog } from "../../components/ui/Dialog";
import { Spinner } from "../../components/ui/Spinner";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { useToast } from "../../components/ui/toast-context";
import { contactLabel, formatDateTime, formatMoney, formatQty } from "../../lib/format";
import { PAYMENT_METHOD_LABEL } from "./document-status";
import { DocumentStatusBadge } from "./DocumentStatusBadge";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink tabular-nums">{children}</span>
    </div>
  );
}

/**
 * Xem hóa đơn bán: dòng hàng, tiền, khách, người bán. In lại mở trang in ở tab mới; chủ cửa hàng
 * hủy được hóa đơn đã hoàn thành (cộng lại tồn kho, giảm nợ khách) sau một bước xác nhận.
 */
export function InvoiceDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useSession();
  const toast = useToast();
  const query = useDocument(id);
  const cancel = useCancelDocument();
  const [confirming, setConfirming] = useState(false);
  const doc = query.data;
  const canCancel = user.role === "owner" && doc?.status === "completed";

  function close() {
    if (!cancel.isPending) onClose();
  }

  function doCancel() {
    cancel.mutate(id, {
      onSuccess: () => {
        toast(`Đã hủy hóa đơn ${doc?.code ?? ""}`);
        setConfirming(false);
      },
    });
  }

  if (confirming && doc) {
    return (
      <Dialog
        open
        onClose={() => {
          if (!cancel.isPending) setConfirming(false);
        }}
        closeOnOverlayClick={!cancel.isPending}
        size="sm"
        title={`Hủy hóa đơn ${doc.code}?`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirming(false)}
              disabled={cancel.isPending}
            >
              Không hủy
            </Button>
            <Button variant="danger" onClick={doCancel} loading={cancel.isPending}>
              Hủy hóa đơn
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-ink-body">
          <p>Hàng trên hóa đơn sẽ được cộng lại vào kho.</p>
          {doc.debtAmount > 0 && doc.contact && (
            <p>
              Nợ của {doc.contact.name} giảm{" "}
              <span className="font-semibold tabular-nums">{formatMoney(doc.debtAmount)}</span>.
            </p>
          )}
          {doc.paid > 0 && (
            <p>
              Khách đã trả{" "}
              <span className="font-semibold tabular-nums">{formatMoney(doc.paid)}</span>: nhớ trả
              lại tiền cho khách nếu cần.
            </p>
          )}
          <p className="text-ink-muted">Hóa đơn đã hủy không khôi phục được.</p>
          {cancel.isError && <Alert>{errorMessage(cancel.error)}</Alert>}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={close}
      size="lg"
      title={doc ? `Hóa đơn ${doc.code}` : "Hóa đơn bán hàng"}
      description={doc ? formatDateTime(doc.createdAt) : undefined}
      footer={
        <>
          {canCancel && (
            <Button
              variant="secondary"
              className="text-danger sm:mr-auto"
              onClick={() => {
                cancel.reset();
                setConfirming(true);
              }}
            >
              Hủy hóa đơn
            </Button>
          )}
          {doc && (
            <a
              href={`/in/hoa-don/${doc.id}`}
              target="_blank"
              rel="noreferrer"
              className={buttonClass({ variant: "secondary" })}
            >
              In lại
            </a>
          )}
          <Button onClick={close}>Đóng</Button>
        </>
      }
    >
      {query.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner label="Đang tải hóa đơn" />
        </div>
      ) : query.isError ? (
        <Alert>{errorMessage(query.error)}</Alert>
      ) : doc ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-body">
            <DocumentStatusBadge status={doc.status} kind="sale" />
            <span>{doc.contact ? contactLabel(doc.contact) : "Khách lẻ"}</span>
            <span className="text-ink-muted">· Người bán: {doc.createdBy.name}</span>
          </div>
          {doc.status === "cancelled" && doc.cancelledAt !== null && (
            <Alert tone="warn">
              Đã hủy lúc {formatDateTime(doc.cancelledAt)}
              {doc.cancelledBy ? ` bởi ${doc.cancelledBy.name}` : ""}.
            </Alert>
          )}
          <Table aria-label="Hàng trên hóa đơn" minWidth={480}>
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
                  <TD>
                    <div className="font-medium">{l.productName}</div>
                    <div className="text-[13px] text-ink-muted">{l.productCode}</div>
                  </TD>
                  <TD numeric className="whitespace-nowrap">
                    {formatQty(l.qty, l.unitName)}
                  </TD>
                  <TD numeric>{formatMoney(l.unitPrice)}</TD>
                  <TD numeric className="font-semibold">
                    {formatMoney(l.lineTotal)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="ml-auto flex w-full max-w-xs flex-col gap-1.5">
            <Row label="Tổng tiền hàng">{formatMoney(doc.subtotal)}</Row>
            {doc.discount > 0 && <Row label="Giảm giá">−{formatMoney(doc.discount)}</Row>}
            <Row label="Khách cần trả">{formatMoney(doc.total)}</Row>
            <Row label="Đã trả">
              {formatMoney(doc.paid)}
              {doc.paid > 0 && doc.paymentMethod && (
                <span className="font-normal text-ink-muted">
                  {" "}
                  · {PAYMENT_METHOD_LABEL[doc.paymentMethod]}
                </span>
              )}
            </Row>
            {doc.debtAmount > 0 && (
              <Row label="Ghi nợ">
                <span className="text-warn">{formatMoney(doc.debtAmount)}</span>
              </Row>
            )}
          </div>
          {doc.note && <p className="text-sm text-ink-body">Ghi chú: {doc.note}</p>}
        </div>
      ) : null}
    </Dialog>
  );
}
