import { useId, useRef, useState } from "react";
import { uuidv7 } from "../../../shared/uuid";
import { type ContactDetail, useContactDetail, useCreatePayment } from "../../api/debts";
import { ApiError, errorMessage } from "../../api/errors";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { MoneyInput } from "../../components/ui/MoneyInput";
import { RadioCard } from "../../components/ui/RadioCard";
import { useToast } from "../../components/ui/toast-context";
import { cn } from "../../lib/cn";
import { contactLabel, formatDate, formatMoney } from "../../lib/format";
import { DEBT_TEXT, debtQuickAmounts } from "./debt-utils";

const PRINT_KEY = "debt:print";

function loadPrint() {
  try {
    return localStorage.getItem(PRINT_KEY) === "1";
  } catch {
    return false;
  }
}

function savePrint(value: boolean) {
  try {
    localStorage.setItem(PRINT_KEY, value ? "1" : "0");
  } catch {
    // Không lưu được lựa chọn: lần sau mặc định không in.
  }
}

/**
 * Key của lần gửi bị lỗi mạng (server có thể đã ghi phiếu), theo đối tác. Đóng rồi mở lại hộp thoại
 * vẫn dùng lại key này để không thu hai lần; xóa khi server trả lời (thành công hoặc lỗi nghiệp vụ).
 */
const unsureKeys = new Map<string, string>();

export interface PaymentDialogProps {
  contact: ContactDetail;
  onClose: () => void;
}

/**
 * Hộp thoại thu nợ khách (phiếu thu) / trả nợ nhà cung cấp (phiếu chi). Chỉ gắn vào cây khi mở,
 * nên idempotencyKey sinh mới mỗi lần mở (trừ khi lần trước lỗi mạng) và giữ nguyên khi gửi lại.
 */
export function PaymentDialog({ contact: initial, onClose }: PaymentDialogProps) {
  const kind = initial.type;
  const text = DEBT_TEXT[kind];
  // Nợ mới nhất (vừa bán thêm, người khác vừa thu...) từ cache chi tiết, cập nhật khi refetch.
  const detail = useContactDetail(initial.id);
  const contact = detail.data ?? initial;
  const debt = contact.debt;

  const [idempotencyKey, setIdempotencyKey] = useState(
    () => unsureKeys.get(initial.id) ?? uuidv7(),
  );
  const [openedAt] = useState(Date.now);
  const [amount, setAmount] = useState<number | null>(Math.max(0, initial.debt));
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [note, setNote] = useState("");
  const [print, setPrint] = useState(loadPrint);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const formId = useId();
  const createPayment = useCreatePayment();
  const toast = useToast();

  const amountError =
    amount === null || amount <= 0
      ? `Vui lòng nhập ${text.amountLabel.toLowerCase()}`
      : amount > debt
        ? `Số tiền lớn hơn số nợ hiện tại (${formatMoney(Math.max(0, debt))})`
        : null;
  const after = debt - (amount ?? 0);
  const quick = debtQuickAmounts(debt);

  function submit() {
    setTouched(true);
    if (amountError || amount === null || submittingRef.current) return;
    submittingRef.current = true;
    setServerError(null);
    // Mở cửa sổ in ngay trong thao tác bấm (trình duyệt chặn popup mở sau await).
    const printWindow = print ? window.open("", "_blank") : null;
    createPayment.mutate(
      {
        idempotencyKey,
        type: kind === "customer" ? "receipt" : "disbursement",
        contactId: contact.id,
        amount,
        method,
        note: note.trim() || null,
      },
      {
        onSuccess: ({ payment, replayed }) => {
          unsureKeys.delete(contact.id);
          if (printWindow) {
            printWindow.location.href = `/in/${payment.type === "disbursement" ? "phieu-chi" : "phieu-thu"}/${payment.id}`;
          }
          toast(
            replayed
              ? { tone: "info", message: `Phiếu ${payment.code} đã được lưu trước đó` }
              : `${text.done} ${formatMoney(payment.amount)} · ${contact.name} (${payment.code})`,
          );
          onClose();
        },
        onError: (err) => {
          printWindow?.close();
          if (err instanceof ApiError && err.code === "NETWORK_ERROR") {
            unsureKeys.set(contact.id, idempotencyKey);
            setServerError(
              `${errorMessage(err)} Phiếu có thể đã được lưu: bấm xác nhận lại, hệ thống sẽ không ghi hai lần.`,
            );
            return;
          }
          unsureKeys.delete(contact.id);
          if (err instanceof ApiError && err.code === "AMOUNT_EXCEEDS_DEBT") void detail.refetch();
          // Key đã thuộc chứng từ khác (lỗi phía client): đổi key để gửi lại được.
          if (err instanceof ApiError && err.code === "IDEMPOTENCY_CONFLICT") {
            setIdempotencyKey(uuidv7());
          }
          setServerError(errorMessage(err));
        },
        onSettled: () => {
          submittingRef.current = false;
        },
      },
    );
  }

  const pending = createPayment.isPending;

  return (
    <Dialog
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title={text.pay}
      description={contactLabel(contact)}
      closeOnOverlayClick={!pending}
      footer={
        <>
          <Checkbox
            className="mr-auto"
            label={text.print}
            checked={print}
            onChange={(e) => {
              setPrint(e.target.checked);
              savePrint(e.target.checked);
            }}
          />
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Hủy
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            {text.confirm} {amount ? formatMoney(amount) : ""}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <fieldset disabled={pending} className="contents">
          <div className="flex items-baseline justify-between rounded-control border border-line bg-table-head px-3.5 py-3">
            <span className="text-sm text-ink-body">Dư nợ hiện tại</span>
            <span className="text-xl font-bold text-warn tabular-nums">{formatMoney(debt)}</span>
          </div>

          <div className="flex flex-col gap-2">
            <Field
              label={text.amountLabel}
              required
              error={touched ? (amountError ?? undefined) : undefined}
            >
              <MoneyInput
                value={amount}
                onChange={(v) => {
                  setAmount(v);
                  setServerError(null);
                }}
                onBlur={() => setTouched(true)}
                data-autofocus
                frameClassName="h-[52px]"
                className="text-right text-[22px] font-bold"
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {[debt, ...quick].map((value, i) => {
                const selected = amount === value;
                return (
                  <button
                    key={i === 0 ? "all" : value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setAmount(value);
                      setServerError(null);
                    }}
                    className={cn(
                      "h-10 rounded-small border px-3 text-[13px] tabular-nums",
                      selected
                        ? "border-primary bg-primary-soft font-semibold text-primary"
                        : "border-line-input bg-white font-medium text-ink-body hover:bg-table-head",
                    )}
                  >
                    {i === 0 ? text.payAll : formatMoney(value)}
                  </button>
                );
              })}
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[13px] font-medium text-ink-body">Hình thức</legend>
            <div className="flex gap-2">
              <RadioCard
                name="payment-method"
                label="Tiền mặt"
                checked={method === "cash"}
                onChange={() => setMethod("cash")}
              />
              <RadioCard
                name="payment-method"
                label="Chuyển khoản"
                checked={method === "transfer"}
                onChange={() => setMethod("transfer")}
              />
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            {/* API ghi thời điểm và sinh mã khi lưu: hai ô chỉ để xem. */}
            <Field label={text.dateLabel}>
              <Input value={formatDate(openedAt)} readOnly disabled />
            </Field>
            <Field label={text.receiptCode}>
              <Input value="" placeholder="Tự sinh khi lưu" readOnly disabled />
            </Field>
          </div>
          <Field label="Ghi chú">
            <Input
              value={note}
              maxLength={500}
              placeholder={text.notePlaceholder}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          {serverError && <Alert tone="error">{serverError}</Alert>}

          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-sm text-ink-body">{text.after}</span>
            {after === 0 ? (
              <span className="text-base font-bold text-success tabular-nums">0 · Hết nợ</span>
            ) : (
              <span
                className={cn(
                  "text-base font-bold tabular-nums",
                  after < 0 ? "text-danger" : "text-warn",
                )}
              >
                {formatMoney(after)}
              </span>
            )}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
