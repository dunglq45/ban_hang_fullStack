import { Link, useLocation } from "react-router";
import { useSession } from "../../api/auth";
import { cn } from "../../lib/cn";
import { isActive, MOBILE_TABS, visibleItems } from "./nav";

/** Thanh tab dưới cùng cho màn hình < 768px (thay cho Sidebar). */
export function MobileTabBar() {
  const { user } = useSession();
  const { pathname } = useLocation();
  const tabs = visibleItems(MOBILE_TABS, user.role);

  return (
    <nav
      aria-label="Điều hướng"
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-white px-1 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => {
        const active = isActive(tab, pathname);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-control text-[11px]",
              active ? "font-semibold text-primary" : "font-medium text-ink-muted",
            )}
          >
            <Icon size={22} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
