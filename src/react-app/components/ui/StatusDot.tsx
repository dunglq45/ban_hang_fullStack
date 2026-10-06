import { cn } from "../../lib/cn";

export type StockStatus = "ok" | "low" | "out" | "inactive";

const styles: Record<StockStatus, { dot: string; text: string; label: string }> = {
  ok: { dot: "bg-success-dot", text: "text-ink-body", label: "Đang bán" },
  low: { dot: "bg-warn-dot", text: "font-semibold text-warn", label: "Sắp hết" },
  out: { dot: "bg-danger-dot", text: "font-semibold text-danger", label: "Hết hàng" },
  inactive: { dot: "bg-line-input", text: "text-ink-muted", label: "Ngừng bán" },
};

/** Chấm màu + chữ trạng thái tồn kho. Màu luôn đi kèm chữ (không chỉ dựa vào màu). */
export function StatusDot({
  status,
  label,
  className,
}: {
  status: StockStatus;
  /** Ghi đè chữ mặc định ("Đang bán", "Sắp hết", "Hết hàng", "Ngừng bán"). */
  label?: string;
  className?: string;
}) {
  const s = styles[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px]", s.text, className)}>
      <span className={cn("size-2 shrink-0 rounded-full", s.dot)} aria-hidden="true" />
      {label ?? s.label}
    </span>
  );
}
