import type { QueryClient } from "@tanstack/react-query";
import { meQueryKey } from "./keys";

/** Xóa dữ liệu của phiên hiện tại khỏi cache. `me = null` trước để các trang trong app thôi
 * hiển thị (và thôi tự tải lại) rồi mới xóa các query còn lại. */
export function clearSessionData(queryClient: QueryClient) {
  queryClient.setQueryData(meQueryKey, null);
  removeStoreData(queryClient);
}

/** Xóa dữ liệu nghiệp vụ (mọi query trừ thông tin đăng nhập). */
export function removeStoreData(queryClient: QueryClient) {
  void queryClient.cancelQueries({ predicate: (q) => q.queryKey[0] !== meQueryKey[0] });
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== meQueryKey[0] });
}
