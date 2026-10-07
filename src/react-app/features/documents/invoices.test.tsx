import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  apiError,
  mockApi,
  type MockHandler,
  renderApp,
  sampleDebtSummary,
  sampleMe,
} from "../../test/render-app";

const listItem = {
  id: "hd-1",
  type: "sale",
  code: "HD000041",
  status: "completed",
  contactId: "kh-1",
  contactName: "Chị Lan",
  total: 250_000,
  paid: 200_000,
  debtAmount: 50_000,
  paymentMethod: "cash",
  createdAt: Date.UTC(2026, 9, 5, 3),
  createdByName: "Trần Văn Bình",
};

function invoice(patch: Record<string, unknown> = {}) {
  return {
    id: "hd-1",
    type: "sale",
    code: "HD000041",
    status: "completed",
    subtotal: 260_000,
    discount: 10_000,
    total: 250_000,
    paid: 200_000,
    debtAmount: 50_000,
    paymentMethod: "cash",
    note: null,
    createdAt: Date.UTC(2026, 9, 5, 3),
    completedAt: Date.UTC(2026, 9, 5, 3),
    cancelledAt: null,
    contactId: "kh-1",
    contact: {
      id: "kh-1",
      code: "KH000001",
      name: "Chị Lan",
      phone: "0912345678",
      address: null,
      debt: 300_000,
    },
    createdBy: { id: "u-staff", name: "Trần Văn Bình" },
    cancelledBy: null,
    store: null,
    lines: [
      {
        id: "l1",
        productId: "p-mam",
        productCode: "SP000052",
        productName: "Nước mắm 500ml",
        unitName: "Chai",
        factor: 1,
        qty: 2_000,
        baseQty: 2_000,
        unitPrice: 130_000,
        lineTotal: 260_000,
        systemQty: null,
        actualQty: null,
        reason: null,
      },
    ],
    ...patch,
  };
}

const lan = {
  id: "kh-1",
  type: "customer",
  code: "KH000001",
  name: "Chị Lan",
  phone: "0912345678",
  address: null,
  note: null,
  debt: 300_000,
  debtLimit: null,
  debtSince: null,
  isActive: true,
  createdAt: 0,
};

function setup(extra: Record<string, MockHandler> = {}, role: "owner" | "staff" = "owner") {
  return mockApi({
    "GET /api/auth/me": () => Response.json(sampleMe(role)),
    "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
    "GET /api/documents": () =>
      Response.json({ items: [listItem], total: 1, page: 1, pageSize: 20 }),
    "GET /api/documents/hd-1": () => Response.json(invoice()),
    "GET /api/contacts": () => Response.json({ items: [lan], total: 1, page: 1, pageSize: 8 }),
    "GET /api/contacts/kh-1": () => Response.json(lan),
    ...extra,
  });
}

function listQueries(fetchMock: ReturnType<typeof setup>) {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), "http://localhost"))
    .filter((u) => u.pathname === "/api/documents")
    .map((u) => Object.fromEntries(u.searchParams));
}

describe("trang Hóa đơn đã bán", () => {
  it("liệt kê hóa đơn bán, lọc trạng thái/thời gian/từ khóa qua URL", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    const { router } = renderApp("/hoa-don");

    const table = await screen.findByRole("table", { name: "Hóa đơn đã bán" });
    expect(within(table).getByText("Chị Lan")).toBeInTheDocument();
    expect(within(table).getByText("50.000")).toBeInTheDocument();
    expect(within(table).getByText("Hoàn thành")).toBeInTheDocument();
    expect(screen.getByText("1 hóa đơn")).toBeInTheDocument();
    expect(listQueries(fetchMock)[0]).toMatchObject({ type: "sale" });

    const tabs = screen.getByRole("tablist", { name: "Lọc theo trạng thái" });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Tất cả", "Hoàn thành", "Đã hủy"]);
    await user.click(within(tabs).getByRole("tab", { name: "Đã hủy" }));
    await user.selectOptions(screen.getByLabelText("Thời gian"), "7d");
    await user.type(screen.getByLabelText("Tìm theo mã hóa đơn hoặc tên khách"), "lan");
    await waitFor(() =>
      expect(listQueries(fetchMock).at(-1)).toMatchObject({
        type: "sale",
        status: "cancelled",
        q: "lan",
      }),
    );
    expect(listQueries(fetchMock).at(-1)).toHaveProperty("from");
    expect(router.state.location.search).toContain("trang-thai=cancelled");
  });

  it("lọc theo khách (ô chọn riêng) và theo khoảng ngày tùy chọn", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    const { router } = renderApp("/hoa-don");
    await screen.findByRole("table", { name: "Hóa đơn đã bán" });

    await user.type(screen.getByLabelText("Khách hàng"), "lan");
    await user.click(await screen.findByRole("option", { name: /Chị Lan/ }));
    await waitFor(() => expect(listQueries(fetchMock).at(-1)).toMatchObject({ contactId: "kh-1" }));
    expect(await screen.findByText("Chị Lan · 0912 345 678")).toBeInTheDocument();
    expect(router.state.location.search).toContain("khach=kh-1");

    await user.click(screen.getByRole("button", { name: "Bỏ lọc Chị Lan" }));
    await waitFor(() => expect(router.state.location.search).not.toContain("khach"));
    expect(screen.getByLabelText("Khách hàng")).toHaveValue("");

    await user.selectOptions(screen.getByLabelText("Thời gian"), "custom");
    const from = screen.getByLabelText("Từ ngày");
    const to = screen.getByLabelText("Đến ngày");
    expect(from).toHaveValue();
    expect(to).toHaveValue();
    await waitFor(() => expect(listQueries(fetchMock).at(-1)).toHaveProperty("from"));

    const before = listQueries(fetchMock).length;
    fireEvent.change(to, { target: { value: "2000-01-01" } });
    expect(await screen.findByText("Ngày kết thúc phải sau ngày bắt đầu")).toBeInTheDocument();
    expect(listQueries(fetchMock)).toHaveLength(before);

    fireEvent.change(from, { target: { value: "2026-10-01" } });
    fireEvent.change(to, { target: { value: "2026-10-05" } });
    await waitFor(() => expect(router.state.location.search).toContain("tu=2026-10-01"));
    expect(router.state.location.search).toContain("den=2026-10-05");
  });

  it("mục Hóa đơn có trong menu, nằm dưới Bán hàng", async () => {
    setup();
    renderApp("/hoa-don");
    const nav = await screen.findByRole("navigation", { name: "Menu chính" });
    const labels = within(nav)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(labels.indexOf("Hóa đơn")).toBe(labels.indexOf("Bán hàng") + 1);
  });

  it("chủ cửa hàng mở hóa đơn, xem chi tiết, in lại, hủy (có xác nhận)", async () => {
    let cancelled = false;
    setup({
      "GET /api/documents/hd-1": () =>
        Response.json(
          cancelled
            ? invoice({
                status: "cancelled",
                cancelledAt: Date.UTC(2026, 9, 5, 4),
                cancelledBy: { id: "u-owner", name: "Nguyễn Minh Anh" },
              })
            : invoice(),
        ),
      "POST /api/documents/hd-1/cancel": () => {
        cancelled = true;
        return Response.json(invoice({ status: "cancelled" }));
      },
    });
    const user = userEvent.setup();
    renderApp("/hoa-don");

    await user.click(await screen.findByRole("button", { name: "HD000041" }));
    const dialog = await screen.findByRole("dialog", { name: "Hóa đơn HD000041" });
    expect(await within(dialog).findByText("Nước mắm 500ml")).toBeInTheDocument();
    expect(within(dialog).getByText("Chị Lan · 0912 345 678")).toBeInTheDocument();
    expect(within(dialog).getByText("−10.000")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "In lại" })).toHaveAttribute(
      "href",
      "/in/hoa-don/hd-1",
    );

    await user.click(within(dialog).getByRole("button", { name: "Hủy hóa đơn" }));
    const confirm = await screen.findByRole("dialog", { name: "Hủy hóa đơn HD000041?" });
    expect(within(confirm).getByText(/Nợ của Chị Lan giảm/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Hủy hóa đơn" }));

    const after = await screen.findByRole("dialog", { name: "Hóa đơn HD000041" });
    expect(await within(after).findByText(/Đã hủy lúc .* bởi Nguyễn Minh Anh/)).toBeInTheDocument();
    expect(within(after).queryByRole("button", { name: "Hủy hóa đơn" })).not.toBeInTheDocument();
  });

  it("lỗi khi hủy hiện trong hộp thoại xác nhận", async () => {
    setup({
      "POST /api/documents/hd-1/cancel": () =>
        apiError(409, "ALREADY_CANCELLED", "Hóa đơn này đã bị hủy trước đó"),
    });
    const user = userEvent.setup();
    renderApp("/hoa-don");
    await user.click(await screen.findByRole("button", { name: "HD000041" }));
    const dialog = await screen.findByRole("dialog", { name: "Hóa đơn HD000041" });
    await user.click(await within(dialog).findByRole("button", { name: "Hủy hóa đơn" }));
    const confirm = await screen.findByRole("dialog", { name: "Hủy hóa đơn HD000041?" });
    await user.click(within(confirm).getByRole("button", { name: "Hủy hóa đơn" }));
    expect(await within(confirm).findByText("Hóa đơn này đã bị hủy trước đó")).toBeInTheDocument();
  });

  it("nhân viên xem và in lại được nhưng không có nút hủy", async () => {
    setup({}, "staff");
    const user = userEvent.setup();
    renderApp("/hoa-don");
    await user.click(await screen.findByRole("button", { name: "HD000041" }));
    const dialog = await screen.findByRole("dialog", { name: "Hóa đơn HD000041" });
    expect(await within(dialog).findByText("Nước mắm 500ml")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "In lại" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Hủy hóa đơn" })).not.toBeInTheDocument();
  });
});
