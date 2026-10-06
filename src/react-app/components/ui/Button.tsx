import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { type ButtonSize, type ButtonVariant, buttonClass } from "./button-class";
import { Spinner } from "./Spinner";

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Đang xử lý: hiện vòng xoay, khóa nút, giữ nguyên chữ để nút không đổi kích thước. */
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant,
  size,
  loading = false,
  icon,
  fullWidth,
  className,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

/** Nút chỉ có icon: bắt buộc `label` (aria-label), vùng bấm 44×44. */
export function IconButton({
  label,
  variant = "ghost",
  className,
  children,
  type = "button",
  ...props
}: ComponentProps<"button"> & { label: string; variant?: "ghost" | "secondary" }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-touch shrink-0 items-center justify-center rounded-control border text-ink-muted",
        "transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50",
        variant === "secondary"
          ? "border-line bg-white text-ink-body hover:bg-table-head"
          : "border-transparent bg-transparent hover:bg-subtle hover:text-ink-body",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
