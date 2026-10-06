import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import type { InferResponseType } from "hono/client";
import type { LoginInput, RegisterInput } from "../../shared/schemas/auth";
import { api } from "./client";
import { ApiError, call } from "./errors";
import { meQueryKey } from "./keys";
import { clearSessionData, removeStoreData } from "./session-cache";

export type Me = InferResponseType<typeof api.auth.me.$get, 200>;
export type CurrentUser = Me["user"];
export type CurrentStore = Me["store"];

async function fetchMe(): Promise<Me | null> {
  try {
    return await call(api.auth.me.$get());
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

/** Sau khi đăng nhập/đăng ký: tải lại thông tin người dùng và cửa hàng. */
async function startSession(queryClient: QueryClient) {
  removeStoreData(queryClient);
  await queryClient.fetchQuery({ queryKey: meQueryKey, queryFn: fetchMe, staleTime: 0 });
}

/** Người dùng đang đăng nhập và cửa hàng; `null` nếu chưa đăng nhập. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
    // Quay lại tab: kiểm tra phiên ngay (tab khác có thể đã đăng xuất hoặc đăng nhập cửa hàng khác).
    refetchOnWindowFocus: "always",
  });
}

/**
 * Phiên đăng nhập do `RequireAuth` cung cấp. Đọc qua context (không đọc thẳng cache) để các trang
 * con không bao giờ thấy phiên rỗng trong lúc vừa đăng xuất/hết phiên mà chưa kịp chuyển trang.
 */
export const SessionContext = createContext<Me | null>(null);

/** Dùng trong các trang đã qua `RequireAuth`: chắc chắn đã đăng nhập. */
export function useSession(): Me {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession chỉ dùng bên trong RequireAuth");
  return session;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => call(api.auth.login.$post({ json: input })),
    onSuccess: () => startSession(queryClient),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => call(api.auth.register.$post({ json: input })),
    onSuccess: () => startSession(queryClient),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.auth.logout.$post()),
    // Phiên đã hết hạn (401) thì handler chung trong query-client cũng đưa về trang đăng nhập.
    // Lỗi mạng thì giữ nguyên: cookie vẫn còn hiệu lực trên server.
    onSuccess: () => clearSessionData(queryClient),
  });
}
