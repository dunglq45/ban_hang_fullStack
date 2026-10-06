import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { AppShell } from "./components/layout/AppShell";
import { GuestOnly, HOME_PATH, RequireAuth, RequireOwner } from "./features/auth/guards";
import { LoginPage } from "./features/auth/LoginPage";
import { RegisterPage } from "./features/auth/RegisterPage";
import { NotFoundPage, PlaceholderPage } from "./features/placeholder/PlaceholderPage";
import type { PageMeta } from "./lib/page-meta";

function page(path: string, section: string, title: string): RouteObject {
  const handle: PageMeta = { section, title };
  return { path, handle, element: <PlaceholderPage /> };
}

export const routes: RouteObject[] = [
  {
    element: <GuestOnly />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      // Hóa đơn in: không có khung app (giai đoạn 14).
      { path: "/in/hoa-don/:id", element: <PlaceholderPage /> },
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <Navigate to={HOME_PATH} replace /> },
          page("/ban-hang", "Vận hành", "Bán hàng"),
          page("/hang-hoa", "Vận hành", "Hàng hóa"),
          page("/hang-hoa/moi", "Hàng hóa", "Thêm hàng hóa"),
          page("/hang-hoa/:id", "Hàng hóa", "Chi tiết hàng hóa"),
          page("/hang-hoa/:id/sua", "Hàng hóa", "Sửa hàng hóa"),
          page("/kiem-kho/:id", "Hàng hóa", "Kiểm kho"),
          page("/so-no", "Vận hành", "Sổ nợ"),
          page("/so-no/:contactId", "Sổ nợ", "Chi tiết công nợ"),
          page("/cai-dat", "Hệ thống", "Cài đặt"),
          {
            element: <RequireOwner />,
            children: [
              page("/nhap-hang/moi", "Hàng hóa", "Nhập hàng"),
              page("/nhap-hang/:id", "Hàng hóa", "Phiếu nhập hàng"),
              page("/tong-quan", "Báo cáo", "Tổng quan"),
            ],
          },
          {
            path: "*",
            handle: { section: "", title: "Không tìm thấy trang" },
            element: <NotFoundPage />,
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
