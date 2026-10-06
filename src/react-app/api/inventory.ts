import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { z } from "zod";
import type {
  createPurchaseSchema,
  createStockCountSchema,
  updatePurchaseSchema,
  updateStockCountLinesSchema,
} from "../../shared/schemas/document";
import { api } from "./client";
import { call, callWithStatus } from "./errors";
import {
  AFTER_SALE_INVALIDATE,
  documentListQueryKey,
  documentQueryKey,
  stockCountQueryKey,
} from "./keys";

// Phiếu nhập hàng và phiếu kiểm kho (giai đoạn 11).

export type DocumentListQuery = InferRequestType<typeof api.documents.$get>["query"];
export type DocumentList = InferResponseType<typeof api.documents.$get, 200>;
export type DocumentListItem = DocumentList["items"][number];
export type DocumentDetail = InferResponseType<(typeof api.documents)[":id"]["$get"], 200>;
export type StockCount = InferResponseType<(typeof api)["stock-counts"][":id"]["$get"], 200>;
export type StockCountLine = StockCount["lines"][number];
export type ScanResult = InferResponseType<
  (typeof api)["stock-counts"][":id"]["scan"]["$post"],
  200
>;
export type CompleteCountResult = InferResponseType<
  (typeof api)["stock-counts"][":id"]["complete"]["$post"],
  200
>;

export type CreatePurchaseBody = z.input<typeof createPurchaseSchema>;
export type UpdatePurchaseBody = z.input<typeof updatePurchaseSchema>;

/** Nhập hàng / hủy phiếu đổi tồn, giá vốn, nợ NCC, sổ kho, báo cáo: tải lại tất cả. */
function useInvalidateAfterWrite() {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of AFTER_SALE_INVALIDATE) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

export function useDocuments(query: DocumentListQuery) {
  return useQuery({
    queryKey: documentListQueryKey(query),
    queryFn: () => call(api.documents.$get({ query })),
    placeholderData: keepPreviousData,
  });
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: documentQueryKey(id ?? ""),
    queryFn: () => call(api.documents[":id"].$get({ param: { id: id! } })),
    enabled: !!id,
  });
}

export interface PurchaseResult {
  document: DocumentDetail;
  /** true: idempotencyKey đã dùng, server trả lại phiếu cũ (HTTP 200). */
  replayed: boolean;
}

export function useCreatePurchase() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: async (json: CreatePurchaseBody): Promise<PurchaseResult> => {
      const { data, status } = await callWithStatus(api.purchases.$post({ json }));
      return { document: data, replayed: status === 200 };
    },
    onSuccess: invalidate,
  });
}

export function useUpdatePurchase() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: ({ id, json }: { id: string; json: UpdatePurchaseBody }) =>
      call(api.purchases[":id"].$put({ param: { id }, json })),
    onSuccess: invalidate,
  });
}

export function useCompletePurchase() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: (id: string) => call(api.purchases[":id"].complete.$post({ param: { id } })),
    onSuccess: invalidate,
  });
}

export function useCancelDocument() {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: (id: string) => call(api.documents[":id"].cancel.$post({ param: { id } })),
    onSuccess: invalidate,
  });
}

export function useStockCount(id: string | undefined) {
  return useQuery({
    queryKey: stockCountQueryKey(id ?? ""),
    queryFn: () => call(api["stock-counts"][":id"].$get({ param: { id: id! } })),
    enabled: !!id,
  });
}

export function useCreateStockCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (json: z.input<typeof createStockCountSchema>) =>
      call(api["stock-counts"].$post({ json })),
    onSuccess: (doc) => {
      queryClient.setQueryData(stockCountQueryKey(doc.id), doc);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export function saveStockCountLines(id: string, json: z.input<typeof updateStockCountLinesSchema>) {
  return call(api["stock-counts"][":id"].lines.$patch({ param: { id }, json }));
}

export function scanStockCount(id: string, barcode: string) {
  return call(api["stock-counts"][":id"].scan.$post({ param: { id }, json: { barcode } }));
}

export function useCompleteStockCount() {
  const invalidate = useInvalidateAfterWrite();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(api["stock-counts"][":id"].complete.$post({ param: { id } })),
    onSuccess: (result) => {
      queryClient.setQueryData(stockCountQueryKey(result.document.id), result.document);
      invalidate();
    },
  });
}
