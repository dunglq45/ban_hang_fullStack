import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface KpiItem {
  label: string;
  value: ReactNode;
  /** Dòng phụ dưới số liệu ("42 đơn · TB 77.262 / đơn"). */
  hint?: ReactNode;
  /** Màu số liệu: nợ (warn), tăng (success)... */
  tone?: "default" | "warn" | "danger" | "success";
}

const toneClass = {
  default: "text-ink",
  warn: "text-warn",
  danger: "text-danger",
  success: "text-success",
};

/** Dải ô số liệu tổng quan, các ô ngăn nhau bằng vạch 1px. */
export function KpiStrip({ items, className }: { items: KpiItem[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-px overflow-hidden rounded-card border border-line bg-line",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5 bg-white px-5 py-4">
          <dt className="text-[13px] text-ink-muted">{item.label}</dt>
          <dd
            className={cn("text-2xl font-semibold tabular-nums", toneClass[item.tone ?? "default"])}
          >
            {item.value}
          </dd>
          {item.hint && <dd className="text-[13px] text-ink-muted">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
