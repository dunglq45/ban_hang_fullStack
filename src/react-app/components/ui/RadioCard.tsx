import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface RadioCardProps extends Omit<ComponentProps<"input">, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

/**
 * Lựa chọn dạng thẻ (Tiền mặt / Chuyển khoản...). Đặt các RadioCard cùng `name` trong một
 * <fieldset> có <legend> để trình đọc màn hình đọc được câu hỏi.
 */
export function RadioCard({ label, description, className, ...props }: RadioCardProps) {
  return (
    <label
      className={cn(
        "flex min-h-12 flex-1 cursor-pointer items-center gap-2.5 rounded-control border border-line-input bg-white px-3 py-2 text-sm font-medium text-ink",
        "has-checked:border-primary has-checked:bg-primary-soft has-checked:font-semibold has-checked:text-primary",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary",
        "has-disabled:cursor-not-allowed has-disabled:opacity-50",
        className,
      )}
    >
      <input
        type="radio"
        className="m-0 size-[18px] shrink-0 accent-primary focus-visible:outline-none"
        {...props}
      />
      <span className="flex min-w-0 flex-col leading-snug">
        {label}
        {description && (
          <span className="text-[13px] font-normal text-ink-muted">{description}</span>
        )}
      </span>
    </label>
  );
}
