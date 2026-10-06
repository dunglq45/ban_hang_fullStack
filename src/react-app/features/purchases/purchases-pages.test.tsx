import { screen, waitFor, within } from "@testing-library/react";
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

const fishSauce = {
  id: "p-mam",
  code: "SP000052",
  barcode: "8934563000052",
  name: "Nước mắm 500ml",
  categoryId: null,
  categoryName: null,
  baseUnit: "Chai",
  costPrice: 31_000,
  salePrice: 38_000,
  stock: 2_000,
  minStock: 6_000,
  allowNegative: false,
  isActive: true,
  showInPos: true,
  imageKey: null,
  updatedAt: 0,
  note: null,
  createdAt: 0,
  units: [
    {
      id: "u1",
      productId: "p-mam",
      name: "Thùng",
      factor: 12,
      salePrice: null,
      barcode: "THUNG52",
    },
  ],
  sold30d: 0,
  lastPurchase: null,
};

const supplier = {
  id: "ncc-1",
  type: "supplier",
  code: "NCC000001",
  name: "Đại lý Hưng Thịnh",
  phone: null,
  address: null,
  note: null,
  debt: 1_500_000,
  debtLimit: null,
  debtSince: null,
  isActive: true,
  createdAt: 0,
};

function documentOf(patch: Record<string, unknown> = {}) {
  return {
    id: "pn-1",
    type: "purchase",
    code: "PN000058",
    status: "draft",
    subtotal: 744_000,
    discount: 0,
    total: 744_000,
    paid: 700_000,
    debtAmount: 44_000,
    paymentMethod: "cash",
    note: "HĐ 123",
    createdAt: Date.UTC(2026, 9, 5, 3),
    completedAt: null,
    cancelledAt: null,
    contactId: "ncc-1",
    contact: {
      id: "ncc-1",
      code: "NCC000001",
      name: "Đại lý Hưng Thịnh",
      phone: null,
      address: null,
      debt: 1_500_000,
    },
    createdBy: { id: "u-owner", name: "Nguyễn Minh Anh" },
    cancelledBy: null,
    store: null,
    lines: [
      {
        id: "l1",
        productId: "p-mam",
        productCode: "SP000052",
        productName: "Nước mắm 500ml",
        unitName: "Thùng",
        factor: 12,
        qty: 2_000,
        baseQty: 24_000,
        unitPrice: 372_000,
        lineTotal: 744_000,
        costPrice: 31_000,
        systemQty: null,
        actualQty: null,
        reason: null,
      },
    ],
    ...patch,
  };
}

function setup(extra: Record<string, MockHandler> = {}) {
  return mockApi({
    "GET /api/auth/me": () => Response.json(sampleMe("owner")),
    "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
    "GET /api/products/p-mam": () => Response.json(fishSauce),
    "GET /api/contacts": () => Response.json({ items: [supplier], total: 1, page: 1, pageSize: 8 }),
    ...extra,
  });
}

const human = () => userEvent.setup({ delay: 40 });

describe("tạo phiếu nhập", () => {
  it("thêm sẵn hàng từ ?productId, đổi đơn vị, chọn NCC, trả thiếu rồi hoàn thành", async () => {
    let posted: unknown;
    const fetchMock = setup({
      "POST /api/purchases": ({ body }) => {
        posted = body;
        return Response.json(documentOf({ id: "pn-new", status: "completed" }), { status: 201 });
      },
      "GET /api/documents/pn-new": () =>
        Response.json(documentOf({ id: "pn-new", status: "completed" })),
    });
    const user = human();
    const { router } = renderApp("/nhap-hang/moi?productId=p-mam");

    const table = await screen.findByRole("table", { name: "Hàng trong phiếu" });
    expect(within(table).getByText("Tồn hiện tại: 2 chai")).toBeInTheDocument();
    expect(within(table).getByLabelText("Giá nhập Nước mắm 500ml")).toHaveValue("31.000");

    await user.selectOptions(within(table).getByLabelText("Đơn vị nhập Nước mắm 500ml"), "Thùng");
    expect(within(table).getByLabelText("Giá nhập Nước mắm 500ml")).toHaveValue("372.000");
    const qty = within(table).getByLabelText("Số lượng Nước mắm 500ml");
    await user.clear(qty);
    await user.type(qty, "2");
    expect(within(table).getByText("2 thùng = 24 chai · tồn 2 chai")).toBeInTheDocument();

    // Trả thiếu mà chưa chọn NCC: báo lỗi, không gửi.
    await user.type(screen.getByLabelText("Đã trả"), "700000");
    await user.click(screen.getByRole("button", { name: "Hoàn thành nhập hàng" }));
    expect(await screen.findByText(/cần chọn nhà cung cấp/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

    await user.type(screen.getByRole("combobox", { name: "Nhà cung cấp" }), "hung");
    await user.click(await screen.findByRole("option", { name: /Đại lý Hưng Thịnh/ }));
    expect(screen.getByText("Mình đang nợ 1.500.000")).toBeInTheDocument();
    const aside = screen.getByRole("complementary", { name: "Thông tin phiếu nhập" });
    expect(within(aside).getByText("44.000")).toBeInTheDocument();
    expect(within(aside).getByText("1.544.000")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hoàn thành nhập hàng" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/nhap-hang/pn-new"));
    expect(posted).toMatchObject({
      status: "completed",
      contactId: "ncc-1",
      paid: 700_000,
      discount: 0,
      lines: [{ productId: "p-mam", unitName: "Thùng", qty: 2_000, unitPrice: 372_000 }],
    });
    expect((posted as { idempotencyKey: string }).idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByRole("heading", { name: "Phiếu nhập PN000058" })).toBeInTheDocument();
  });

  it("quét mã vạch thùng thêm theo đơn vị thùng, quét lại thì cộng số lượng", async () => {
    setup({
      "GET /api/products": () =>
        Response.json({ items: [], total: 0, page: 1, pageSize: 8, counts: {} }),
      "GET /api/products/lookup": () =>
        Response.json({ product: fishSauce, unit: fishSauce.units[0] }),
    });
    const user = human();
    renderApp("/nhap-hang/moi");

    const search = await screen.findByRole("combobox", { name: "Thêm hàng vào phiếu" });
    await user.type(search, "THUNG52{Enter}");
    const table = await screen.findByRole("table", { name: "Hàng trong phiếu" });
    expect(within(table).getByLabelText("Đơn vị nhập Nước mắm 500ml")).toHaveValue("Thùng");
    await user.type(search, "THUNG52{Enter}");
    await waitFor(() =>
      expect(within(table).getByLabelText("Số lượng Nước mắm 500ml")).toHaveValue("2"),
    );
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });
});

describe("phiếu nháp và phiếu đã hoàn thành", () => {
  it("phiếu nháp: Lưu nháp gửi PUT; Hoàn thành gửi PUT rồi complete", async () => {
    const calls: string[] = [];
    let status = "draft";
    setup({
      "GET /api/documents/pn-1": () => Response.json(documentOf({ status })),
      "PUT /api/purchases/pn-1": ({ body }) => {
        calls.push(`PUT ${JSON.stringify((body as { lines: unknown[] }).lines)}`);
        return Response.json(documentOf());
      },
      "POST /api/purchases/pn-1/complete": () => {
        calls.push("COMPLETE");
        status = "completed";
        return Response.json(documentOf({ status: "completed" }));
      },
    });
    const user = human();
    renderApp("/nhap-hang/pn-1");

    const table = await screen.findByRole("table", { name: "Hàng trong phiếu" });
    expect(within(table).getByLabelText("Số lượng Nước mắm 500ml")).toHaveValue("2");
    expect(screen.getByLabelText("Đã trả")).toHaveValue("700.000");
    expect(screen.getByDisplayValue("PN000058")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lưu nháp" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toContain('"unitName":"Thùng"');

    await user.click(screen.getByRole("button", { name: "Hoàn thành nhập hàng" }));
    await waitFor(() => expect(calls).toEqual([calls[0], calls[0], "COMPLETE"]));
    expect(await screen.findByText("Đã nhập kho")).toBeInTheDocument();
    // Chỉ xem: không còn ô nhập.
    expect(screen.queryByLabelText("Số lượng Nước mắm 500ml")).not.toBeInTheDocument();
  });

  it("phiếu nháp đã được hoàn thành ở lần bấm trước (mất phản hồi): chuyển sang màn xem", async () => {
    let status = "draft";
    setup({
      "GET /api/documents/pn-1": () => Response.json(documentOf({ status })),
      "PUT /api/purchases/pn-1": () => {
        status = "completed";
        return apiError(409, "INVALID_STATUS", "Chỉ sửa được phiếu nhập nháp");
      },
    });
    const user = human();
    renderApp("/nhap-hang/pn-1");

    await user.click(await screen.findByRole("button", { name: "Hoàn thành nhập hàng" }));
    expect(await screen.findByRole("heading", { name: "Phiếu nhập PN000058" })).toBeInTheDocument();
    expect(screen.getByText("Đã nhập kho")).toBeInTheDocument();
  });

  it("hủy phiếu đã hoàn thành: hàng đã bán thì hiện lỗi trong hộp thoại", async () => {
    setup({
      "GET /api/documents/pn-1": () => Response.json(documentOf({ status: "completed" })),
      "POST /api/documents/pn-1/cancel": () =>
        apiError(
          409,
          "CANNOT_CANCEL_STOCK_USED",
          "Không hủy được: hàng của phiếu đã bán bớt (Nước mắm 500ml: còn 10, cần trừ 24)",
        ),
    });
    const user = human();
    renderApp("/nhap-hang/pn-1");

    await user.click(await screen.findByRole("button", { name: "Hủy phiếu" }));
    const dialog = await screen.findByRole("dialog", { name: "Hủy phiếu nhập PN000058?" });
    await user.click(within(dialog).getByRole("button", { name: "Hủy phiếu" }));
    expect(await within(dialog).findByText(/còn 10, cần trừ 24/)).toBeInTheDocument();
  });
});

describe("danh sách phiếu nhập", () => {
  it("lọc theo trạng thái gửi lên API và ghi vào URL", async () => {
    const fetchMock = setup({
      "GET /api/documents": () =>
        Response.json({
          items: [
            {
              id: "pn-1",
              type: "purchase",
              code: "PN000058",
              status: "completed",
              contactId: "ncc-1",
              contactName: "Đại lý Hưng Thịnh",
              total: 744_000,
              paid: 700_000,
              debtAmount: 44_000,
              paymentMethod: "cash",
              createdAt: Date.UTC(2026, 9, 5, 3),
              createdByName: "Nguyễn Minh Anh",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
    });
    const user = human();
    const { router } = renderApp("/nhap-hang");

    const table = await screen.findByRole("table", { name: "Phiếu nhập hàng" });
    expect(within(table).getByRole("link", { name: "PN000058" })).toHaveAttribute(
      "href",
      "/nhap-hang/pn-1",
    );
    expect(within(table).getByText("44.000")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Phiếu nháp/ }));
    await waitFor(() => expect(router.state.location.search).toBe("?trang-thai=draft"));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => {
          const u = new URL(String(url), "http://localhost");
          return (
            u.pathname === "/api/documents" &&
            u.searchParams.get("status") === "draft" &&
            u.searchParams.get("type") === "purchase"
          );
        }),
      ).toBe(true),
    );
  });
});
