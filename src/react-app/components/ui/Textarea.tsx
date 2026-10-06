import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";
import { useFieldControl } from "./field-context";

export function Textarea({ className, rows = 3, ...props }: ComponentProps<"textarea">) {
  const control = useFieldControl(props);
  return (
    <textarea
      rows={rows}
      {...control}
      className={cn(
        "min-h-touch w-full rounded-control border border-line-input bg-white px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-muted",
        "focus:border-primary focus:ring-[3px] focus:ring-primary/20 focus:outline-none",
        "aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-table-head",
        className,
      )}
    />
  );
}
