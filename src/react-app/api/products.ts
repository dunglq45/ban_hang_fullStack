import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { CreateProductInput, UpdateProductInput } from "../../shared/schemas/product";
import { detailToUpdateInput } from "../features/products/product-form";
import { api } from "./client";
import { call } from "./errors";
import { movementsQueryKey, productListQueryKey, productQueryKey } from "./keys";

export type ProductListQuery = InferRequestType<typeof api.products.$get>["query"];
export type ProductList = InferResponseType<typeof api.products.$get, 200>;
export type ProductListItem = ProductList["items"][number];
export type ProductDetail = InferResponseType<(typeof api.products)[":id"]["$get"], 200>;
export type MovementsQuery = InferRequestType<
  (typeof api.products)[":id"]["movements"]["$get"]
>["query"];
export type Movement = InferResponseType<
  (typeof api.products)[":id"]["movements"]["$get"],
  200
>["items"][number];
export type ImportResult = InferResponseType<typeof api.products.import.$post, 200>;
type UploadResult = InferResponseType<(typeof api.products)[":id"]["image"]["$post"], 200>;

/** Đường dẫn ảnh hàng hóa (cần đăng nhập, cookie tự gửi kèm). */
export function imageUrl(imageKey: string) {
  return `/api/images/${imageKey}`;
}

export function useProducts(query: ProductListQuery) {
  return useQuery({
    queryKey: productListQueryKey(query),
    queryFn: () => call(api.products.$get({ query })),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: productQueryKey(id ?? ""),
    queryFn: () => call(api.products[":id"].$get({ param: { id: id! } })),
    enabled: !!id,
  });
}

export function useMovements(id: string, query: MovementsQuery) {
  return useQuery({
    queryKey: movementsQueryKey(id, query),
    queryFn: () => call(api.products[":id"].movements.$get({ param: { id }, query })),
    placeholderData: keepPreviousData,
  });
}

/** Mọi thay đổi hàng hóa: tải lại danh sách, chi tiết, POS, báo cáo tồn. */
export function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
  };
}

export function useCreateProduct() {
  const onSuccess = useInvalidateProducts();
  return useMutation({
    mutationFn: (json: CreateProductInput) => call(api.products.$post({ json })),
    onSuccess,
  });
}

export function useUpdateProduct() {
  const onSuccess = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, json }: { id: string; json: UpdateProductInput }) =>
      call(api.products[":id"].$put({ param: { id }, json })),
    onSuccess,
  });
}

/** Upload ảnh (multipart). Route ảnh không khai báo validator nên gọi fetch trực tiếp. */
export function uploadProductImage(id: string, file: File): Promise<UploadResult> {
  const body = new FormData();
  body.append("file", file);
  return call<UploadResult>(
    fetch(`/api/products/${encodeURIComponent(id)}/image`, {
      method: "POST",
      body,
      credentials: "include",
      headers: { "X-Requested-With": "fetch" },
    }),
  );
}

export function useUploadImage() {
  const onSuccess = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadProductImage(id, file),
    onSuccess,
  });
}

/**
 * Ngừng bán / bán lại. PUT thay toàn bộ thông tin hàng, nên đọc chi tiết mới nhất rồi gửi lại
 * nguyên vẹn, chỉ đổi `isActive`.
 */
export function useSetProductActive() {
  const onSuccess = useInvalidateProducts();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const detail = await call(api.products[":id"].$get({ param: { id } }));
      return call(
        api.products[":id"].$put({ param: { id }, json: detailToUpdateInput(detail, { isActive }) }),
      );
    },
    onSuccess,
  });
}

export function importProducts(rows: unknown[]): Promise<ImportResult> {
  return call(api.products.import.$post({ json: { rows } }));
}

