import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { cn } from "../../lib/cn";
import { MoreIcon } from "./icons";

export interface ActionMenuItem {
  label: string;
  /** Có `to` thì là liên kết, không thì gọi `onSelect`. */
  to?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * Nút "⋮" mở menu thao tác (role="menu"): mũi tên lên/xuống, Home/End, Esc đóng và trả focus.
 * `label` là tên đọc màn hình của nút ("Thao tác với Nước mắm 500ml").
 */
export function ActionMenu({
  label,
  items,
  icon,
  align = "right",
}: {
  label: string;
  items: ActionMenuItem[];
  icon?: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);

  // Menu vẽ trong portal (không bị khung cuộn của bảng cắt mất): đóng khi bấm ra ngoài cả nút
  // lẫn menu, khi Esc (trả focus về nút), khi cuộn hoặc đổi cỡ cửa sổ.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !menuRef.current?.contains(t)) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    }
    function onScroll(e: Event) {
      if (!menuRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  const focusItem = (index: number) => {
    const nodes = menuRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])',
    );
    if (!nodes || nodes.length === 0) return;
    nodes[(index + nodes.length) % nodes.length]!.focus();
  };

  function openAt(index: number) {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition(
        align === "right"
          ? { top: rect.bottom + 4, right: window.innerWidth - rect.right }
          : { top: rect.bottom + 4, left: rect.left },
      );
    }
    setOpen(true);
    requestAnimationFrame(() => focusItem(index));
  }

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: -1,
    };
    if (e.key in moves) {
      e.preventDefault();
      focusItem(moves[e.key]!);
    } else if (e.key === "Tab") {
      close();
    }
  }

  const itemClass = (item: ActionMenuItem) =>
    cn(
      "flex min-h-touch w-full items-center px-4 text-left text-sm font-medium hover:bg-subtle focus-visible:bg-subtle",
      item.danger ? "text-danger" : "text-ink-body",
      item.disabled && "cursor-not-allowed opacity-50",
    );

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation(); // nút nằm trong dòng bảng bấm được
          if (open) close();
          else openAt(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openAt(e.key === "ArrowDown" ? 0 : -1);
          }
        }}
        className="inline-flex size-touch items-center justify-center rounded-small text-ink-muted hover:bg-subtle"
      >
        {icon ?? <MoreIcon size={18} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={position}
            className="fixed z-40 min-w-52 rounded-card border border-line bg-white py-1.5 shadow-lg"
          >
            {items.map((item) =>
              item.to && !item.disabled ? (
                <Link
                  key={item.label}
                  to={item.to}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={close}
                  className={itemClass(item)}
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled || undefined}
                  onClick={() => {
                    if (item.disabled) return;
                    close();
                    buttonRef.current?.focus();
                    item.onSelect?.();
                  }}
                  className={itemClass(item)}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
