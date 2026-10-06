import { cn } from "../../lib/cn";

export interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  /** Mô tả nhóm lựa chọn cho trình đọc màn hình. */
  label: string;
  className?: string;
}

/** Nhóm nút chọn một (Hôm nay / 7 ngày / Tháng này...). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full overflow-x-auto rounded-control border border-line-input bg-white",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-touch shrink-0 border-l border-line-input px-4 text-sm whitespace-nowrap first:border-l-0 focus-visible:outline-offset-[-2px]",
              selected
                ? "bg-subtle font-semibold text-ink"
                : "font-medium text-ink-soft hover:bg-table-head",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
