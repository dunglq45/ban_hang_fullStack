import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { createQueryClient } from "../api/query-client";
import { ToastProvider } from "../components/ui/Toast";
import { routes } from "../router";

export type MockHandler = (req: { body: unknown; init?: RequestInit }) => Response;

/**
 * fetch giả: khóa là "METHOD /đường-dẫn" (bỏ query string). Đường dẫn chưa khai báo trả 404.
 * Trả về mock để kiểm tra các lần gọi.
 */
export function mockApi(handlers: Record<string, MockHandler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const handler = handlers[`${method} ${url.pathname}`];
    if (!handler) return apiError(404, "NOT_FOUND", "Không tìm thấy");
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    return handler({ body, init });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

export const sampleStore = {
  id: "store-1",
  name: "Tạp hóa Minh Anh",
  phone: "0900000001",
  address: null,
  receiptFooter: null,
  createdAt: 0,
};

export function sampleMe(role: "owner" | "staff" = "owner") {
  return {
    user: {
      id: role === "owner" ? "u-owner" : "u-staff",
      name: role === "owner" ? "Nguyễn Minh Anh" : "Trần Văn Bình",
      phone: role === "owner" ? "0900000001" : "0900000002",
      role,
    },
    store: sampleStore,
  };
}

export const sampleDebtSummary = {
  receivable: { amount: 4873000, customers: 14 },
  overdue: { amount: 1200000, customers: 3, days: 30 },
  collectedThisMonth: { amount: 540000, count: 3 },
  payable: { amount: 2000000, suppliers: 1 },
  paidThisMonth: { amount: 0, count: 0 },
};
