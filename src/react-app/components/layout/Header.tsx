import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatLongDate } from "../../lib/format";
import { usePageMeta } from "../../lib/page-meta";
import { useDismiss } from "../../lib/use-dismiss";
import { BellIcon } from "../ui/icons";
import { UserMenu } from "./UserMenu";

/** Ngày hôm nay theo giờ VN, tự đổi khi qua nửa đêm (máy bán hàng để mở cả ngày). */
function useToday() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return formatLongDate(now);
}

/** Header 64px: đường dẫn trang + tiêu đề, ngày, thông báo, avatar. */
export function Header() {
  const meta = usePageMeta();
  const today = useToday();

  return (
    <header className="flex min-h-16 items-center justify-between gap-3 border-b border-line bg-white px-4 py-2.5 md:px-7">
      <div className="flex min-w-0 flex-col leading-tight">
        {meta?.section && <span className="text-[13px] text-ink-muted">{meta.section}</span>}
        <h1 className="truncate text-xl font-semibold text-ink">{meta?.title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-3.5">
        <span className="hidden text-sm text-ink-muted lg:inline">{today}</span>
        <Notifications />
        <UserMenu />
      </div>
    </header>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close, buttonRef);

  return (
    <div ref={rootRef} className="relative hidden sm:block">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Thông báo"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex size-touch items-center justify-center rounded-control border border-line bg-white text-ink-body hover:bg-table-head"
      >
        <BellIcon size={18} />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-50 mt-1 w-72 rounded-card border border-line bg-white p-4 text-sm text-ink-muted shadow-lg"
        >
          Chưa có thông báo mới.
        </div>
      )}
    </div>
  );
}
