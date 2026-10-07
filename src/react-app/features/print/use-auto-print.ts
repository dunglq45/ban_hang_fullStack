import { useEffect, useRef } from "react";

/**
 * Trang in hóa đơn/phiếu, không có khung app (Sidebar/Header). Mở từ POS/thu-trả nợ với
 * `?auto=1` thì tự `window.print()` rồi đóng tab (window chỉ mở được bằng script mới đóng được);
 * mở trực tiếp ("In lại", "In phiếu") thì chỉ hiện nút in thủ công ở `PrintToolbar`.
 */
export function useAutoPrint(auto: boolean, ready: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (!auto || !ready || done.current) return;
    done.current = true;
    function onAfterPrint() {
      window.close();
    }
    window.addEventListener("afterprint", onAfterPrint);
    // Chờ một nhịp để layout/font kịp vẽ xong trước khi gọi hộp thoại in.
    const id = window.setTimeout(() => window.print(), 150);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [auto, ready]);
}
