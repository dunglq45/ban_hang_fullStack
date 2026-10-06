import { useState } from "react";
import { MILLI } from "../../../shared/qty";
import { MAX_QTY_MILLI } from "../../../shared/schemas/common";
import { cn } from "../../lib/cn";
import { MinusIcon, PlusIcon } from "./icons";
import { QtyInput } from "./QtyInput";

export interface QtyStepperProps {
  /** Số lượng (milli). */
  value: number;
  onChange: (milli: number) => void;
  /** Tên mặt hàng, dùng cho nhãn đọc màn hình: "Bớt 1 Mì gói", "Số lượng Mì gói". */
  label: string;
  /** Bước +/− (milli), mặc định 1 đơn vị. */
  step?: number;
  min?: number;
  max?: number;
  className?: string;
}

/**
 * Ô số lượng có nút −/+; ô giữa gõ được số lẻ (1,5). Gõ số nhỏ hơn `min` hoặc chưa hợp lệ thì ô
 * báo đỏ và giá trị chưa đổi; rời ô thì hiện lại số đang giữ. Trang dùng ô này nên đưa focus ra
 * khỏi ô trước khi chốt (thanh toán bằng phím tắt) để người dùng thấy đúng số được tính.
 */
export function QtyStepper({
  value,
  onChange,
  label,
  step = MILLI,
  min = 0,
  max = MAX_QTY_MILLI,
  className,
}: QtyStepperProps) {
  const [invalid, setInvalid] = useState(false);
  const set = (v: number) => {
    setInvalid(false);
    onChange(Math.min(max, Math.max(min, v)));
  };
  const buttonClass =
    "flex h-full w-11 shrink-0 items-center justify-center text-ink-body hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-offset-[-2px]";

  return (
    <div
      className={cn(
        "flex h-touch items-stretch overflow-hidden rounded-small border border-line-input bg-white focus-within:border-primary",
        "has-[[aria-invalid=true]]:border-danger",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Bớt 1 ${label}`}
        className={buttonClass}
        disabled={value - step < min}
        onClick={() => set(value - step)}
      >
        <MinusIcon size={16} />
      </button>
      <QtyInput
        variant="bare"
        aria-label={`Số lượng ${label}`}
        value={value}
        max={max}
        onChange={(v) => {
          const ok = v !== null && v >= min;
          setInvalid(!ok);
          if (ok) onChange(v);
        }}
        onBlur={() => setInvalid(false)}
        aria-invalid={invalid || undefined}
        frameClassName="min-w-0 flex-1 border-x border-line"
        className="text-center text-sm font-semibold"
      />
      <button
        type="button"
        aria-label={`Thêm 1 ${label}`}
        className={buttonClass}
        disabled={value + step > max}
        onClick={() => set(value + step)}
      >
        <PlusIcon size={16} />
      </button>
    </div>
  );
}
