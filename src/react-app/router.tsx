import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { AppShell } from "./components/layout/AppShell";
import { GuestOnly, HOME_PATH, RequireAuth, RequireOwner } from "./features/auth/guards";
import { LoginPage } from "./features/auth/LoginPage";
import { RegisterPage } from "./features/auth/RegisterPage";
import { NotFoundPage, PlaceholderPage } from "./features/placeholder/PlaceholderPage";
import { MobileCheckoutPage } from "./features/pos/MobileCheckoutPage";
import { ProductDetailPage } from "./features/products/ProductDetailPage";
import { ProductFormPage } from "./features/products/ProductFormPage";
import { ProductListPage } from "./features/products/ProductListPage";
import { PosPage } from "./features/pos/PosPage";
import { PosProvider } from "./features/pos/PosProvider";
import type { PageMeta } from "./lib/page-meta";

function meta(section: string, title: string): PageMeta {
  return { section, title };
}

function page(path: string, section: string, title: string): RouteObject {
  return { path, handle: meta(section, title), element: <PlaceholderPage /> };
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
          {
            path: "/ban-hang",
            element: <PosProvider />,
            children: [
              { index: true, handle: meta("Vận hành", "Bán hàng"), element: <PosPage /> },
              {
                path: "thanh-toan",
                handle: meta("Bán hàng", "Thanh toán"),
                element: <MobileCheckoutPage />,
              },
            ],
          },
          { path: "/hang-hoa", handle: meta("Vận hành", "Hàng hóa"), element: <ProductListPage /> },
          {
            path: "/hang-hoa/:id",
            handle: meta("Hàng hóa", "Chi tiết hàng hóa"),
            element: <ProductDetailPage />,
          },
          page("/kiem-kho/:id", "Hàng hóa", "Kiểm kho"),
          page("/so-no", "Vận hành", "Sổ nợ"),
          page("/so-no/:contactId", "Sổ nợ", "Chi tiết công nợ"),
          page("/cai-dat", "Hệ thống", "Cài đặt"),
          {
            element: <RequireOwner />,
            children: [
              {
                path: "/hang-hoa/moi",
                handle: meta("Hàng hóa", "Thêm hàng hóa"),
                element: <ProductFormPage />,
              },
              {
                path: "/hang-hoa/:id/sua",
                handle: meta("Hàng hóa", "Sửa hàng hóa"),
                element: <ProductFormPage />,
              },
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
