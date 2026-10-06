import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { InboxIcon } from "./icons";

/** Trạng thái trống: chưa có dữ liệu, không tìm thấy kết quả... kèm hướng dẫn và nút hành động. */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-subtle text-ink-muted">
        {icon ?? <InboxIcon size={24} />}
      </span>
      <p className="text-base font-semibold text-ink">{title}</p>
      {description && <div className="max-w-md text-sm text-ink-muted">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
