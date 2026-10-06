import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";
import { useFieldControl } from "./field-context";
import { ChevronDownIcon } from "./icons";

/** Ô chọn dùng <select> gốc (bàn phím, điện thoại đều tốt), kiểu dáng theo thiết kế. */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  const control = useFieldControl(props);
  return (
    <div className={cn("relative min-w-0", className)}>
      <select
        {...control}
        className={cn(
          "h-touch w-full appearance-none rounded-control border border-line-input bg-white pr-10 pl-3 text-[15px] text-ink",
          "focus:border-primary focus:ring-[3px] focus:ring-primary/20 focus:outline-none",
          "aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-table-head",
        )}
      >
        {children}
      </select>
      <ChevronDownIcon
        size={16}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
}
