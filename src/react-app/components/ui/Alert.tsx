import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { AlertIcon } from "./icons";

/** Hộp thông báo trong trang/form. Tone "error" có role="alert" để trình đọc màn hình đọc ngay. */
export function Alert({
  tone = "error",
  children,
  className,
}: {
  tone?: "error" | "warn" | "info";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-control border px-3.5 py-3 text-sm",
        tone === "error" && "border-danger/30 bg-danger/5 text-danger",
        tone === "warn" && "border-warn/30 bg-warn/5 text-warn",
        tone === "info" && "border-primary/20 bg-primary-soft text-primary",
        className,
      )}
    >
      <AlertIcon size={18} className="mt-px shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
