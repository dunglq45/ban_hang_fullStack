import { Link } from "react-router";
import { buttonClass } from "../../components/ui/button-class";
import { EmptyState } from "../../components/ui/EmptyState";
import { CartPanel } from "./CartPanel";
import { usePos } from "./pos-context";

/** Trang thanh toán trên điện thoại (design/ThanhToanMobile); dùng chung giỏ với /ban-hang. */
export function MobileCheckoutPage() {
  const { active } = usePos();
  if (active.lines.length === 0) {
    return (
      <div className="rounded-card border border-line bg-white">
        <EmptyState
          title="Đơn chưa có hàng"
          description="Chọn hàng trước rồi mới thanh toán."
          action={
            <Link to="/ban-hang" className={buttonClass()}>
              Chọn hàng
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <CartPanel
      variant="page"
      className="-mx-4 -mt-5 md:mx-auto md:mt-0 md:max-w-xl md:rounded-card md:border md:border-line"
    />
  );
}
