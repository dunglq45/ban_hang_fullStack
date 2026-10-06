import { Link, useLocation } from "react-router";
import { useSession } from "../../api/auth";
import { useDebtSummary } from "../../api/debts";
import { cn } from "../../lib/cn";
import { initials } from "../../lib/format";
import { CountBadge } from "../ui/Badge";
import { isActive, type NavItem, SIDEBAR_FOOTER, SIDEBAR_SECTIONS, visibleItems } from "./nav";

/** Menu bên trái 232px (ẩn khi màn hình < 768px, thay bằng MobileTabBar). */
export function Sidebar() {
  const { user, store } = useSession();
  const { pathname } = useLocation();
  const debts = useDebtSummary();
  const debtors = debts.data?.receivable.customers;

  const renderItem = (item: NavItem) => (
    <SidebarLink
      key={item.to}
      item={item}
      active={isActive(item, pathname)}
      badge={item.debtBadge && debtors ? debtors : undefined}
    />
  );

  return (
    <nav
      aria-label="Menu chính"
      className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col gap-[18px] overflow-y-auto border-r border-line bg-white px-3 pt-3.5 pb-4 md:flex"
    >
      {/* Mỗi tài khoản thuộc một cửa hàng; ô này hiện cửa hàng đang dùng. */}
      <div className="flex min-h-[52px] items-center gap-2.5 rounded-control border border-line px-2.5">
        <span
          className="flex size-[30px] shrink-0 items-center justify-center rounded-small bg-primary text-xs font-bold text-white"
          aria-hidden="true"
        >
          {initials(store.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-semibold text-ink">{store.name}</span>
          <span className="text-xs text-ink-muted">Cửa hàng chính</span>
        </span>
      </div>

      {SIDEBAR_SECTIONS.map((section) => {
        const items = visibleItems(section.items, user.role);
        if (items.length === 0) return null;
        return (
          <div key={section.title} className="flex flex-col gap-0.5">
            <div className="px-2.5 pb-1.5 text-xs font-semibold text-ink-muted">
              {section.title}
            </div>
            {items.map(renderItem)}
          </div>
        );
      })}

      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
        {visibleItems(SIDEBAR_FOOTER, user.role).map(renderItem)}
      </div>
    </nav>
  );
}

function SidebarLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      aria-label={badge !== undefined ? `${item.label}, ${badge} khách đang nợ` : undefined}
      className={cn(
        "flex min-h-touch items-center gap-2.5 rounded-small px-2.5 text-sm",
        active
          ? "bg-primary-soft font-semibold text-primary"
          : "font-medium text-ink-body hover:bg-subtle",
      )}
    >
      <Icon size={20} />
      {item.label}
      {badge !== undefined && (
        <span className="ml-auto" aria-hidden="true">
          <CountBadge count={badge} />
        </span>
      )}
    </Link>
  );
}
