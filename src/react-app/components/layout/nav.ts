import type { ComponentType } from "react";
import type { CurrentUser } from "../../api/auth";
import {
  BoxIcon,
  CartIcon,
  ChartIcon,
  LedgerIcon,
  MoreIcon,
  ReceiptIcon,
  SettingsIcon,
} from "../ui/icons";

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** Các tiền tố đường dẫn làm mục này sáng (Nhập hàng, Kiểm kho thuộc Hàng hóa). */
  matches: string[];
  ownerOnly?: boolean;
  /** Hiện badge số khách đang nợ. */
  debtBadge?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const SALES: NavItem = {
  to: "/ban-hang",
  label: "Bán hàng",
  icon: CartIcon,
  matches: ["/ban-hang"],
};
const INVOICES: NavItem = {
  to: "/hoa-don",
  label: "Hóa đơn",
  icon: ReceiptIcon,
  matches: ["/hoa-don"],
};
const PRODUCTS: NavItem = {
  to: "/hang-hoa",
  label: "Hàng hóa",
  icon: BoxIcon,
  matches: ["/hang-hoa", "/nhap-hang", "/kiem-kho"],
};
const DEBTS: NavItem = {
  to: "/so-no",
  label: "Sổ nợ",
  icon: LedgerIcon,
  matches: ["/so-no"],
  debtBadge: true,
};
const DASHBOARD: NavItem = {
  to: "/tong-quan",
  label: "Tổng quan",
  icon: ChartIcon,
  matches: ["/tong-quan"],
  ownerOnly: true,
};
const SETTINGS: NavItem = {
  to: "/cai-dat",
  label: "Cài đặt",
  icon: SettingsIcon,
  matches: ["/cai-dat"],
};

/** Menu bên trái (màn hình ≥ 768px). */
export const SIDEBAR_SECTIONS: NavSection[] = [
  { title: "Vận hành", items: [SALES, INVOICES, PRODUCTS, DEBTS] },
  { title: "Báo cáo", items: [DASHBOARD] },
];

export const SIDEBAR_FOOTER: NavItem[] = [SETTINGS];

/** Thanh tab dưới cùng (màn hình < 768px), theo design/BanHangMobile. */
export const MOBILE_TABS: NavItem[] = [
  SALES,
  PRODUCTS,
  DEBTS,
  { ...DASHBOARD, label: "Báo cáo" },
  // Trang "Thêm" chứa lối vào Hóa đơn, Nhập hàng, Kiểm kho (thanh dưới không có các mục này).
  {
    ...SETTINGS,
    label: "Thêm",
    icon: MoreIcon,
    matches: ["/cai-dat", "/hoa-don"],
  },
];

export function visibleItems(items: NavItem[], role: CurrentUser["role"]) {
  return items.filter((item) => !item.ownerOnly || role === "owner");
}

export function isActive(item: NavItem, pathname: string) {
  return item.matches.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}
