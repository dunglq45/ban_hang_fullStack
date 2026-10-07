import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import type { ChangePasswordInput } from "../../shared/schemas/auth";
import type {
  CreateUserInput,
  UpdateStoreInput,
  UpdateUserInput,
} from "../../shared/schemas/store";
import { api } from "./client";
import { call } from "./errors";
import { meQueryKey } from "./keys";

// Cài đặt: thông tin cửa hàng, nhân viên (chỉ chủ), tự đổi mật khẩu (giai đoạn 13).

export type StoreInfo = InferResponseType<typeof api.store.$get, 200>;
export type StaffUser = InferResponseType<typeof api.users.$get, 200>["items"][number];

const storeQueryKey = ["store"] as const;
const usersQueryKey = ["users"] as const;

export function useStoreInfo() {
  return useQuery({ queryKey: storeQueryKey, queryFn: () => call(api.store.$get()) });
}

export function useUpdateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (json: UpdateStoreInput) => call(api.store.$put({ json })),
    onSuccess: (store) => {
      queryClient.setQueryData(storeQueryKey, store);
      // Tên cửa hàng ở sidebar, thông tin trên hóa đơn in.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: meQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["documents"] }),
      ]);
    },
  });
}

export function useUsers() {
  return useQuery({
    queryKey: usersQueryKey,
    queryFn: async () => (await call(api.users.$get())).items,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (json: CreateUserInput) => call(api.users.$post({ json })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersQueryKey }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, json }: { id: string; json: UpdateUserInput }) =>
      call(api.users[":id"].$patch({ param: { id }, json })),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: usersQueryKey }),
        // Tự đổi tên: tên ở menu avatar.
        queryClient.invalidateQueries({ queryKey: meQueryKey }),
      ]),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (json: ChangePasswordInput) => call(api.auth.password.$put({ json })),
  });
}
