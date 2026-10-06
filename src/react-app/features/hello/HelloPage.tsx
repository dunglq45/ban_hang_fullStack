import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";

export function HelloPage() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await api.health.$get();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  return (
    <main className="mx-auto max-w-md p-6">
      <div className="rounded-card border border-line bg-white p-6">
        <h1 className="text-2xl font-semibold text-ink">Xin chào 👋</h1>
        <p className="mt-2 text-ink-muted">Ứng dụng quản lý cửa hàng đang chạy.</p>
        <p className="mt-4 text-ink-body" role="status">
          {health.isPending && "Đang kiểm tra máy chủ…"}
          {health.isError && <span className="text-danger">Không kết nối được máy chủ</span>}
          {health.data?.ok && <span className="text-success">Máy chủ hoạt động bình thường</span>}
        </p>
      </div>
    </main>
  );
}
