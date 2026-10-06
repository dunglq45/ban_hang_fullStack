import { Link } from "react-router";
import { buttonClass } from "../../components/ui/button-class";
import { EmptyState } from "../../components/ui/EmptyState";
import { usePageMeta } from "../../lib/page-meta";

/** Trang chưa làm: giữ chỗ trong menu và router. */
export function PlaceholderPage() {
  const meta = usePageMeta();
  return (
    <div className="rounded-card border border-line bg-white">
      <EmptyState
        title={`${meta?.title ?? "Trang này"} đang được xây dựng`}
        description="Chức năng này sẽ có trong bản cập nhật tới."
      />
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="rounded-card border border-line bg-white">
      <EmptyState
        title="Không tìm thấy trang"
        description="Đường dẫn không đúng hoặc trang đã bị xóa."
        action={
          <Link to="/ban-hang" className={buttonClass({ variant: "secondary" })}>
            Về trang Bán hàng
          </Link>
        }
      />
    </div>
  );
}
