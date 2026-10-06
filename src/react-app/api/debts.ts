import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { call } from "./errors";
import { debtSummaryQueryKey } from "./keys";

/** Tổng sổ nợ (phải thu, phải trả, số khách đang nợ...). */
export function useDebtSummary() {
  return useQuery({
    queryKey: debtSummaryQueryKey,
    queryFn: () => call(api.debts.summary.$get()),
  });
}
