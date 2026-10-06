import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import type { CreatePaymentInput } from "../../shared/schemas/payment";
import type { UpdateContactInput } from "../../shared/schemas/contact";
import { api } from "./client";
import { call, callWithStatus } from "./errors";
import { AFTER_SALE_INVALIDATE, contactQueryKey, debtSummaryQueryKey } from "./keys";

// Sổ nợ: tổng, danh sách khách/NCC đang nợ, sổ chi tiết công nợ, phiếu thu/chi (giai đoạn 12).

export type ContactListQuery = InferRequestType<typeof api.contacts.$get>["query"];
export type ContactList = InferResponseType<typeof api.contacts.$get, 200>;
export type ContactDetail = InferResponseType<(typeof api.contacts)[":id"]["$get"], 200>;
export type DebtEntries = InferResponseType<
  (typeof api.contacts)[":id"]["debt-entries"]["$get"],
  200
>;
export type DebtEntry = DebtEntries["items"][number];
export type PaymentDetail = InferResponseType<(typeof api.payments)[":id"]["$get"], 200>;

export const contactListQueryKey = (params: object) => ["contacts", "list", params] as const;
export const debtEntriesQueryKey = (id: string, page: number) =>
  ["contacts", "debt-entries", id, page] as const;
export const paymentQueryKey = (id: string) => ["payments", "detail", id] as const;

/** Tổng sổ nợ (phải thu, phải trả, số khách đang nợ...). */
export function useDebtSummary() {
  return useQuery({
    queryKey: debtSummaryQueryKey,
    queryFn: () => call(api.debts.summary.$get()),
  });
}

export function useContactList(query: ContactListQuery) {
  return useQuery({
    queryKey: contactListQueryKey(query),
    queryFn: () => call(api.contacts.$get({ query })),
    placeholderData: keepPreviousData,
  });
}

/** Chi tiết khách/NCC kèm lần thu/trả gần nhất. */
export function useContactDetail(id: string | undefined) {
  return useQuery({
    queryKey: contactQueryKey(id ?? ""),
    queryFn: () => call(api.contacts[":id"].$get({ param: { id: id! } })),
    enabled: !!id,
  });
}

export const DEBT_ENTRIES_PAGE_SIZE = 20;

export function useDebtEntries(id: string | undefined, page: number) {
  return useQuery({
    queryKey: debtEntriesQueryKey(id ?? "", page),
    queryFn: () =>
      call(
        api.contacts[":id"]["debt-entries"].$get({
          param: { id: id! },
          query: { page: String(page), pageSize: String(DEBT_ENTRIES_PAGE_SIZE) },
        }),
      ),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

/** Toàn bộ sổ nợ của một đối tác (để xuất Excel), tải từng trang 100 dòng. */
export async function fetchAllDebtEntries(id: string): Promise<DebtEntry[]> {
  const pageSize = 100;
  const all: DebtEntry[] = [];
  for (let page = 1; ; page++) {
    const res = await call(
      api.contacts[":id"]["debt-entries"].$get({
        param: { id },
        query: { page: String(page), pageSize: String(pageSize) },
      }),
    );
    all.push(...res.items);
    if (res.items.length < pageSize || all.length >= res.total) return all;
  }
}

export function usePayment(id: string | null) {
  return useQuery({
    queryKey: paymentQueryKey(id ?? ""),
    queryFn: () => call(api.payments[":id"].$get({ param: { id: id! } })),
    enabled: id !== null,
  });
}

export interface PaymentResult {
  payment: PaymentDetail;
  /** true: idempotencyKey đã dùng, server trả lại phiếu cũ (HTTP 200). */
  replayed: boolean;
}

/** Thu nợ khách / trả nợ NCC: đổi nợ, sổ nợ, tổng sổ nợ, báo cáo. */
export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (json: CreatePaymentInput): Promise<PaymentResult> => {
      const { data, status } = await callWithStatus(api.payments.$post({ json }));
      return { payment: data, replayed: status === 200 };
    },
    onSuccess: () => {
      for (const queryKey of AFTER_SALE_INVALIDATE) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}

export function useUpdateContact(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (json: UpdateContactInput) =>
      call(api.contacts[":id"].$put({ param: { id }, json })),
    // Tên khách hiện cả ở danh sách chứng từ.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contacts"] }),
        queryClient.invalidateQueries({ queryKey: ["documents"] }),
      ]),
  });
}
