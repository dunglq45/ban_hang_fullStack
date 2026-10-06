import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import type { SaleInput } from "../features/pos/cart";
import { api } from "./client";
import { call, callWithStatus } from "./errors";
import {
  AFTER_SALE_INVALIDATE,
  categoriesQueryKey,
  contactQueryKey,
  customerSearchQueryKey,
  posProductsQueryKey,
} from "./keys";

export type PosProduct = InferResponseType<typeof api.products.pos.$get, 200>["items"][number];
export type Category = InferResponseType<typeof api.categories.$get, 200>["items"][number];
export type ContactItem = InferResponseType<typeof api.contacts.$get, 200>["items"][number];
export type SaleDocument = InferResponseType<typeof api.sales.$post, 201>;
export type LookupResult = InferResponseType<typeof api.products.lookup.$get, 200>;

/** Hàng bán được ở POS: tải một lần, tìm phía client. */
export function usePosProducts() {
  return useQuery({
    queryKey: posProductsQueryKey,
    queryFn: async () => (await call(api.products.pos.$get())).items,
    staleTime: 5 * 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: categoriesQueryKey,
    queryFn: async () => (await call(api.categories.$get())).items,
    staleTime: 5 * 60_000,
  });
}

/** Tìm khách theo tên, mã hoặc SĐT (server tìm không dấu). */
export function useCustomerSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: customerSearchQueryKey(q),
    queryFn: async () =>
      (
        await call(
          api.contacts.$get({
            query: { type: "customer", q: q || undefined, pageSize: "8", sort: "name" },
          }),
        )
      ).items,
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Thông tin mới nhất của khách (nợ hiện tại) cho khách đang chọn trong đơn. */
export function useContact(id: string | null) {
  return useQuery({
    queryKey: contactQueryKey(id ?? ""),
    queryFn: () => call(api.contacts[":id"].$get({ param: { id: id! } })),
    enabled: id !== null,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; phone: string | null }) =>
      call(
        api.contacts.$post({
          json: {
            type: "customer",
            name: input.name,
            phone: input.phone,
            address: null,
            note: null,
            debtLimit: null,
          },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

/** Tra mã vạch (kể cả hàng ẩn khỏi POS hoặc ngừng bán) khi không thấy trong danh sách POS. */
export function lookupBarcode(barcode: string): Promise<LookupResult> {
  return call(api.products.lookup.$get({ query: { barcode } }));
}

export interface SaleResult {
  document: SaleDocument;
  /** true: idempotencyKey đã dùng, server trả lại hóa đơn cũ (HTTP 200). */
  replayed: boolean;
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaleInput): Promise<SaleResult> => {
      const { data, status } = await callWithStatus(api.sales.$post({ json: input }));
      return { document: data, replayed: status === 200 };
    },
    onSuccess: () => {
      for (const queryKey of AFTER_SALE_INVALIDATE) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
