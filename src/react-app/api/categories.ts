import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "./client";
import { call } from "./errors";
import { categoriesQueryKey } from "./keys";

export type Category = InferResponseType<typeof api.categories.$get, 200>["items"][number];

export function useCategories() {
  return useQuery({
    queryKey: categoriesQueryKey,
    queryFn: async () => (await call(api.categories.$get())).items,
    staleTime: 5 * 60_000,
  });
}

/** Đổi nhóm hàng thì danh sách hàng (tên nhóm, bộ lọc) cũng đổi. */
function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
  };
}

export function useCreateCategory() {
  const onSuccess = useInvalidateCategories();
  return useMutation({
    mutationFn: (name: string) => call(api.categories.$post({ json: { name } })),
    onSuccess,
  });
}

export function useRenameCategory() {
  const onSuccess = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      call(api.categories[":id"].$patch({ param: { id }, json: { name } })),
    onSuccess,
  });
}

export function useDeleteCategory() {
  const onSuccess = useInvalidateCategories();
  return useMutation({
    mutationFn: (id: string) => call(api.categories[":id"].$delete({ param: { id } })),
    onSuccess,
  });
}
