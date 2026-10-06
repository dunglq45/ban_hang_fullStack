import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
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
  categoryId: "c-giavi",
  categoryName: "Gia vị",
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
};

const detail = {
  ...fishSauce,
  note: "Kệ 2",
  createdAt: Date.UTC(2026, 8, 1, 3),
  units: [
    { id: "u1", productId: "p-mam", name: "Thùng", factor: 12, salePrice: null, barcode: null },
  ],
  sold30d: 64_000,
  lastPurchase: { id: "pn-55", code: "PN000055", createdAt: Date.UTC(2026, 8, 28, 3) },
};

const categories = {
  items: [
    { id: "c-giavi", name: "Gia vị", sortOrder: 0, productCount: 1 },
    { id: "c-douong", name: "Đồ uống", sortOrder: 1, productCount: 0 },
  ],
};

function withoutCost<T extends { costPrice: number; lastPurchase?: unknown }>(p: T) {
  // Khớp đúng những gì API trả cho staff: không có costPrice lẫn lastPurchase (gắn với giá vốn).
  const { costPrice: _hiddenCost, lastPurchase: _hiddenPurchase, ...rest } = p;
  return rest;
}

function setup(role: "owner" | "staff", extra: Record<string, MockHandler> = {}) {
  const owner = role === "owner";
  return mockApi({
    "GET /api/auth/me": () => Response.json(sampleMe(role)),
    "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
    "GET /api/categories": () => Response.json(categories),
    "GET /api/products": () =>
      Response.json({
        items: [owner ? fishSauce : withoutCost(fishSauce)],
        total: 1,
        page: 1,
        pageSize: 20,
        counts: { all: 126, low: 4, out: 1, inactive: 3 },
        ...(owner ? { stockValue: 48_620_000 } : {}),
      }),
    "GET /api/products/p-mam": () => Response.json(owner ? detail : withoutCost(detail)),
    "GET /api/products/p-mam/movements": () =>
      Response.json({
        items: [
          {
            id: "m1",
            createdAt: Date.UTC(2026, 9, 5, 2, 12),
            type: "sale",
            qtyChange: -1_000,
            stockAfter: 2_000,
            note: null,
            documentId: "hd-229",
            documentCode: "HD000229",
            documentType: "sale",
            contactId: null,
            contactName: null,
            ...(owner ? { unitCost: 31_000 } : {}),
          },
          {
            id: "m2",
            createdAt: Date.UTC(2026, 8, 28, 3),
            type: "purchase",
            qtyChange: 12_000,
            stockAfter: 12_000,
            note: null,
            documentId: "pn-55",
            documentCode: "PN000055",
            documentType: "purchase",
            contactId: "ncc-1",
            contactName: "Đại lý Hưng Thịnh",
            ...(owner ? { unitCost: 31_000 } : {}),
          },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
      }),
    ...extra,
  });
}

const human = () => userEvent.setup({ delay: 20 });

describe("danh sách hàng hóa", () => {
  it("chủ cửa hàng: thấy giá vốn, giá trị tồn, số đếm ở tab; tìm kiếm cập nhật URL và gọi API", async () => {
    const fetchMock = setup("owner");
    const user = human();
    const { router } = renderApp("/hang-hoa");

    const table = await screen.findByRole("table", { name: "Danh sách hàng hóa" });
    expect(within(table).getByRole("columnheader", { name: "Giá vốn" })).toBeInTheDocument();
    expect(within(table).getByText("31.000")).toBeInTheDocument();
    expect(within(table).getByText("Sắp hết")).toBeInTheDocument();
    expect(screen.getByText("48.620.000")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Sắp hết\s*4/ })).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Tìm hàng hóa" }), "nuoc mam");
    await waitFor(() => expect(router.state.location.search).toContain("q=nuoc+mam"));
    const calls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calls.some((u) => u.includes("/api/products?") && u.includes("q=nuoc+mam"))).toBe(true);

    await user.click(screen.getByRole("tab", { name: /Hết hàng/ }));
    expect(router.state.location.search).toContain("status=out");
  });

  it("ô tìm đồng bộ lại khi URL đổi từ nơi khác (menu sidebar, nút Back)", async () => {
    setup("owner");
    const { router } = renderApp("/hang-hoa?q=nuoc+mam");
    await screen.findByRole("table", { name: "Danh sách hàng hóa" });
    const search = screen.getByRole("searchbox", { name: "Tìm hàng hóa" });
    expect(search).toHaveValue("nuoc mam");

    // Bấm lại "Hàng hóa" ở sidebar: điều hướng ngoài ô tìm, không phải do gõ.
    await router.navigate("/hang-hoa");
    await waitFor(() => expect(search).toHaveValue(""));

    await router.navigate("/hang-hoa?q=gao");
    await waitFor(() => expect(search).toHaveValue("gao"));
  });

  it("nhân viên: không có giá vốn, giá trị tồn, nút thêm/nhập", async () => {
    setup("staff");
    renderApp("/hang-hoa");
    const table = await screen.findByRole("table", { name: "Danh sách hàng hóa" });
    expect(within(table).queryByRole("columnheader", { name: "Giá vốn" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Giá trị tồn kho/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Thêm hàng hóa/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Chọn tất cả hàng trong trang" }),
    ).not.toBeInTheDocument();
  });

  it("bấm vào dòng mở chi tiết; menu thao tác Ngừng bán gửi PUT đủ thông tin, chỉ đổi isActive", async () => {
    const puts: unknown[] = [];
    setup("owner", {
      "PUT /api/products/p-mam": ({ body }) => {
        puts.push(body);
        return Response.json({ ...detail, isActive: false });
      },
    });
    const user = human();
    const { router } = renderApp("/hang-hoa");
    await screen.findByRole("table", { name: "Danh sách hàng hóa" });

    await user.click(screen.getByRole("button", { name: "Thao tác với Nước mắm 500ml" }));
    await user.click(screen.getByRole("menuitem", { name: "Ngừng bán" }));
    expect(await screen.findByText("Đã ngừng bán Nước mắm 500ml")).toBeInTheDocument();
    expect(puts).toEqual([
      {
        name: "Nước mắm 500ml",
        code: "SP000052",
        barcode: "8934563000052",
        categoryId: "c-giavi",
        baseUnit: "Chai",
        salePrice: 38_000,
        minStock: 6_000,
        allowNegative: false,
        isActive: false,
        showInPos: true,
        note: "Kệ 2",
        units: [{ name: "Thùng", factor: 12, salePrice: null, barcode: null }],
      },
    ]);
    expect(router.state.location.pathname).toBe("/hang-hoa");

    await user.click(screen.getByText("Gia vị", { selector: "td" }));
    expect(router.state.location.pathname).toBe("/hang-hoa/p-mam");
  });
});

describe("chi tiết hàng hóa", () => {
  it("KPI, lịch sử kho có link chứng từ; chủ cửa hàng thấy giá vốn và lãi", async () => {
    setup("owner");
    renderApp("/hang-hoa/p-mam");
    expect(
      await screen.findByRole("heading", { level: 2, name: "Nước mắm 500ml" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sắp hết")).toBeInTheDocument();
    expect(screen.getByText("Cảnh báo dưới 6 chai")).toBeInTheDocument();
    expect(screen.getByText("Cập nhật 28/09/2026 theo PN000055")).toBeInTheDocument();
    expect(screen.getByText("Lãi 7.000 / chai · 18,4%")).toBeInTheDocument();
    expect(screen.getByText("64 chai")).toBeInTheDocument();

    const history = await screen.findByRole("table", { name: "Lịch sử kho" });
    expect(within(history).getByRole("link", { name: "PN000055" })).toHaveAttribute(
      "href",
      "/nhap-hang/pn-55",
    );
    expect(within(history).getByText("Đại lý Hưng Thịnh")).toBeInTheDocument();
    expect(within(history).getByText("Khách lẻ")).toBeInTheDocument();
    expect(within(history).getByText("+12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nhập thêm hàng/ })).toHaveAttribute(
      "href",
      "/nhap-hang/moi?productId=p-mam",
    );

    await human().click(screen.getByRole("tab", { name: "Đơn vị và giá" }));
    const units = screen.getByRole("table", { name: "Đơn vị và giá" });
    expect(within(units).getByText("456.000")).toBeInTheDocument(); // 38.000 × 12
  });

  it("nhân viên: không thấy giá vốn, lãi và các nút sửa", async () => {
    setup("staff");
    renderApp("/hang-hoa/p-mam");
    await screen.findByRole("heading", { level: 2, name: "Nước mắm 500ml" });
    expect(screen.queryByText("Giá vốn bình quân")).not.toBeInTheDocument();
    expect(screen.queryByText(/Lãi/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sửa thông tin" })).not.toBeInTheDocument();
    const history = await screen.findByRole("table", { name: "Lịch sử kho" });
    expect(
      within(history).queryByRole("columnheader", { name: "Giá vốn" }),
    ).not.toBeInTheDocument();
  });
});

describe("thêm hàng hóa", () => {
  it("báo lỗi theo ô, gửi đúng dữ liệu, 'Lưu và thêm tiếp' làm trống form", async () => {
    const posts: unknown[] = [];
    setup("owner", {
      "POST /api/products": ({ body }) => {
        posts.push(body);
        return Response.json(
          { ...detail, id: "p-new", code: "SP000128", name: "Nước tương 500ml" },
          { status: 201 },
        );
      },
    });
    const user = human();
    const { router } = renderApp("/hang-hoa/moi");
    const name = await screen.findByLabelText(/Tên hàng/);

    await user.click(screen.getByRole("button", { name: "Lưu hàng hóa" }));
    expect(await screen.findByText("Vui lòng nhập tên hàng")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập giá bán")).toBeInTheDocument();
    expect(posts).toHaveLength(0);

    await user.type(name, "Nước tương 500ml");
    await user.type(screen.getByLabelText(/Đơn vị cơ bản/), "Chai");
    await user.type(screen.getByLabelText("Giá vốn"), "21000");
    await user.type(screen.getByLabelText(/Giá bán lẻ/), "26000");
    expect(screen.getByText("5.000")).toBeInTheDocument();
    expect(screen.getByText("19,2%")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Tồn kho ban đầu/), "24");
    await user.click(screen.getByRole("button", { name: /Thêm đơn vị quy đổi/ }));
    await user.type(screen.getByLabelText("Đơn vị quy đổi"), "Thùng");
    await user.type(screen.getByLabelText(/Số chai mỗi đơn vị/), "24");

    await user.click(screen.getByRole("button", { name: "Lưu và thêm tiếp" }));
    expect(await screen.findByText("Đã thêm Nước tương 500ml (SP000128)")).toBeInTheDocument();
    expect(posts[0]).toEqual({
      name: "Nước tương 500ml",
      code: null,
      barcode: null,
      categoryId: null,
      baseUnit: "Chai",
      salePrice: 26_000,
      minStock: 0,
      allowNegative: false,
      isActive: true,
      showInPos: true,
      note: null,
      units: [{ name: "Thùng", factor: 24, salePrice: null, barcode: null }],
      costPrice: 21_000,
      openingStock: 24_000,
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(screen.getByLabelText(/Tên hàng/)).toHaveValue("");
    expect(router.state.location.pathname).toBe("/hang-hoa/moi");
  });

  it("'Lưu hàng hóa' đứng trước 'Lưu và thêm tiếp' trong DOM, để Enter trong ô nhập gửi đúng nút", async () => {
    // jsdom không mô phỏng việc Enter tự gửi form (implicit submission) nên không test được bằng
    // cách gõ Enter rồi xem điều hướng; trình duyệt chọn nút submit ĐẦU TIÊN THEO DOM khi có
    // nhiều nút cùng gắn với một <form> (không theo vị trí hiển thị) — xác minh thật bằng Chrome
    // ở scripts/e2e. Ở đây chỉ khóa lại thứ tự DOM.
    setup("owner");
    renderApp("/hang-hoa/moi");
    await screen.findByLabelText(/Tên hàng/);
    const buttons = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("form") !== null)
      .map((b) => b.textContent);
    expect(buttons).toEqual(["Lưu hàng hóa", "Lưu và thêm tiếp"]);
  });

  it("gửi lại do lỗi mạng giữ nguyên idempotencyKey; sau khi lưu xong thì đổi key", async () => {
    const keys: string[] = [];
    let fail = true;
    setup("owner", {
      "POST /api/products": ({ body }) => {
        const key = (body as { idempotencyKey: string }).idempotencyKey;
        keys.push(key);
        if (fail) {
          fail = false;
          throw new TypeError("Failed to fetch");
        }
        return Response.json(
          { ...detail, id: "p-new", code: "SP000128", name: "Bút bi" },
          { status: 201 },
        );
      },
    });
    const user = human();
    renderApp("/hang-hoa/moi");
    await user.type(await screen.findByLabelText(/Tên hàng/), "Bút bi");
    await user.type(screen.getByLabelText(/Đơn vị cơ bản/), "Cây");
    await user.type(screen.getByLabelText(/Giá bán lẻ/), "5000");
    await user.click(screen.getByRole("button", { name: "Lưu hàng hóa" }));
    expect(await screen.findByText(/Không kết nối được máy chủ/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lưu hàng hóa" }));
    await screen.findByText("Đã thêm Bút bi (SP000128)");
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("rời trang khi chưa lưu thì hỏi lại", async () => {
    setup("owner");
    const user = human();
    const { router } = renderApp("/hang-hoa/moi");
    await user.type(await screen.findByLabelText(/Tên hàng/), "Bút bi");
    await user.click(screen.getByRole("link", { name: "Hủy" }));
    const dialog = await screen.findByRole("dialog", { name: "Rời trang khi chưa lưu?" });
    await user.click(within(dialog).getByRole("button", { name: "Ở lại" }));
    expect(router.state.location.pathname).toBe("/hang-hoa/moi");

    await user.click(screen.getByRole("link", { name: "Hủy" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Rời trang" }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/hang-hoa"));
  });

  it("máy quét ở ô mã vạch: Enter không gửi form", async () => {
    const posts: unknown[] = [];
    setup("owner", {
      "POST /api/products": ({ body }) => {
        posts.push(body);
        return Response.json(detail, { status: 201 });
      },
    });
    const user = human();
    renderApp("/hang-hoa/moi");
    await user.type(await screen.findByLabelText(/Mã vạch/), "8936017361042{Enter}");
    expect(screen.queryByText("Vui lòng nhập tên hàng")).not.toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });
});

describe("nhập từ Excel", () => {
  function excelFile(rows: unknown[][]) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Hàng hóa");
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return new File([data], "hang-hoa.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  it("xem trước và báo lỗi từng dòng, chỉ gửi dòng hợp lệ, hiện kết quả kèm lỗi từ server", async () => {
    const sent: unknown[] = [];
    setup("owner", {
      "POST /api/products/import": ({ body }) => {
        const rows = (body as { rows: unknown[] }).rows;
        sent.push(...rows);
        return Response.json({
          total: rows.length,
          succeeded: 1,
          failed: 1,
          createdCategories: ["Bánh kẹo"],
          rows: [
            { row: 1, ok: true, id: "x1", code: "SP000200" },
            { row: 2, ok: false, error: "Mã hàng đã tồn tại" },
          ],
        });
      },
    });
    const user = human();
    renderApp("/hang-hoa");
    await user.click(await screen.findByRole("button", { name: "Nhập từ Excel" }));
    const dialog = await screen.findByRole("dialog", { name: "Nhập hàng hóa từ Excel" });

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(
      input,
      excelFile([
        ["Mã hàng", "Tên hàng *", "Nhóm hàng", "Đơn vị *", "Giá bán", "Tồn kho"],
        ["", "Bánh quy", "Bánh kẹo", "Hộp", 58000, 10],
        ["SP000052", "Kẹo", "Bánh kẹo", "Gói", 2000, 5],
        ["", "", "", "Cái", 1000, 1],
      ]),
    );
    expect(await within(dialog).findByText("Vui lòng nhập tên hàng")).toBeInTheDocument();
    expect(within(dialog).getByText(/dòng hợp lệ/)).toHaveTextContent("2 dòng hợp lệ, 1 dòng lỗi");

    await user.click(within(dialog).getByRole("button", { name: "Nhập 2 dòng" }));
    expect(await within(dialog).findByText(/Đã nhập/)).toHaveTextContent(
      "Đã nhập 1 mặt hàng, 2 dòng lỗi. Tạo nhóm mới: Bánh kẹo.",
    );
    expect(sent).toEqual([
      { name: "Bánh quy", category: "Bánh kẹo", unit: "Hộp", salePrice: 58_000, stock: 10_000 },
      {
        code: "SP000052",
        name: "Kẹo",
        category: "Bánh kẹo",
        unit: "Gói",
        salePrice: 2_000,
        stock: 5_000,
      },
    ]);
    const failed = within(dialog).getByRole("table", { name: "Các dòng lỗi" });
    expect(within(failed).getByText("Mã hàng đã tồn tại")).toBeInTheDocument();
    expect(within(failed).getByText("Vui lòng nhập tên hàng")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Tải danh sách dòng lỗi" }),
    ).toBeInTheDocument();
  });

  it("chặn file quá lớn trước khi đọc, không gọi SheetJS", async () => {
    setup("owner");
    const user = human();
    renderApp("/hang-hoa");
    await user.click(await screen.findByRole("button", { name: "Nhập từ Excel" }));
    const dialog = await screen.findByRole("dialog", { name: "Nhập hàng hóa từ Excel" });

    const tooBig = new File([new Uint8Array(1)], "khong-lo.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    Object.defineProperty(tooBig, "size", { value: 6 * 1024 * 1024 });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, tooBig);
    expect(await within(dialog).findByText(/quá lớn/)).toBeInTheDocument();
    // Vẫn ở bước chọn file (chưa đọc được file nên không có bảng xem trước).
    expect(within(dialog).queryByRole("table")).not.toBeInTheDocument();
  });
});
