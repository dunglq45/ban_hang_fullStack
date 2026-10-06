import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";

export type BadgeTone = "neutral" | "primary" | "warn" | "danger" | "success";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-subtle text-ink-body",
  primary: "bg-primary-soft text-primary",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  success: "bg-success/10 text-success",
};

/** Nhãn nhỏ dạng viên thuốc: trạng thái chứng từ, vai trò... */
export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 text-xs leading-5 font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Badge số đếm cạnh tab, mục menu. */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  return <Badge className={className}>{formatNumber(count)}</Badge>;
}
