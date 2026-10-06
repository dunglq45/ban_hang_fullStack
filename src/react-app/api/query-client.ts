import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./errors";
import { clearSessionData } from "./session-cache";

/**
 * Hết phiên (401 UNAUTHORIZED ở bất kỳ request nào): xóa thông tin đăng nhập và dữ liệu cửa hàng
 * trong cache (máy bán hàng dùng chung), `RequireAuth` sẽ chuyển về trang đăng nhập.
 * Không áp dụng cho INVALID_CREDENTIALS (sai mật khẩu khi đăng nhập), vì đó là lỗi của form.
 */
function handleUnauthorized(queryClient: QueryClient, err: unknown) {
  if (err instanceof ApiError && err.code === "UNAUTHORIZED") clearSessionData(queryClient);
}

export function createQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (err) => handleUnauthorized(queryClient, err) }),
    mutationCache: new MutationCache({ onError: (err) => handleUnauthorized(queryClient, err) }),
    defaultOptions: {
      queries: {
        // Thử lại 1 lần với lỗi mạng/5xx; lỗi 4xx gửi lại cũng vậy nên không thử.
        retry: (failureCount, err) =>
          !(err instanceof ApiError && err.isClientError) && failureCount < 1,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  });
  return queryClient;
}
