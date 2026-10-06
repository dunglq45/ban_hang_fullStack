import { type KeyboardEvent, useRef } from "react";
import { cn } from "../../lib/cn";
import { CountBadge } from "./Badge";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Số đếm hiển thị trong badge cạnh nhãn. */
  count?: number;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Mô tả nhóm tab cho trình đọc màn hình. */
  label: string;
  className?: string;
}

/** Tab gạch chân (lọc danh sách...). Mũi tên trái/phải, Home/End để chuyển tab. */
export function Tabs<T extends string>({ items, value, onChange, label, className }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const n = items.length;
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % n,
      ArrowLeft: (index - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    const next = targets[e.key];
    if (next === undefined) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next]!.value);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("flex gap-6 overflow-x-auto border-b border-line px-4", className)}
    >
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={cn(
              "-mb-px flex h-12 shrink-0 items-center gap-2 border-b-2 px-0.5 text-sm whitespace-nowrap focus-visible:outline-offset-[-2px]",
              selected
                ? "border-primary font-semibold text-ink"
                : "border-transparent font-medium text-ink-muted hover:text-ink-body",
            )}
          >
            {item.label}
            {item.count !== undefined && <CountBadge count={item.count} />}
          </button>
        );
      })}
    </div>
  );
}
