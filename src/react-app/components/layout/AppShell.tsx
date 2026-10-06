import { useEffect } from "react";
import { Outlet } from "react-router";
import { useSession } from "../../api/auth";
import { usePageMeta } from "../../lib/page-meta";
import { Header } from "./Header";
import { MobileTabBar } from "./MobileTabBar";
import { Sidebar } from "./Sidebar";

/** Khung các trang sau đăng nhập: Sidebar (≥ 768px) hoặc thanh tab dưới (< 768px), Header, nội dung. */
export function AppShell() {
  const meta = usePageMeta();
  const { store } = useSession();

  useEffect(() => {
    document.title = meta ? `${meta.title} · ${store.name}` : store.name;
  }, [meta, store.name]);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#noi-dung"
        className="sr-only z-50 rounded-control bg-white px-4 py-3 font-semibold text-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Bỏ qua đến nội dung chính
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main
          id="noi-dung"
          tabIndex={-1}
          className="flex-1 px-4 pt-5 pb-24 outline-none md:px-7 md:pb-8"
        >
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
