import { Navigate, Outlet, useLocation } from "react-router";
import { SessionContext, useMe, useSession } from "../../api/auth";
import { errorMessage } from "../../api/errors";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { isSafePath } from "../../lib/safe-path";

/** Trang được chuyển tới sau khi đăng nhập nếu không có trang trước đó. */
export const HOME_PATH = "/ban-hang";

interface FromState {
  from?: string;
}

function FullPageStatus({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      {error ? (
        <div className="flex max-w-sm flex-col items-center gap-4">
          <Alert>{errorMessage(error)}</Alert>
          <Button variant="secondary" onClick={onRetry}>
            Thử lại
          </Button>
        </div>
      ) : (
        <Spinner size={28} label="Đang tải" className="text-primary" />
      )}
    </div>
  );
}

/** Chỉ cho vào khi đã đăng nhập; chưa đăng nhập (hoặc hết phiên) thì về /login, nhớ trang đang mở. */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return <FullPageStatus />;
  if (me.isError && me.data === undefined) {
    return <FullPageStatus error={me.error} onRetry={() => void me.refetch()} />;
  }
  if (!me.data) {
    const state: FromState = { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  return (
    <SessionContext value={me.data}>
      <Outlet />
    </SessionContext>
  );
}

/** Trang chỉ chủ cửa hàng xem được; nhân viên bị chuyển về trang bán hàng. */
export function RequireOwner() {
  const { user } = useSession();
  if (user.role !== "owner") return <Navigate to={HOME_PATH} replace />;
  return <Outlet />;
}

/** Trang đăng nhập/đăng ký: đã đăng nhập thì chuyển vào app (về trang định mở trước đó nếu có). */
export function GuestOnly() {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return <FullPageStatus />;
  if (me.data) {
    const from = (location.state as FromState | null)?.from;
    return <Navigate to={isSafePath(from) ? from : HOME_PATH} replace />;
  }
  return <Outlet />;
}
