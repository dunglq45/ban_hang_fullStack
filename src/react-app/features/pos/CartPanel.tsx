import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useContact, usePosProducts } from "../../api/pos";
import { Button, IconButton } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Dialog } from "../../components/ui/Dialog";
import { ChevronLeftIcon, CloseIcon, PlusIcon } from "../../components/ui/icons";
import { Kbd } from "../../components/ui/Kbd";
import { MoneyInput } from "../../components/ui/MoneyInput";
import { QtyStepper } from "../../components/ui/QtyStepper";
import { RadioCard } from "../../components/ui/RadioCard";
import { Select } from "../../components/ui/Select";
import { useToast } from "../../components/ui/toast-context";
import { cn } from "../../lib/cn";
import { formatMoney, formatQty } from "../../lib/format";
import {
  type Cart,
  type CartLine,
  lineTotal,
  quickAmounts,
  removeLine,
  setCustomer,
  setDiscount,
  setLinePrice,
  setLineQty,
  setLineUnit,
  setPaid,
  setPaymentMethod,
  stockWarnings,
  summarize,
} from "./cart";
import { CustomerPicker } from "./CustomerPicker";
import { blockIfInvalidField, hasInvalidField } from "./invalid-field";
import { usePos } from "./pos-context";
import { MAX_TABS } from "./pos-tabs";

/**
 * Hóa đơn đang mở: tab hóa đơn, khách, dòng hàng, thanh toán.
 * `panel`: cột phải trên máy tính; `page`: trang thanh toán trên điện thoại.
 */
export function CartPanel({
  variant,
  className,
}: {
  variant: "panel" | "page";
  className?: string;
}) {
  const { active, updateActive, locked } = usePos();
  useSyncCustomer(active, updateActive);

  return (
    <section
      aria-label="Hóa đơn hiện tại"
      className={cn(
        "flex min-w-0 flex-col bg-white",
        variant === "panel" && "rounded-card border border-line",
        className,
      )}
    >
      {variant === "panel" ? <InvoiceTabs /> : <PageHeader />}
      {/* Đang gửi: khóa mọi ô của đơn này để nội dung gửi đi và nội dung trên màn hình là một. */}
      <fieldset disabled={locked} aria-busy={locked} className="flex min-w-0 flex-col gap-4 p-4">
        <legend className="sr-only">Hóa đơn {active.number}</legend>
        {locked && (
          <p role="status" className="text-[13px] text-ink-muted">
            Đang gửi hóa đơn… Bấm + để mở hóa đơn mới cho khách tiếp theo.
          </p>
        )}
        <CustomerPicker
          customer={active.customer}
          onChange={(c) => updateActive((cart) => setCustomer(cart, c))}
        />
        <CartLines />
        {active.lines.length > 0 && <PaymentSection />}
      </fieldset>
      <CheckoutFooter variant={variant} />
    </section>
  );
}

/** Nợ của khách đang chọn có thể đã đổi (thu nợ, đơn khác): cập nhật lại từ server. */
function useSyncCustomer(cart: Cart, updateActive: (f: (c: Cart) => Cart) => void) {
  const customer = cart.customer;
  const { data } = useContact(customer?.id ?? null);
  useEffect(() => {
    if (!data || !customer || data.id !== customer.id) return;
    if (data.debt === customer.debt && data.debtLimit === customer.debtLimit) return;
    updateActive((c) =>
      c.customer?.id === data.id
        ? setCustomer(c, { ...c.customer, debt: data.debt, debtLimit: data.debtLimit })
        : c,
    );
  }, [data, customer, updateActive]);
}

function InvoiceTabs() {
  const { state, dispatch, active, locked } = usePos();
  const [confirmClose, setConfirmClose] = useState(false);

  function closeActive() {
    if (active.lines.length > 0) setConfirmClose(true);
    else dispatch({ type: "close", id: active.id });
  }

  return (
    <div className="flex items-end gap-0.5 rounded-t-card border-b border-line bg-table-head px-2 pt-2">
      <div
        role="group"
        aria-label="Các hóa đơn đang mở"
        className="flex min-w-0 items-end gap-0.5 overflow-x-auto"
      >
        {state.tabs.map((t) => {
          const selected = t.id === active.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={selected}
              onClick={() => dispatch({ type: "select", id: t.id })}
              className={cn(
                "h-touch shrink-0 rounded-t-small px-3.5 text-sm whitespace-nowrap focus-visible:outline-offset-[-2px]",
                selected
                  ? "-mb-px border border-line border-b-white bg-white font-semibold text-ink"
                  : "font-medium text-ink-muted hover:text-ink-body",
              )}
            >
              Hóa đơn {t.number}
              {t.lines.length > 0 && !selected && (
                <span className="ml-1 text-xs text-ink-muted">({t.lines.length})</span>
              )}
            </button>
          );
        })}
      </div>
      <IconButton
        label="Mở hóa đơn mới"
        disabled={state.tabs.length >= MAX_TABS}
        onClick={() => dispatch({ type: "new" })}
      >
        <PlusIcon size={18} />
      </IconButton>
      <IconButton
        label={`Hủy hóa đơn ${active.number}`}
        className="ml-auto"
        disabled={locked}
        onClick={closeActive}
      >
        <CloseIcon size={18} />
      </IconButton>
      <CloseCartDialog
        open={confirmClose}
        cart={active}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          dispatch({ type: "close", id: active.id });
        }}
      />
    </div>
  );
}

/** Đầu trang thanh toán trên điện thoại (design/ThanhToanMobile). */
function PageHeader() {
  const { active, dispatch } = usePos();
  const [confirmClose, setConfirmClose] = useState(false);
  return (
    <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
      <Link
        to="/ban-hang"
        aria-label="Quay lại chọn hàng"
        className="flex size-touch items-center justify-center rounded-control text-ink-body hover:bg-subtle"
      >
        <ChevronLeftIcon />
      </Link>
      <span className="flex-1 text-base font-semibold">Hóa đơn {active.number}</span>
      {active.lines.length > 0 && (
        <Button variant="ghost" className="text-danger" onClick={() => setConfirmClose(true)}>
          Xóa đơn
        </Button>
      )}
      <CloseCartDialog
        open={confirmClose}
        cart={active}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          dispatch({ type: "close", id: active.id });
        }}
      />
    </div>
  );
}

function CloseCartDialog({
  open,
  cart,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  cart: Cart;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={`Hủy hóa đơn ${cart.number}?`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Giữ lại
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Hủy hóa đơn
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-body">
        Đơn đang có {cart.lines.length} mặt hàng chưa thanh toán. Hủy thì các mặt hàng này bị bỏ
        khỏi đơn.
      </p>
    </Dialog>
  );
}

function CartLines() {
  const { active, updateActive } = usePos();
  const products = usePosProducts();
  const warnings = useMemo(() => {
    const byId = new Map((products.data ?? []).map((p) => [p.id, p]));
    return stockWarnings(active, (id) => byId.get(id));
  }, [active, products.data]);

  if (active.lines.length === 0) {
    return (
      <p className="rounded-control border border-dashed border-line-input px-4 py-8 text-center text-sm text-ink-muted">
        Chưa có hàng trong đơn. Quét mã vạch, gõ tên hàng hoặc bấm vào ô hàng để thêm.
      </p>
    );
  }

  return (
    <ul aria-label="Hàng trong đơn" className="flex flex-col">
      {active.lines.map((line) => (
        <CartLineRow
          key={line.key}
          line={line}
          error={active.lineErrors[line.productId]}
          warningStock={warnings.get(line.productId)}
          onQty={(qty) => updateActive((c) => setLineQty(c, line.key, qty))}
          onPrice={(price) => updateActive((c) => setLinePrice(c, line.key, price))}
          onUnit={(unit) => updateActive((c) => setLineUnit(c, line.key, unit))}
          onRemove={() => updateActive((c) => removeLine(c, line.key))}
        />
      ))}
    </ul>
  );
}

function CartLineRow({
  line,
  error,
  warningStock,
  onQty,
  onPrice,
  onUnit,
  onRemove,
}: {
  line: CartLine;
  error?: string;
  warningStock?: number;
  onQty: (qty: number) => void;
  onPrice: (price: number) => void;
  onUnit: (unit: string) => void;
  onRemove: () => void;
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-2 border-b border-subtle py-2.5 last:border-b-0",
        error && "-mx-2 rounded-control border-b-0 bg-danger/5 px-2",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 leading-snug">
          <div className="text-sm font-medium">{line.name}</div>
          <div className="text-xs text-ink-muted">{line.code}</div>
        </div>
        <div className="pt-0.5 text-sm font-semibold tabular-nums">
          {formatMoney(lineTotal(line))}
        </div>
        <IconButton label={`Xóa ${line.name}`} className="-mt-2 -mr-2" onClick={onRemove}>
          <CloseIcon size={16} />
        </IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <QtyStepper
          label={line.name}
          value={line.qty}
          min={1}
          onChange={onQty}
          className="w-[132px]"
        />
        {line.units.length > 1 ? (
          <Select
            aria-label={`Đơn vị ${line.name}`}
            value={line.unitName}
            onChange={(e) => onUnit(e.target.value)}
            className="w-28"
          >
            {line.units.map((u) => (
              <option key={u.name} value={u.name}>
                {u.name}
              </option>
            ))}
          </Select>
        ) : (
          <span className="px-1 text-sm text-ink-soft">{line.unitName}</span>
        )}
        <span className="text-sm text-ink-muted" aria-hidden="true">
          ×
        </span>
        <MoneyInput
          aria-label={`Đơn giá ${line.name}`}
          value={line.unitPrice}
          // Xóa trắng để gõ lại: giữ giá cũ (rời ô thì hiện lại), không thành 0.
          onChange={(v) => {
            if (v !== null) onPrice(v);
          }}
          frameClassName="w-32"
        />
      </div>
      {error ? (
        <p className="text-[13px] font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : warningStock !== undefined ? (
        <p className="text-[13px] text-warn">
          Tồn kho chỉ còn {formatQty(Math.max(warningStock, 0), line.baseUnit)}
        </p>
      ) : line.unitPrice === 0 ? (
        <p className="text-[13px] text-warn">Đơn giá đang là 0 đ</p>
      ) : null}
    </li>
  );
}

function PaymentSection() {
  const { active, updateActive } = usePos();
  const summary = summarize(active);
  const amounts = quickAmounts(summary.total);
  const customer = active.customer;
  const overLimit =
    customer?.debtLimit != null &&
    summary.debtAmount > 0 &&
    (summary.debtAfter ?? 0) > customer.debtLimit;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between">
        <span className="text-ink-soft">Tổng tiền hàng ({summary.itemCount} món)</span>
        <span className="tabular-nums">{formatMoney(summary.subtotal)}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="pos-discount" className="text-ink-soft">
          Giảm giá
        </label>
        <MoneyInput
          id="pos-discount"
          value={active.discount || null}
          onChange={(v) => updateActive((c) => setDiscount(c, v ?? 0))}
          max={summary.subtotal}
          placeholder="0"
          frameClassName="w-36"
        />
      </div>
      <div className="flex items-baseline justify-between border-t border-line pt-2">
        <span className="text-[15px] font-semibold">Khách cần trả</span>
        <span className="text-[22px] font-bold tabular-nums">{formatMoney(summary.total)}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="pos-paid" className="font-medium text-ink-body">
          Khách thanh toán
        </label>
        <MoneyInput
          id="pos-paid"
          value={active.paid}
          onChange={(v) => updateActive((c) => setPaid(c, v))}
          placeholder={formatMoney(summary.total)}
          aria-describedby="pos-paid-hint"
          frameClassName="w-40"
          className="text-base font-semibold"
        />
      </div>
      <p id="pos-paid-hint" className="sr-only">
        Để trống nghĩa là khách trả vừa đủ.
      </p>
      <div
        role="group"
        aria-label="Chọn nhanh số tiền khách đưa"
        className="grid grid-cols-4 gap-1.5"
      >
        <QuickButton
          pressed={active.paid === null}
          onClick={() => updateActive((c) => setPaid(c, null))}
        >
          Vừa đủ
        </QuickButton>
        {amounts.map((a) => (
          <QuickButton
            key={a}
            pressed={active.paid === a}
            onClick={() => updateActive((c) => setPaid(c, a))}
          >
            {formatMoney(a)}
          </QuickButton>
        ))}
      </div>

      {summary.change > 0 && (
        <div className="flex justify-between pt-1">
          <span className="font-semibold text-success">Tiền thừa trả khách</span>
          <span className="font-bold text-success tabular-nums">{formatMoney(summary.change)}</span>
        </div>
      )}
      {summary.debtAmount > 0 && (
        <>
          <div className="flex justify-between pt-1">
            <span className="font-semibold text-warn">Còn thiếu · ghi nợ</span>
            <span className="font-bold text-warn tabular-nums">
              {formatMoney(summary.debtAmount)}
            </span>
          </div>
          {customer ? (
            <div className="flex justify-between text-[13px]">
              <span className="text-ink-muted">Dư nợ của khách sau đơn này</span>
              <span
                className={cn(
                  "tabular-nums",
                  overLimit ? "font-semibold text-danger" : "text-ink-body",
                )}
              >
                {formatMoney(summary.debtAfter ?? 0)}
              </span>
            </div>
          ) : (
            <p className="text-[13px] text-danger">Khách lẻ phải trả đủ. Chọn khách để ghi nợ.</p>
          )}
          {overLimit && (
            <p className="text-[13px] text-danger">
              Vượt hạn mức nợ {formatMoney(customer?.debtLimit ?? 0)} của khách.
            </p>
          )}
        </>
      )}

      {summary.paid > 0 && (
        <fieldset className="mt-1 flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] font-medium text-ink-body">
            Hình thức thanh toán
          </legend>
          <div className="flex gap-2">
            <RadioCard
              name="pos-payment-method"
              label="Tiền mặt"
              checked={active.paymentMethod === "cash"}
              onChange={() => updateActive((c) => setPaymentMethod(c, "cash"))}
            />
            <RadioCard
              name="pos-payment-method"
              label="Chuyển khoản"
              checked={active.paymentMethod === "transfer"}
              onChange={() => updateActive((c) => setPaymentMethod(c, "transfer"))}
            />
          </div>
        </fieldset>
      )}
    </div>
  );
}

function QuickButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-touch rounded-small border px-1 text-[13px] tabular-nums",
        pressed
          ? "border-primary bg-primary-soft font-semibold text-primary"
          : "border-line-input bg-white font-medium text-ink-body hover:bg-table-head",
      )}
    >
      {children}
    </button>
  );
}

function CheckoutFooter({ variant }: { variant: "panel" | "page" }) {
  const { active, state, dispatch, checkout } = usePos();
  const toast = useToast();
  const empty = active.lines.length === 0;

  return (
    <div
      className={cn(
        "mt-auto flex flex-wrap items-center gap-2.5 border-t border-line bg-table-head px-4 py-3.5",
        variant === "panel" ? "rounded-b-card" : "sticky z-20",
      )}
      // Trang điện thoại: nút hoàn tất luôn thấy được, nằm ngay trên thanh tab dưới.
      style={
        variant === "page"
          ? { bottom: "calc(69px + max(0px, env(safe-area-inset-bottom) - 10px))" }
          : undefined
      }
    >
      <Checkbox
        label="In hóa đơn"
        checked={checkout.print}
        onChange={(e) => checkout.setPrint(e.target.checked)}
        className="mr-auto"
      />
      {variant === "panel" && (
        <Button
          variant="secondary"
          size="lg"
          disabled={empty || state.tabs.length >= MAX_TABS}
          onClick={() => {
            dispatch({ type: "new" });
            toast({ tone: "info", message: `Đã lưu tạm Hóa đơn ${active.number}` });
          }}
        >
          Lưu tạm
        </Button>
      )}
      <Button
        size="lg"
        disabled={empty}
        loading={checkout.isPending}
        // Kiểm tra trước khi ô đang gõ mất focus (rời ô sẽ hiện lại số cũ và xóa báo lỗi).
        onMouseDown={(e) => {
          if (hasInvalidField()) e.preventDefault(); // giữ focus ở ô lỗi; click bên dưới sẽ báo
        }}
        onClick={() => {
          if (!blockIfInvalidField(toast)) checkout.submit();
        }}
        className={variant === "page" ? "w-full" : undefined}
      >
        {variant === "page" ? "Hoàn tất bán hàng" : "Thanh toán"}
        {variant === "panel" && <Kbd inverted>F9</Kbd>}
      </Button>
    </div>
  );
}
