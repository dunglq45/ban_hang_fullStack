import { Link, useRouteError } from "react-router";
import { buttonClass } from "../../components/ui/button-class";
import { EmptyState } from "../../components/ui/EmptyState";
import { AlertIcon } from "../../components/ui/icons";
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

/** Trang lỗi chung: bắt lỗi render không mong muốn ở bất kỳ route nào (React Router errorElement). */
export function ErrorPage() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-card border border-line bg-white">
        <EmptyState
          icon={<AlertIcon size={24} />}
          title="Đã có lỗi xảy ra"
          description="Vui lòng tải lại trang. Nếu vẫn còn lỗi, hãy báo cho người quản trị cửa hàng."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className={buttonClass({ variant: "secondary" })}
              >
                Tải lại trang
              </button>
              <Link to="/ban-hang" className={buttonClass()}>
                Về trang Bán hàng
              </Link>
            </div>
          }
        />
      </div>
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
