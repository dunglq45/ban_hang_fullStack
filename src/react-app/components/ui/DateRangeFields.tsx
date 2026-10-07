import { cn } from "../../lib/cn";
import { Field } from "./Field";
import { Input } from "./Input";

/** Hai ô "Từ ngày" – "Đến ngày" (YYYY-MM-DD); lỗi khoảng ngày hiện dưới ô "Đến ngày". */
export function DateRangeFields({
  from,
  to,
  onChange,
  error,
  className,
}: {
  from: string;
  to: string;
  onChange: (patch: { from?: string; to?: string }) => void;
  error?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start gap-3", className)}>
      <Field label="Từ ngày" className="w-full min-[400px]:w-44">
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onChange({ from: e.target.value })}
        />
      </Field>
      <Field label="Đến ngày" error={error ?? undefined} className="w-full min-[400px]:w-44">
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onChange({ to: e.target.value })}
        />
      </Field>
    </div>
  );
}
