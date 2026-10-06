import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HelloPage } from "./HelloPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <HelloPage />
    </QueryClientProvider>,
  );
}

describe("HelloPage", () => {
  it("gọi /api/health và báo máy chủ hoạt động", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    expect(await screen.findByText("Máy chủ hoạt động bình thường")).toBeInTheDocument();
    const firstCall = fetchMock.mock.calls[0] as unknown[];
    expect(String(firstCall[0])).toContain("/api/health");
  });

  it("báo lỗi khi không gọi được API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );

    renderPage();

    expect(await screen.findByText("Không kết nối được máy chủ")).toBeInTheDocument();
  });
});
