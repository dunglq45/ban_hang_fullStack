import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import { buttonClass } from "./button-class";
import { pageList } from "./page-list";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  /** Tên loại dòng trong câu "Hiển thị 1–20 trong 126 mặt hàng". */
  itemLabel?: string;
  className?: string;
}

/** Phân trang: "Hiển thị 1–20 trong 126 …" + Trước / số trang / Sau. */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  itemLabel = "dòng",
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label="Phân trang"
      className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-3", className)}
    >
      <span className="text-sm text-ink-muted">
        Hiển thị {formatNumber(from)}–{formatNumber(to)} trong {formatNumber(total)} {itemLabel}
      </span>
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className={buttonClass({ variant: "secondary", className: "font-medium" })}
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            Trước
          </button>
          {pageList(page, totalPages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1.5 text-ink-muted" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-label={`Trang ${p}`}
                aria-current={p === page ? "page" : undefined}
                onClick={() => onChange(p)}
                className={cn(
                  "size-touch rounded-control border text-sm tabular-nums",
                  p === page
                    ? "border-primary bg-primary-soft font-semibold text-primary"
                    : "border-transparent text-ink-body hover:bg-subtle",
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            className={buttonClass({ variant: "secondary", className: "font-medium" })}
            disabled={page >= totalPages}
            onClick={() => onChange(page + 1)}
          >
            Sau
          </button>
        </div>
      )}
    </nav>
  );
}
