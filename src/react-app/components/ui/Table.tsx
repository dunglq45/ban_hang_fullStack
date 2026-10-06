import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

/**
 * Bảng dữ liệu. Khung ngoài tự cuộn ngang khi màn hình hẹp (trang không bị cuộn ngang),
 * `minWidth` đặt độ rộng tối thiểu của bảng. Cần `aria-label` hoặc <caption> mô tả bảng.
 */
export function Table({
  minWidth,
  className,
  children,
  ...props
}: ComponentProps<"table"> & { minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        style={minWidth ? { minWidth } : undefined}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("bg-table-head", className)} {...props} />;
}

export function TBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-subtle last:border-b-0", className)} {...props} />;
}

interface CellProps {
  /** Cột số: chữ số đều nhau, căn phải. */
  numeric?: boolean;
}

export function TH({
  numeric,
  className,
  scope = "col",
  ...props
}: ComponentProps<"th"> & CellProps) {
  return (
    <th
      scope={scope}
      className={cn(
        "h-touch border-b border-line px-4 text-left text-[13px] font-semibold whitespace-nowrap text-ink-soft",
        numeric && "num",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ numeric, className, ...props }: ComponentProps<"td"> & CellProps) {
  return <td className={cn("h-14 px-4 py-2 text-ink", numeric && "num", className)} {...props} />;
}
