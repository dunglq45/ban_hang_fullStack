import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DAY_MS, vnDateKey, vnDayStart } from "../../../shared/period";
import {
  apiError,
  mockApi,
  type MockHandler,
  renderApp,
  sampleDebtSummary,
  sampleMe,
} from "../../test/render-app";

const overview = {
  range: { from: 0, to: DAY_MS },
  revenue: 3_245_000,
  orders: 42,
  averageOrder: 77_262,
  costOfGoods: 2_533_000,
  grossProfit: 712_000,
  margin: 21.9,
  receivable: { amount: 4_873_000, customers: 14, overdueAmount: 1_200_000, overdueCustomers: 2 },
  restock: { total: 2, out: 1, low: 1 },
};

function daily() {
  const today = vnDayStart(Date.now());
  const values = [2_800_000, 3_100_000, 2_600_000, 3_400_000, 4_200_000, 4_600_000, 3_245_000];
  const items = values.map((revenue, i) => {
    const from = today - (6 - i) * DAY_MS;
    return { date: vnDateKey(from), from, revenue, orders: 30 + i };
  });
  return {
    range: { from: items[0]!.from, to: today + DAY_MS },
    items,
    total: values.reduce((a, b) => a + b, 0),
    orders: 0,
  };
}

const restock = {
  items: [
    {
      id: "p-bot",
      code: "SP000010",
      name: "Bột giặt 3kg",
      baseUnit: "Gói",
      stock: 0,
      minStock: 5_000,
      costPrice: 120_000,
      status: "out",
    },
    {
      id: "p-mam",
      code: "SP000052",
      name: "Nước mắm 500ml",
      baseUnit: "Chai",
      stock: 2_000,
      minStock: 6_000,
      costPrice: 31_000,
      status: "low",
    },
  ],
  total: 2,
  counts: { out: 1, low: 1 },
  page: 1,
  pageSize: 100,
};

const top = {
  range: { from: 0, to: DAY_MS },
  items: [
    {
      rank: 1,
      productId: "p-mi",
      code: "SP000001",
      name: "Mì gói tôm chua cay",
      baseUnit: "Gói",
      qty: 46_000,
      revenue: 207_000,
    },
  ],
};

function product(id: string, name: string, baseUnit: string, stock: number, costPrice: number) {
  return {
    id,
    code: id,
    barcode: null,
    name,
    categoryId: null,
    categoryName: null,
    baseUnit,
    costPrice,
    salePrice: costPrice,
    stock,
    minStock: 0,
    allowNegative: false,
    isActive: true,
    showInPos: true,
    imageKey: null,
    note: null,
    createdAt: 0,
    updatedAt: 0,
    units: [],
    sold30d: 0,
    lastPurchase: null,
  };
}

function setup(extra: Record<string, MockHandler> = {}, role: "owner" | "staff" = "owner") {
  return mockApi({
    "GET /api/auth/me": () => Response.json(sampleMe(role)),
    "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
    "GET /api/reports/overview": () => Response.json(overview),
    "GET /api/reports/revenue-daily": () => Response.json(daily()),
    "GET /api/reports/top-products": () => Response.json(top),
    "GET /api/reports/restock": () => Response.json(restock),
    "GET /api/products/p-bot": () =>
      Response.json(product("p-bot", "Bột giặt 3kg", "Gói", 0, 120_000)),
    "GET /api/products/p-mam": () =>
      Response.json(product("p-mam", "Nước mắm 500ml", "Chai", 2_000, 31_000)),
    ...extra,
  });
}

function queryOf(fetchMock: ReturnType<typeof setup>, path: string) {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), "http://localhost"))
    .filter((u) => u.pathname === path)
    .map((u) => Object.fromEntries(u.searchParams));
}

describe("trang Tổng quan", () => {
  it("hiện 4 ô số liệu, biểu đồ 7 ngày, hàng cần nhập và bán chạy", async () => {
    setup();
    renderApp("/tong-quan");

    expect(await screen.findByText("3.245.000")).toBeInTheDocument();
    expect(screen.getByText("42 đơn · TB 77.262 / đơn")).toBeInTheDocument();
    expect(screen.getByText("Biên lợi nhuận 21,9%")).toBeInTheDocument();
    expect(screen.getByText("2 khách quá 30 ngày")).toBeInTheDocument();
    expect(screen.getByText("1 mặt hàng đã hết")).toBeInTheDocument();

    const chart = screen.getByRole("region", { name: "Doanh thu 7 ngày" });
    expect(await within(chart).findByText("4,6tr")).toBeInTheDocument();
    expect(within(chart).getByText("23.945.000")).toBeInTheDocument();
    expect(within(chart).getByText("Hôm nay")).toBeInTheDocument();

    const restockTable = await screen.findByRole("table", { name: "Hàng cần nhập thêm" });
    expect(within(restockTable).getByText("Bột giặt 3kg")).toBeInTheDocument();
    expect(within(restockTable).getByText("Hết hàng")).toBeInTheDocument();
    expect(within(restockTable).getByText("Sắp hết")).toBeInTheDocument();

    const topTable = await screen.findByRole("table", { name: "Bán chạy hôm nay" });
    expect(within(topTable).getByText("46 gói")).toBeInTheDocument();
    expect(within(topTable).getByText("207.000")).toBeInTheDocument();
  });

  it("rê chuột / focus vào cột hiện tooltip số chính xác", async () => {
    setup();
    renderApp("/tong-quan");
    const chart = await screen.findByRole("region", { name: "Doanh thu 7 ngày" });
    const items = await within(chart).findAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items[6]).toHaveAccessibleName(/Hôm nay .*3\.245\.000 đ · 36 đơn/);
    fireEvent.focus(items[5]!);
    expect(within(chart).getByRole("tooltip")).toHaveTextContent("4.600.000 đ · 35 đơn");
    fireEvent.blur(items[5]!);
    expect(within(chart).queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("đổi kỳ: gọi lại báo cáo theo kỳ; Tùy chọn gửi from/to, khoảng sai thì báo lỗi", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    const { router } = renderApp("/tong-quan");
    await screen.findByText("3.245.000");

    await user.click(screen.getByRole("button", { name: "7 ngày" }));
    await waitFor(() =>
      expect(queryOf(fetchMock, "/api/reports/overview")).toContainEqual({ period: "7d" }),
    );
    expect(queryOf(fetchMock, "/api/reports/top-products")).toContainEqual(
      expect.objectContaining({ period: "7d" }),
    );
    expect(await screen.findByRole("table", { name: "Bán chạy 7 ngày qua" })).toBeInTheDocument();
    expect(router.state.location.search).toBe("?ky=7d");

    await user.click(screen.getByRole("button", { name: "Tùy chọn" }));
    const from = screen.getByLabelText("Từ ngày");
    const to = screen.getByLabelText("Đến ngày");
    fireEvent.change(from, { target: { value: "2026-09-01" } });
    fireEvent.change(to, { target: { value: "2026-09-30" } });
    await waitFor(() =>
      expect(queryOf(fetchMock, "/api/reports/overview")).toContainEqual({
        from: "2026-09-01",
        to: "2026-09-30",
      }),
    );

    const before = queryOf(fetchMock, "/api/reports/overview").length;
    fireEvent.change(to, { target: { value: "2026-08-01" } });
    expect(await screen.findByText("Ngày kết thúc phải sau ngày bắt đầu")).toBeInTheDocument();
    expect(to).toHaveAttribute("aria-invalid", "true");
    expect(queryOf(fetchMock, "/api/reports/overview")).toHaveLength(before);
  });

  it("Tạo phiếu nhập: mở phiếu nhập mới điền sẵn các hàng cần nhập với số lượng gợi ý", async () => {
    setup();
    const user = userEvent.setup();
    const { router } = renderApp("/tong-quan");
    await screen.findByRole("table", { name: "Hàng cần nhập thêm" });
    await user.click(screen.getByRole("button", { name: "Tạo phiếu nhập" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/nhap-hang/moi"));
    const table = await screen.findByRole("table", { name: "Hàng trong phiếu" });
    await waitFor(() =>
      expect(within(table).getByLabelText("Số lượng Nước mắm 500ml")).toHaveValue("4"),
    );
    expect(within(table).getByLabelText("Số lượng Bột giặt 3kg")).toHaveValue("5");
    // State đã được xóa: tải lại/quay lại không điền lần nữa.
    expect(router.state.location.state).toBeNull();
  });

  it("Tạo phiếu nhập: hàng tải lỗi thì báo, hàng còn lại vẫn điền; rời trang phải xác nhận", async () => {
    setup({
      "GET /api/products/p-bot": () => apiError(404, "NOT_FOUND", "Không tìm thấy hàng hóa"),
    });
    const user = userEvent.setup();
    renderApp("/tong-quan");
    await screen.findByRole("table", { name: "Hàng cần nhập thêm" });
    await user.click(screen.getByRole("button", { name: "Tạo phiếu nhập" }));

    expect(
      await screen.findByText("Không tải được 1 mặt hàng, hãy thêm lại bằng tay"),
    ).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Hàng trong phiếu" });
    expect(within(table).getByLabelText("Số lượng Nước mắm 500ml")).toHaveValue("4");
    expect(within(table).queryByText("Bột giặt 3kg")).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Nhập hàng" }));
    expect(
      await screen.findByRole("dialog", { name: "Rời trang khi chưa lưu?" }),
    ).toBeInTheDocument();
  });

  it("nút Xuất báo cáo tải đủ 4 nhóm số liệu mới nhất (không dùng cache đang hiện)", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    renderApp("/tong-quan");
    await screen.findByText("3.245.000");
    fetchMock.mockClear();

    await user.click(screen.getByRole("button", { name: "Xuất báo cáo" }));
    await waitFor(() => {
      const paths = fetchMock.mock.calls.map(
        ([input]) => new URL(String(input), "http://localhost").pathname,
      );
      expect(paths).toEqual(
        expect.arrayContaining([
          "/api/reports/overview",
          "/api/reports/revenue-daily",
          "/api/reports/top-products",
          "/api/reports/restock",
        ]),
      );
    });
  });

  it("nhân viên không vào được, chuyển về Bán hàng", async () => {
    setup(
      {
        "GET /api/products/pos": () => Response.json({ items: [] }),
        "GET /api/categories": () => Response.json({ items: [] }),
      },
      "staff",
    );
    const { router } = renderApp("/tong-quan");
    await waitFor(() => expect(router.state.location.pathname).toBe("/ban-hang"));
  });
});
