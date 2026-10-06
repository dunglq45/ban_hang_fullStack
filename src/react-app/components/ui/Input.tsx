import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { useFieldControl } from "./field-context";

/** Khung ô nhập: viền, bo góc, cao 44px; viền xanh khi focus, đỏ khi lỗi. */
const frameClass = cn(
  "flex h-touch w-full min-w-0 items-center gap-2 rounded-control border border-line-input bg-white px-3",
  "focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20",
  "has-[[aria-invalid=true]]:border-danger has-[[aria-invalid=true]]:focus-within:ring-danger/20",
  "has-disabled:bg-table-head has-disabled:text-ink-muted",
);

/** Thẻ <input> bên trong khung: không viền, không outline (khung đã thể hiện focus). */
const inputClass =
  "h-full w-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted disabled:cursor-not-allowed";

export interface InputProps extends ComponentProps<"input"> {
  /** Nội dung trước ô nhập (icon tìm kiếm...). */
  leading?: ReactNode;
  /** Nội dung sau ô nhập (nút "Hiện", đơn vị tính, phím tắt...). */
  trailing?: ReactNode;
  /** Class cho khung ngoài; `className` áp vào thẻ <input>. */
  frameClassName?: string;
  /** "bare": không viền/khung, dùng khi ô nằm trong một khung khác (QtyStepper). */
  variant?: "default" | "bare";
}

export function Input({
  leading,
  trailing,
  frameClassName,
  variant = "default",
  className,
  ...props
}: InputProps) {
  const control = useFieldControl(props);
  return (
    <div
      className={cn(
        variant === "bare" ? "flex h-full min-w-0 items-center" : frameClass,
        trailing && variant !== "bare" ? "pr-1" : undefined,
        frameClassName,
      )}
    >
      {leading && <span className="flex shrink-0 text-ink-muted">{leading}</span>}
      <input {...control} className={cn(inputClass, className)} />
      {trailing}
    </div>
  );
}
