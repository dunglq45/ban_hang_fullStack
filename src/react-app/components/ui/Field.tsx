import { type ReactNode, useId } from "react";
import { cn } from "../../lib/cn";
import { FieldContext } from "./field-context";

export interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  /** Câu gợi ý dưới ô nhập. */
  hint?: ReactNode;
  /** Lỗi của ô nhập; có lỗi thì ô viền đỏ và trình đọc màn hình đọc kèm. */
  error?: string;
  required?: boolean;
  id?: string;
  className?: string;
}

/** Nhãn + ô nhập + gợi ý + lỗi. Ô nhập bên trong (Input, MoneyInput, Select...) tự nối id và aria. */
export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  id,
  className,
}: FieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext value={{ id: controlId, describedBy, invalid: Boolean(error), required }}>
      <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
        <label htmlFor={controlId} className="text-[13px] font-medium text-ink-body">
          {label}
          {required && (
            <span className="text-danger" aria-hidden="true">
              {" *"}
            </span>
          )}
        </label>
        {children}
        {hint && (
          <p id={hintId} className="text-[13px] text-ink-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </FieldContext>
  );
}
