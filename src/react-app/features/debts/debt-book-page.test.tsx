import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  apiError,
  mockApi,
  type MockHandler,
  renderApp,
  sampleDebtSummary,
  sampleMe,
} from "../../test/render-app";

const DAY = 24 * 60 * 60 * 1000;

function contactOf(patch: Record<string, unknown> = {}) {
  return {
    id: "kh-lan",
    type: "customer",
    code: "KH000027",
    name: "Chị Lan",
    phone: "0912345678",
    address: "Hẻm 12, chợ Đồng",
    note: null,
    debt: 363_000,
    debtLimit: 1_000_000,
    debtSince: Date.now() - 20 * DAY,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

const tuan = contactOf({
  id: "kh-tuan",
  code: "KH000003",
  name: "Anh Tuấn (thợ hồ)",
  phone: "0987112334",
  debt: 1_200_000,
  debtSince: Date.now() - 41 * DAY,
});

const supplier = contactOf({
  id: "ncc-1",
  type: "supplier",
  code: "NCC000001",
  name: "Đại lý Hưng Thịnh",
  phone: null,
  address: null,
  debt: 2_000_000,
  debtLimit: null,
});

const entries = {
  items: [
    {
      id: "e2",
      createdAt: Date.UTC(2026, 9, 5, 3),
      ref: { kind: "document", id: "hd-231", code: "HD000231", type: "sale" },
      description: "Bán hàng, trả thiếu",
      note: null,
      amount: 13_000,
      increase: 13_000,
      decrease: 0,
      balanceAfter: 363_000,
    },
    {
      id: "e1",
      createdAt: Date.UTC(2026, 8, 28, 3),
      ref: { kind: "payment", id: "pt-44", code: "PT000044", type: "receipt" },
      description: "Thu nợ tiền mặt",
      note: null,
      amount: -200_000,
      increase: 0,
      decrease: 200_000,
      balanceAfter: 350_000,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};

function setup(role: "owner" | "staff" = "owner", extra: Record<string, MockHandler> = {}) {
  let lan = contactOf();
  const payments: Array<Record<string, unknown>> = [];
  const fetchMock = mockApi({
    "GET /api/auth/me": () => Response.json(sampleMe(role)),
    "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
    "GET /api/contacts": () =>
      Response.json({ items: [tuan, lan], total: 2, page: 1, pageSize: 30 }),
    "GET /api/contacts/kh-lan": () =>
      Response.json({
        ...lan,
        lastPayment: {
          code: "PT000044",
          amount: 200_000,
          method: "cash",
          createdAt: Date.UTC(2026, 8, 28, 3),
        },
      }),
    "GET /api/contacts/ncc-1": () => Response.json({ ...supplier, lastPayment: null }),
    "GET /api/contacts/kh-lan/debt-entries": () => Response.json(entries),
    "GET /api/contacts/ncc-1/debt-entries": () =>
      Response.json({ items: [], total: 0, page: 1, pageSize: 20 }),
    "POST /api/payments": ({ body }) => {
      const input = body as Record<string, unknown>;
      payments.push(input);
      lan = contactOf({ debt: lan.debt - (input.amount as number) });
      return Response.json(
        { id: "pt-45", code: "PT000045", amount: input.amount, type: "receipt" },
        { status: 201 },
      );
    },
    ...extra,
  });
  return { fetchMock, payments };
}

describe("Sổ nợ", () => {
  it("danh sách khách nợ: thẻ tổng, tab có đếm, quá 30 ngày tô cam", async () => {
    setup();
    renderApp("/so-no");
    const list = await screen.findByRole("region", { name: "Danh sách khách nợ" });
    expect(await within(list).findByText("Anh Tuấn (thợ hồ)")).toBeInTheDocument();
    expect(within(list).getByText("Quá hạn · 41 ngày")).toHaveClass("text-warn");
    expect(within(list).getByText("20 ngày")).not.toHaveClass("text-warn");
    expect(screen.getByText("Tổng phải thu khách hàng").nextSibling).toHaveTextContent("4.873.000");
    expect(screen.getByRole("tab", { name: /Phải thu khách hàng/ })).toHaveTextContent("14");
    expect(screen.getByText("Chọn một khách để xem sổ nợ")).toBeInTheDocument();
  });

  it("chọn khách: chi tiết, hạn mức còn lại, sổ chi tiết; bấm mã chứng từ xem nhanh", async () => {
    setup("owner", {
      "GET /api/payments/pt-44": () =>
        Response.json({
          id: "pt-44",
          type: "receipt",
          code: "PT000044",
          status: "completed",
          amount: 200_000,
          method: "cash",
          note: null,
          createdAt: Date.UTC(2026, 8, 28, 3),
          cancelledAt: null,
          contactId: "kh-lan",
          balanceAfter: 350_000,
          contact: {
            id: "kh-lan",
            code: "KH000027",
            name: "Chị Lan",
            phone: null,
            address: null,
            debt: 363_000,
          },
          createdBy: { id: "u-owner", name: "Nguyễn Minh Anh" },
          store: null,
        }),
    });
    const user = userEvent.setup();
    const { router } = renderApp("/so-no");
    await user.click(await screen.findByRole("link", { name: /Chị Lan/ }));
    expect(router.state.location.pathname).toBe("/so-no/kh-lan");

    const detail = screen.getByRole("region", { name: "Chi tiết công nợ" });
    expect(await within(detail).findByRole("heading", { name: "Chị Lan" })).toBeInTheDocument();
    expect(
      within(detail).getByText("KH000027 · 0912 345 678 · Hẻm 12, chợ Đồng"),
    ).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: "Gọi" })).toHaveAttribute(
      "href",
      "tel:0912345678",
    );
    expect(within(detail).getByText("Còn 637.000")).toBeInTheDocument();
    expect(within(detail).getByText("200.000 · tiền mặt")).toBeInTheDocument();

    const table = await within(detail).findByRole("table", { name: "Sổ chi tiết công nợ" });
    expect(within(table).getByText("Bán hàng, trả thiếu")).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "PT000044" }));
    const dialog = await screen.findByRole("dialog", { name: "Phiếu thu PT000044" });
    expect(within(dialog).getByText("Nguyễn Minh Anh")).toBeInTheDocument();
  });

  it("thu nợ: mặc định thu hết, báo hết nợ, gửi phiếu thu kèm idempotencyKey", async () => {
    const { payments } = setup();
    const user = userEvent.setup();
    renderApp("/so-no/kh-lan");
    const detail = await screen.findByRole("region", { name: "Chi tiết công nợ" });
    await user.click(await within(detail).findByRole("button", { name: "Thu nợ" }));

    const dialog = await screen.findByRole("dialog", { name: "Thu nợ" });
    expect(within(dialog).getByLabelText(/Số tiền thu/)).toHaveValue("363.000");
    expect(within(dialog).getByText("0 · Hết nợ")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Thu hết nợ" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(within(dialog).getByRole("button", { name: "200.000" }));
    expect(within(dialog).getByText("Dư nợ sau khi thu").nextSibling).toHaveTextContent("163.000");
    await user.click(within(dialog).getByRole("radio", { name: "Chuyển khoản" }));
    await user.type(within(dialog).getByLabelText("Ghi chú"), "Con gái mang qua");
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận thu 200.000" }));

    expect(await screen.findByText("Đã thu 200.000 · Chị Lan (PT000045)")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      type: "receipt",
      contactId: "kh-lan",
      amount: 200_000,
      method: "transfer",
      note: "Con gái mang qua",
    });
    expect(payments[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    // Chi tiết tải lại theo nợ mới.
    await waitFor(() =>
      expect(within(detail).getByText("Dư nợ hiện tại").nextSibling).toHaveTextContent("163.000"),
    );
  });

  it("thu nhiều hơn nợ: chặn ở client; server báo vượt nợ thì hiện lỗi, giữ key khi gửi lại", async () => {
    const keys: string[] = [];
    let fail = true;
    setup("owner", {
      "POST /api/payments": ({ body }) => {
        keys.push((body as { idempotencyKey: string }).idempotencyKey);
        if (fail) {
          fail = false;
          return apiError(
            409,
            "AMOUNT_EXCEEDS_DEBT",
            "Số tiền thu lớn hơn số nợ hiện tại (300.000)",
          );
        }
        return Response.json({ id: "pt-45", code: "PT000045", amount: 100_000 }, { status: 201 });
      },
    });
    const user = userEvent.setup();
    renderApp("/so-no/kh-lan");
    const detail = await screen.findByRole("region", { name: "Chi tiết công nợ" });
    await user.click(await within(detail).findByRole("button", { name: "Thu nợ" }));
    const dialog = await screen.findByRole("dialog", { name: "Thu nợ" });
    const amount = within(dialog).getByLabelText(/Số tiền thu/);

    await user.clear(amount);
    await user.type(amount, "400000");
    await user.click(within(dialog).getByRole("button", { name: /Xác nhận thu/ }));
    expect(within(dialog).getByText(/Số tiền lớn hơn số nợ hiện tại/)).toBeInTheDocument();
    expect(keys).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "100.000" }));
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận thu 100.000" }));
    expect(
      await within(dialog).findByText(/lớn hơn số nợ hiện tại \(300.000\)/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận thu 100.000" }));
    expect(await screen.findByText(/Đã thu 100.000/)).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("nhà cung cấp: nhân viên xem được nhưng không có nút Trả nợ; chủ thì có", async () => {
    setup("staff");
    renderApp("/so-no/ncc-1");
    const detail = await screen.findByRole("region", { name: "Chi tiết công nợ" });
    expect(
      await within(detail).findByRole("heading", { name: "Đại lý Hưng Thịnh" }),
    ).toBeInTheDocument();
    // Mở thẳng chi tiết NCC: tab chuyển theo loại.
    expect(screen.getByRole("tab", { name: /Phải trả nhà cung cấp/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(detail).queryByRole("button", { name: "Trả nợ" })).not.toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: "Ghi nợ" })).not.toBeInTheDocument();
    expect(within(detail).queryByText("Hạn mức nợ")).not.toBeInTheDocument();
  });

  it("sửa thông tin và hạn mức nợ gửi PUT đủ trường", async () => {
    let put: unknown;
    setup("owner", {
      "PUT /api/contacts/kh-lan": ({ body }) => {
        put = body;
        return Response.json(contactOf());
      },
    });
    const user = userEvent.setup();
    renderApp("/so-no/kh-lan");
    const detail = await screen.findByRole("region", { name: "Chi tiết công nợ" });
    await user.click(await within(detail).findByRole("button", { name: "Sửa" }));
    const dialog = await screen.findByRole("dialog", { name: "Sửa thông tin khách" });
    const limit = within(dialog).getByLabelText("Hạn mức nợ");
    expect(limit).toHaveValue("1.000.000");
    await user.clear(limit);
    await user.type(limit, "2000000");
    await user.click(within(dialog).getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Đã lưu thông tin")).toBeInTheDocument();
    expect(put).toEqual({
      name: "Chị Lan",
      phone: "0912345678",
      address: "Hẻm 12, chợ Đồng",
      note: null,
      debtLimit: 2_000_000,
      isActive: true,
    });
  });

  it("Ghi nợ mở màn Bán hàng với khách đã chọn", async () => {
    setup("owner", {
      "GET /api/products/pos": () => Response.json({ items: [] }),
      "GET /api/categories": () => Response.json({ items: [] }),
    });
    const user = userEvent.setup();
    const { router } = renderApp("/so-no/kh-lan");
    const detail = await screen.findByRole("region", { name: "Chi tiết công nợ" });
    await user.click(await within(detail).findByRole("button", { name: "Ghi nợ" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/ban-hang"));
    expect(await screen.findByText("Nợ cũ 363.000")).toBeInTheDocument();
    expect(router.state.location.state).toBeNull();
  });

  it("lỗi mạng: đóng rồi mở lại vẫn dùng key cũ; server trả 200 thì báo đã lưu trước đó", async () => {
    const keys: string[] = [];
    let call = 0;
    setup("owner", {
      "POST /api/payments": ({ body }) => {
        keys.push((body as { idempotencyKey: string }).idempotencyKey);
        call++;
        if (call === 1) return Promise.reject(new TypeError("Failed to fetch"));
        return Response.json(
          { id: "pt-45", code: "PT000045", amount: 363_000, type: "receipt" },
          { status: 200 },
        );
      },
    });
    const user = userEvent.setup();
    renderApp("/so-no/kh-lan");
    const detail = await screen.findByRole("region", { name: "Chi tiết công nợ" });
    await user.click(await within(detail).findByRole("button", { name: "Thu nợ" }));
    let dialog = await screen.findByRole("dialog", { name: "Thu nợ" });
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận thu 363.000" }));
    expect(await within(dialog).findByText(/không ghi hai lần/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Hủy" }));

    await user.click(within(detail).getByRole("button", { name: "Thu nợ" }));
    dialog = await screen.findByRole("dialog", { name: "Thu nợ" });
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận thu 363.000" }));
    expect(await screen.findByText("Phiếu PT000045 đã được lưu trước đó")).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("chủ trả nợ nhà cung cấp: gửi phiếu chi, in thì mở trang phiếu chi", async () => {
    let posted: Record<string, unknown> | undefined;
    const printWindow = { location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(printWindow as unknown as Window);
    setup("owner", {
      "POST /api/payments": ({ body }) => {
        posted = body as Record<string, unknown>;
        return Response.json(
          { id: "pc-9", code: "PC000009", amount: 2_000_000, type: "disbursement" },
          { status: 201 },
        );
      },
    });
    const user = userEvent.setup();
    renderApp("/so-no/ncc-1");
    const detail = await screen.findByRole("region", { name: "Chi tiết công nợ" });
    await user.click(await within(detail).findByRole("button", { name: "Trả nợ" }));
    const dialog = await screen.findByRole("dialog", { name: "Trả nợ" });
    await user.click(within(dialog).getByRole("checkbox", { name: "In phiếu chi" }));
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận trả 2.000.000" }));
    expect(
      await screen.findByText("Đã trả 2.000.000 · Đại lý Hưng Thịnh (PC000009)"),
    ).toBeInTheDocument();
    expect(posted).toMatchObject({ type: "disbursement", contactId: "ncc-1", amount: 2_000_000 });
    expect(open).toHaveBeenCalledOnce();
    expect(printWindow.location.href).toBe("/in/phieu-chi/pc-9");
    open.mockRestore();
    localStorage.clear();
  });
});
