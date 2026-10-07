import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "./client";
import { call } from "./errors";

// Báo cáo tổng quan (chỉ chủ cửa hàng, giai đoạn 13). Mọi khóa nằm dưới "reports" để bán hàng,
// nhập hàng, thu nợ... invalidate chung (AFTER_SALE_INVALIDATE).

export type OverviewQuery = InferRequestType<typeof api.reports.overview.$get>["query"];
export type Overview = InferResponseType<typeof api.reports.overview.$get, 200>;
export type RevenueDaily = InferResponseType<(typeof api.reports)["revenue-daily"]["$get"], 200>;
export type RevenueDay = RevenueDaily["items"][number];
export type TopProducts = InferResponseType<(typeof api.reports)["top-products"]["$get"], 200>;
export type Restock = InferResponseType<typeof api.reports.restock.$get, 200>;
export type RestockItem = Restock["items"][number];

/** Kỳ báo cáo: một trong các kỳ có sẵn hoặc khoảng ngày tùy chọn (YYYY-MM-DD, gồm cả hai đầu). */
export type PeriodParams = Pick<OverviewQuery, "period" | "from" | "to">;

export function useOverview(period: PeriodParams) {
  return useQuery({
    queryKey: ["reports", "overview", period],
    queryFn: () => call(api.reports.overview.$get({ query: period })),
    placeholderData: keepPreviousData,
  });
}

export function useRevenueDaily(days: number) {
  return useQuery({
    queryKey: ["reports", "revenue-daily", days],
    queryFn: () => call(api.reports["revenue-daily"].$get({ query: { days: String(days) } })),
  });
}

export function useTopProducts(period: PeriodParams, limit: number) {
  return useQuery({
    queryKey: ["reports", "top-products", period, limit],
    queryFn: () =>
      call(
        api.reports["top-products"].$get({
          query: { ...period, sort: "qty", limit: String(limit) },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useRestock(pageSize: number) {
  return useQuery({
    queryKey: ["reports", "restock", pageSize],
    queryFn: () => call(api.reports.restock.$get({ query: { pageSize: String(pageSize) } })),
  });
}

/** Số hàng bán chạy trong file xuất báo cáo. */
export const EXPORT_TOP_LIMIT = 50;

/** Dữ liệu mới nhất cho "Xuất báo cáo" (không lấy cache: số liệu có thể vừa đổi). */
export async function fetchReportExport(period: PeriodParams) {
  const [overview, daily, top, restock] = await Promise.all([
    call(api.reports.overview.$get({ query: period })),
    call(api.reports["revenue-daily"].$get({ query: { days: "7" } })),
    call(
      api.reports["top-products"].$get({
        query: { ...period, sort: "qty", limit: String(EXPORT_TOP_LIMIT) },
      }),
    ),
    call(api.reports.restock.$get({ query: { pageSize: "100" } })),
  ]);
  return { overview, daily, top, restock };
}
