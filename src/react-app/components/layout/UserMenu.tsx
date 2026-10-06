import { type KeyboardEvent, useCallback, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { useLogout, useSession } from "../../api/auth";
import { ApiError, errorMessage } from "../../api/errors";
import { initials } from "../../lib/format";
import { useDismiss } from "../../lib/use-dismiss";
import { LogoutIcon, SettingsIcon } from "../ui/icons";
import { useToast } from "../ui/toast-context";

const ROLE_LABEL = { owner: "Chủ cửa hàng", staff: "Nhân viên" } as const;

/** Avatar người dùng trên header, bấm mở menu: Cài đặt, Đăng xuất. */
export function UserMenu() {
  const { user } = useSession();
  const logout = useLogout();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close, buttonRef);

  function focusItem(index: number) {
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!items || items.length === 0) return;
    items[(index + items.length) % items.length]!.focus();
  }

  function openMenu(focusIndex: number) {
    setOpen(true);
    // Menu render xong mới focus được mục đầu/cuối.
    requestAnimationFrame(() => focusItem(focusIndex));
  }

  function handleMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") focusItem(index + 1);
    else if (e.key === "ArrowUp") focusItem(index - 1);
    else if (e.key === "Home") focusItem(0);
    else if (e.key === "End") focusItem(-1);
    else if (e.key === "Tab") close();
    else return;
    if (e.key !== "Tab") e.preventDefault();
  }

  function handleLogout() {
    logout.mutate(undefined, {
      onError: (err) => {
        // Phiên đã hết hạn: handler chung đã đưa về trang đăng nhập, coi như đã đăng xuất.
        if (err instanceof ApiError && err.code === "UNAUTHORIZED") return;
        toast({ tone: "error", message: errorMessage(err) });
      },
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Tài khoản: ${user.name}`}
        onClick={() => (open ? close() : openMenu(0))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            openMenu(0);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            openMenu(-1);
          }
        }}
        className="flex size-touch items-center justify-center rounded-full"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">
          {initials(user.name)}
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Tài khoản"
          onKeyDown={handleMenuKeyDown}
          className="absolute top-full right-0 z-50 mt-1 w-64 rounded-card border border-line bg-white py-1.5 shadow-lg"
        >
          <div className="border-b border-line px-4 pt-1.5 pb-2.5 leading-snug" role="none">
            <div className="truncate text-sm font-semibold text-ink">{user.name}</div>
            <div className="text-[13px] text-ink-muted">
              {ROLE_LABEL[user.role]} · {user.phone}
            </div>
          </div>
          <Link
            to="/cai-dat"
            role="menuitem"
            tabIndex={-1}
            onClick={close}
            className="flex min-h-touch items-center gap-2.5 px-4 text-sm font-medium text-ink-body hover:bg-subtle focus-visible:bg-subtle"
          >
            <SettingsIcon size={18} />
            Cài đặt
          </Link>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={handleLogout}
            disabled={logout.isPending}
            className="flex min-h-touch w-full items-center gap-2.5 px-4 text-left text-sm font-medium text-danger hover:bg-subtle focus-visible:bg-subtle"
          >
            <LogoutIcon size={18} />
            {logout.isPending ? "Đang đăng xuất…" : "Đăng xuất"}
          </button>
        </div>
      )}
    </div>
  );
}
