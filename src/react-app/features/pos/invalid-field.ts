import type { ShowToast } from "../../components/ui/toast-context";

/**
 * Còn ô trong hóa đơn đang báo lỗi (số lượng "1.000", số nhỏ hơn tối thiểu...) thì chưa thanh
 * toán: giá trị đang tính khác với chữ trên màn hình. Đưa focus về ô đó và báo lỗi.
 * Trả về true nếu đã chặn.
 */
const SELECTOR =
  '[aria-label="Hàng trong đơn"] [aria-invalid="true"], #pos-paid[aria-invalid="true"]';

export function hasInvalidField(): boolean {
  return document.querySelector(SELECTOR) !== null;
}

export function blockIfInvalidField(toast: ShowToast): boolean {
  const invalid = document.querySelector<HTMLElement>(SELECTOR);
  if (!invalid) return false;
  invalid.focus();
  toast({
    tone: "error",
    message:
      "Có ô số lượng chưa hợp lệ (số lẻ dùng dấu phẩy, ví dụ 1,5). Sửa lại trước khi thanh toán.",
  });
  return true;
}
