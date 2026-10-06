import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { IconButton } from "./Button";
import { CloseIcon } from "./icons";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(el: HTMLElement) {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (node) => !node.closest("[inert]"),
  );
}

// Số hộp thoại đang mở: khóa cuộn trang và làm trơ (inert) phần app phía sau khi còn ít nhất một.
let openCount = 0;

function lockBackground() {
  openCount++;
  if (openCount === 1) {
    document.body.style.overflow = "hidden";
    document.getElementById("root")?.setAttribute("inert", "");
  }
  return () => {
    openCount--;
    if (openCount === 0) {
      document.body.style.overflow = "";
      document.getElementById("root")?.removeAttribute("inert");
    }
  };
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Dòng phụ dưới tiêu đề (tên khách, mã chứng từ...). */
  description?: ReactNode;
  children?: ReactNode;
  /** Vùng nút cuối hộp thoại. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Ô nhận focus khi mở; mặc định là phần tử bấm được đầu tiên trong nội dung. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Bấm ra ngoài thì đóng (mặc định có). Tắt cho hộp thoại có form dài. */
  closeOnOverlayClick?: boolean;
}

const sizes = { sm: "max-w-[400px]", md: "max-w-[520px]", lg: "max-w-[720px]" };

/**
 * Hộp thoại modal: aria-modal, giữ focus bên trong (Tab vòng lại), Esc để đóng,
 * trả focus về nút đã mở khi đóng.
 */
export function Dialog(props: DialogProps) {
  if (!props.open) return null;
  return createPortal(<DialogPanel {...props} />, document.body);
}

function DialogPanel({
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  initialFocusRef,
  closeOnOverlayClick = true,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const unlock = lockBackground();
    const panel = panelRef.current!;
    const target =
      initialFocusRef?.current ??
      panel.querySelector<HTMLElement>("[data-autofocus]") ??
      (bodyRef.current && focusableIn(bodyRef.current)[0]) ??
      panel;
    target.focus();
    return () => {
      unlock();
      previous?.focus?.();
    };
    // Chỉ chạy khi mở/đóng; initialFocusRef là ref ổn định.
  }, [initialFocusRef]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = focusableIn(panelRef.current!);
    if (nodes.length === 0) {
      e.preventDefault();
      return;
    }
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) onCloseRef.current();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "flex max-h-[calc(100dvh-1rem)] w-full flex-col rounded-t-xl bg-white shadow-[0_20px_40px_rgba(16,24,40,0.18)] outline-none sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl",
          sizes[size],
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 pt-[18px] pb-3.5">
          <div className="min-w-0 leading-snug">
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="text-[13px] text-ink-muted">
                {description}
              </div>
            )}
          </div>
          <IconButton label="Đóng" onClick={() => onCloseRef.current()} className="-mt-2 -mr-2.5">
            <CloseIcon size={18} />
          </IconButton>
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-[18px]">
          {children}
        </div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2.5 rounded-b-xl border-t border-line bg-table-head px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
