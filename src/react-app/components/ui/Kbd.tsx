import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/** Phím tắt (F3, F9...). `inverted` dùng trên nút nền màu. */
export function Kbd({
  children,
  inverted = false,
  className,
}: {
  children: ReactNode;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "rounded border px-1.5 font-sans text-xs font-medium",
        inverted ? "border-white/45 text-white" : "border-line bg-table-head text-ink-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
