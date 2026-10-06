import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  mockApi,
  type MockHandler,
  renderApp,
  sampleDebtSummary,
  sampleMe,
} from "../../test/render-app";

type Line = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  baseUnit: string;
  categoryId: string | null;
  systemQty: number;
  currentStock: number;
  stockChanged: boolean;
  actualQty: number | null;
  diff: number | null;
  reason: string | null;
  diffValue?: number | null;
};

function makeLines(): Line[] {
  return [
    {
      id: "l-tuong",
      productId: "p-tuong",
      productCode: "SP000127",
      productName: "Nước tương 500ml",
      baseUnit: "Chai",
      categoryId: null,
      systemQty: 36_000,
      currentStock: 36_000,
      stockChanged: false,
      actualQty: 36_000,
      diff: 0,
      reason: null,
      diffValue: 0,
    },
    {
      id: "l-hatnem",
      productId: "p-hatnem",
      productCode: "SP000095",
      productName: "Hạt nêm 400g",
      baseUnit: "Gói",
      categoryId: null,
      systemQty: 15_000,
      currentStock: 14_000,
      stockChanged: true,
      actualQty: 13_000,
      diff: -1_000,
      reason: null,
      diffValue: -38_000,
    },
    {
      id: "l-duong",
      productId: "p-duong",
      productCode: "SP000098",
      productName: "Đường trắng 1kg",
      baseUnit: "Gói",
      categoryId: null,
      systemQty: 3_000,
      currentStock: 3_000,
      stockChanged: false,
      actualQty: null,
      diff: null,
      reason: null,
      diffValue: null,
    },
  ];
}

function countOf(lines: Line[], status = "draft", owner = true) {
  const counted = lines.filter((l) => l.diff !== null);
  return {
    id: "kk-1",
    code: "KK000013",
    status,
    note: "Kệ gia vị",
    createdAt: Date.UTC(2026, 9, 5, 3),
    completedAt: null,
    cancelledAt: null,
    createdBy: { id: "u-owner", name: "Nguyễn Minh Anh" },
    summary: {
      total: lines.length,
      counted: counted.length,
      uncounted: lines.length - counted.length,
      matched: counted.filter((l) => l.diff === 0).length,
      increased: counted.filter((l) => (l.diff ?? 0) > 0).length,
      decreased: counted.filter((l) => (l.diff ?? 0) < 0).length,
      ...(owner ? { increaseValue: 0, decreaseValue: -38_000 } : {}),
    },
    lines: owner ? lines : lines.map(({ diffValue: _v, ...l }) => l),
  };
}

/** Server giả có trạng thái: PATCH/quét/hoàn thành đổi dữ liệu trả về ở lần GET sau. */
function setup(
  role: "owner" | "staff" = "owner",
  extra: Record<string, MockHandler> = {},
  scanDelay = 0,
) {
  const lines = makeLines();
  let status = "draft";
  const patches: unknown[] = [];
  const owner = role === "owner";
  const fetchMock = mockApi({
    "GET /api/auth/me": () => Response.json(sampleMe(role)),
    "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
    "GET /api/stock-counts/kk-1": () => Response.json(countOf(lines, status, owner)),
    "PATCH /api/stock-counts/kk-1/lines": ({ body }) => {
      patches.push(body);
      for (const p of (
        body as {
          lines: Array<{ lineId: string; actualQty: number | null; reason: string | null }>;
        }
      ).lines) {
        const l = lines.find((x) => x.id === p.lineId)!;
        l.actualQty = p.actualQty;
        l.reason = p.reason;
        l.diff = p.actualQty === null ? null : p.actualQty - l.currentStock;
      }
      return Response.json(countOf(lines, status, owner));
    },
    "POST /api/stock-counts/kk-1/scan": async () => {
      if (scanDelay) await new Promise((r) => setTimeout(r, scanDelay));
      const l = lines.find((x) => x.id === "l-duong")!;
      l.actualQty = (l.actualQty ?? 0) + 1_000;
      l.diff = l.actualQty - l.currentStock;
      return Response.json({
        lineId: l.id,
        productId: l.productId,
        productName: l.productName,
        baseUnit: l.baseUnit,
        unitName: l.baseUnit,
        added: 1_000,
        actualQty: l.actualQty,
      });
    },
    "POST /api/stock-counts/kk-1/complete": () => {
      status = "completed";
      return Response.json({
        document: countOf(lines, status, owner),
        warnings: [
          { productId: "p-hatnem", name: "Hạt nêm 400g", systemQty: 15_000, currentStock: 14_000 },
        ],
      });
    },
    ...extra,
  });
  return { fetchMock, patches };
}

const human = () => userEvent.setup({ delay: 40 });

describe("trang kiểm kho", () => {
  it("hiện tiến độ, tab và tự lưu số đếm sau khi ngừng gõ", async () => {
    const { patches } = setup();
    const user = human();
    renderApp("/kiem-kho/kk-1");

    expect(
      await screen.findByRole("heading", { name: "Phiếu kiểm kho KK000013" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Tiến độ đếm" })).toHaveAttribute(
      "aria-valuenow",
      "2",
    );
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Bị lệch/ })).toHaveTextContent("1");
    expect(screen.getByText(/Tồn đổi từ 15 → 14/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Số thực tế Đường trắng 1kg"), "3");
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(await screen.findByText("Đã lưu", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(patches).toEqual([{ lines: [{ lineId: "l-duong", actualQty: 3_000, reason: null }] }]);
  });

  it("quét mã cộng 1 vào dòng tương ứng", async () => {
    setup();
    const user = human();
    renderApp("/kiem-kho/kk-1");

    const scan = await screen.findByRole("searchbox", { name: "Tìm hàng trong phiếu" });
    await user.type(scan, "8934563000098{Enter}");
    await waitFor(() =>
      expect(screen.getByLabelText("Số thực tế Đường trắng 1kg")).toHaveValue("1"),
    );
    expect(scan).toHaveValue("");
    expect(await screen.findByText("Đường trắng 1kg: +1 Gói → 1 Gói")).toBeInTheDocument();
  });

  it("chặn hoàn thành khi dòng lệch thiếu lý do; đủ lý do thì xác nhận và cân bằng kho", async () => {
    const { fetchMock } = setup();
    const user = human();
    renderApp("/kiem-kho/kk-1");

    const complete = await screen.findByRole("button", { name: "Hoàn thành và cân bằng kho" });
    await user.click(complete);
    expect(await screen.findByText("Vui lòng chọn lý do lệch cho 1 mặt hàng")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Bị lệch/ })).toHaveAttribute("aria-selected", "true");
    const reason = screen.getByLabelText("Lý do lệch Hạt nêm 400g");
    expect(reason).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(reason).toHaveFocus());

    await user.selectOptions(reason, "Mất, thất lạc");
    await user.click(complete);
    const dialog = await screen.findByRole("dialog", { name: "Hoàn thành và cân bằng kho?" });
    expect(within(dialog).getByText(/Tồn của 1 mặt hàng đã thay đổi/)).toBeInTheDocument();
    // Lý do đã được lưu trước khi mở hộp thoại.
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/lines") && String(init?.body).includes("Mất, thất lạc"),
      ),
    ).toBe(true);

    await user.click(within(dialog).getByRole("button", { name: "Hoàn thành" }));
    expect(await screen.findByText("Đã cân bằng kho")).toBeInTheDocument();
    expect(screen.getByText(/1 mặt hàng có tồn thay đổi trong lúc kiểm/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Số thực tế Đường trắng 1kg")).not.toBeInTheDocument();
  });

  it("nhân viên: đếm được nhưng không thấy giá trị lệch và nút hoàn thành", async () => {
    setup("staff");
    renderApp("/kiem-kho/kk-1");

    expect(await screen.findByLabelText("Số thực tế Đường trắng 1kg")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Giá trị lệch" })).not.toBeInTheDocument();
    expect(screen.queryByText("Chênh lệch giá trị")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hoàn thành và cân bằng kho" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu tạm, đếm tiếp sau" })).toBeInTheDocument();
  });
});

describe("kiểm kho: các ca dễ mất số đếm", () => {
  it("quét liên tục khi mạng chậm: không bỏ lượt quét nào", async () => {
    const { fetchMock } = setup("owner", {}, 200);
    const user = userEvent.setup({ delay: null });
    renderApp("/kiem-kho/kk-1");

    const box = await screen.findByRole("searchbox", { name: "Tìm hàng trong phiếu" });
    for (let i = 0; i < 3; i++) {
      await user.clear(box);
      await user.type(box, "8934563000098{Enter}");
    }
    await waitFor(
      () => expect(screen.getByLabelText("Số thực tế Đường trắng 1kg")).toHaveValue("3"),
      { timeout: 3000 },
    );
    const scans = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/scan"));
    expect(scans).toHaveLength(3);
  });

  it("số gõ chưa hợp lệ không được tự lưu thành 'chưa đếm' và chặn hoàn thành", async () => {
    const { patches } = setup();
    const user = human();
    renderApp("/kiem-kho/kk-1");

    const input = await screen.findByLabelText("Số thực tế Đường trắng 1kg");
    await user.click(input);
    await user.paste("1.000");
    expect(input).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("button", { name: "Hoàn thành và cân bằng kho" }));
    expect(await screen.findByText(/Có ô số thực tế chưa hợp lệ/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
    await new Promise((r) => setTimeout(r, 1000));
    expect(patches).toEqual([]);
  });
});

describe("tạo phiếu kiểm từ trang Hàng hóa", () => {
  it("theo các mặt hàng đang chọn", async () => {
    let posted: unknown;
    mockApi({
      "GET /api/auth/me": () => Response.json(sampleMe("owner")),
      "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
      "GET /api/categories": () => Response.json({ items: [] }),
      "GET /api/products": () =>
        Response.json({
          items: [
            {
              id: "p-duong",
              code: "SP000098",
              barcode: null,
              name: "Đường trắng 1kg",
              categoryId: null,
              categoryName: null,
              baseUnit: "Gói",
              costPrice: 20_000,
              salePrice: 25_000,
              stock: 3_000,
              minStock: 0,
              allowNegative: false,
              isActive: true,
              showInPos: true,
              imageKey: null,
              updatedAt: 0,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
          counts: { all: 1, low: 0, out: 0, inactive: 0 },
          stockValue: 60_000,
        }),
      "POST /api/stock-counts": ({ body }) => {
        posted = body;
        return Response.json(countOf(makeLines()), { status: 201 });
      },
      "GET /api/stock-counts/kk-1": () => Response.json(countOf(makeLines())),
    });
    const user = human();
    const { router } = renderApp("/hang-hoa");

    await user.click(await screen.findByRole("checkbox", { name: /Chọn Đường trắng 1kg/ }));
    const bar = screen.getByRole("region", { name: "Thao tác với các hàng đã chọn" });
    await user.click(within(bar).getByRole("button", { name: "Kiểm kho" }));
    const dialog = await screen.findByRole("dialog", { name: "Tạo phiếu kiểm kho" });
    expect(
      within(dialog).getByRole("radio", { name: /Các mặt hàng đang chọn \(1\)/ }),
    ).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Tạo phiếu và bắt đầu đếm" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/kiem-kho/kk-1"));
    expect(posted).toEqual({ categoryId: null, productIds: ["p-duong"], note: null });
  });
});
