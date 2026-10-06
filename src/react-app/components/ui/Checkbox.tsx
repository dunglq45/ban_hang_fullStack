import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "../../lib/cn";

export interface CheckboxProps extends Omit<ComponentProps<"input">, "type"> {
  label: ReactNode;
}

/** Ô đánh dấu kèm nhãn; cả dòng cao 44px, bấm vào nhãn cũng được. */
export function Checkbox({ label, className, id, ...props }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn("inline-flex min-h-touch items-center", className)}>
      <input
        id={inputId}
        type="checkbox"
        className="size-[18px] shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
        {...props}
      />
      <label
        htmlFor={inputId}
        className="flex min-h-touch cursor-pointer items-center pl-2 text-sm text-ink-body"
      >
        {label}
      </label>
    </div>
  );
}
