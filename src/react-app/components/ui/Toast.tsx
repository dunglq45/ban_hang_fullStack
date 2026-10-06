import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { AlertIcon, CheckIcon, CloseIcon } from "./icons";
import { type ShowToast, ToastContext, type ToastOptions, type ToastTone } from "./toast-context";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  duration: number;
}

const MAX_VISIBLE = 3;

const toneStyles: Record<ToastTone, { icon: ReactNode; className: string }> = {
  success: { icon: <CheckIcon size={18} />, className: "text-success-dot" },
  error: { icon: <AlertIcon size={18} />, className: "text-danger-dot" },
  info: { icon: <AlertIcon size={18} />, className: "text-[#84ADFF]" },
};

/** Cung cấp `useToast()` và vùng hiển thị thông báo (đọc được bằng trình đọc màn hình). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ShowToast>((input) => {
    const opts: ToastOptions = typeof input === "string" ? { message: input } : input;
    const tone = opts.tone ?? "success";
    const item: ToastItem = {
      id: nextId.current++,
      message: opts.message,
      tone,
      duration: opts.duration ?? (tone === "error" ? 6000 : 4000),
    };
    setItems((list) => [...list, item].slice(-MAX_VISIBLE));
  }, []);

  return (
    <ToastContext value={show}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:right-6 md:bottom-6 md:left-auto md:items-end"
          role="region"
          aria-label="Thông báo"
        >
          {/* Hai vùng live: lỗi đọc ngay (assertive), thông báo thường đọc khi rảnh (polite). */}
          <div aria-live="assertive" className="flex flex-col items-center gap-2 md:items-end">
            {items
              .filter((t) => t.tone === "error")
              .map((t) => (
                <ToastCard key={t.id} item={t} onDismiss={dismiss} />
              ))}
          </div>
          <div aria-live="polite" className="flex flex-col items-center gap-2 md:items-end">
            {items
              .filter((t) => t.tone !== "error")
              .map((t) => (
                <ToastCard key={t.id} item={t} onDismiss={dismiss} />
              ))}
          </div>
        </div>,
        document.body,
      )}
    </ToastContext>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [paused, item.id, item.duration, onDismiss]);

  const tone = toneStyles[item.tone];
  return (
    <div
      className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card bg-ink py-2 pr-2 pl-4 text-sm text-white shadow-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={cn("mt-2.5 shrink-0", tone.className)}>{tone.icon}</span>
      <p className="min-w-0 flex-1 py-2.5 leading-snug">{item.message}</p>
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={() => onDismiss(item.id)}
        className="flex size-touch shrink-0 items-center justify-center rounded-control text-[#D0D5DD] hover:bg-white/10"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
