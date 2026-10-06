import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiError,
  mockApi,
  type MockHandler,
  renderApp,
  sampleDebtSummary,
  sampleMe,
} from "../../test/render-app";

const water = {
  id: "p-nuoc",
  code: "SP000003",
  barcode: "8934588012345",
  name: "Nước suối 500ml",
  nameSearch: "nuoc suoi 500ml sp000003 8934588012345",
  categoryId: "c-douong",
  baseUnit: "Chai",
  salePrice: 5_000,
  stock: 48_000,
  minStock: 10_000,
  allowNegative: false,
  imageKey: null,
  units: [{ id: "u1", name: "Thùng", factor: 24, salePrice: 110_000, barcode: "8934588099999" }],
};
const fishSauce = {
  id: "p-mam",
  code: "SP000052",
  barcode: null,
  name: "Nước mắm 500ml",
  nameSearch: "nuoc mam 500ml sp000052",
  categoryId: "c-giavi",
  baseUnit: "Chai",
  salePrice: 38_000,
  stock: 2_000,
  minStock: 5_000,
  allowNegative: false,
  imageKey: null,
  units: [],
};
const lan = {
  id: "c-lan",
  type: "customer",
  code: "KH000001",
  name: "Chị Lan",
  phone: "0912345678",
  address: null,
  note: null,
  debt: 350_000,
  debtLimit: 500_000,
  debtSince: 0,
  isActive: true,
  createdAt: 0,
  updatedAt: 0,
};

function saleDoc(code = "HD000231") {
  return { id: "doc-1", code, type: "sale", status: "completed", total: 0 };
}

function setup(role: "owner" | "staff" = "owner", extra: Record<string, MockHandler> = {}) {
  const sales: Array<Record<string, unknown>> = [];
  const fetchMock = mockApi({
    "GET /api/auth/me": () => Response.json(sampleMe(role)),
    "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
    "GET /api/products/pos": () => Response.json({ items: [water, fishSauce] }),
    "GET /api/categories": () =>
      Response.json({
        items: [
          { id: "c-douong", name: "Đồ uống", sortOrder: 0, productCount: 1 },
          { id: "c-giavi", name: "Gia vị", sortOrder: 1, productCount: 1 },
        ],
      }),
    "GET /api/contacts": () => Response.json({ items: [lan], total: 1, page: 1, pageSize: 8 }),
    "GET /api/contacts/c-lan": () => Response.json({ ...lan, lastPayment: null }),
    "POST /api/sales": ({ body }) => {
      sales.push(body as Record<string, unknown>);
      return Response.json(saleDoc(), { status: 201 });
    },
    ...extra,
  });
  return { fetchMock, sales };
}

/** Người gõ tay: mỗi phím cách nhau 40ms (gõ nhanh hơn 35ms bị coi là máy quét). */
const human = () => userEvent.setup({ delay: 40 });

async function openPos() {
  const user = human();
  const view = renderApp("/ban-hang");
  const search = await screen.findByRole("searchbox", { name: "Tìm hàng" });
  await screen.findAllByText("Nước suối 500ml");
  return { user, search, ...view };
}

const cart = () => screen.getByRole("list", { name: "Hàng trong đơn" });
const payButton = () => screen.getByRole("button", { name: /^Thanh toán/ });

beforeEach(() => {
  // Tắt in để không mở cửa sổ mới trong test (trừ test in hóa đơn).
  localStorage.setItem("pos:print", "0");
});

afterEach(() => localStorage.clear());

describe("màn Bán hàng", () => {
  it("ô tìm được focus sẵn; quét mã vạch rồi Enter thì thêm hàng, quét mã thùng thì thêm theo thùng", async () => {
    setup();
    const { user, search } = await openPos();
    expect(search).toHaveFocus();

    await user.type(search, "8934588012345{Enter}");
    expect(search).toHaveValue("");
    expect(within(cart()).getByText("Nước suối 500ml")).toBeInTheDocument();
    expect(within(cart()).getByLabelText("Số lượng Nước suối 500ml")).toHaveValue("1");

    await user.type(search, "8934588012345{Enter}");
    expect(within(cart()).getByLabelText("Số lượng Nước suối 500ml")).toHaveValue("2");

    await user.type(search, "8934588099999{Enter}");
    const units = within(cart()).getAllByLabelText("Đơn vị Nước suối 500ml");
    expect(units.map((u) => (u as HTMLSelectElement).value)).toEqual(["Chai", "Thùng"]);
    expect(within(cart()).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Tổng tiền hàng (2 món)").nextSibling).toHaveTextContent("120.000");
  });

  it("gõ không dấu lọc ngay; Enter khi chỉ còn một kết quả thì thêm; Esc xóa ô tìm", async () => {
    setup();
    const { user, search } = await openPos();
    await user.type(search, "nuoc mam");
    expect(screen.queryAllByText("Nước suối 500ml")).toHaveLength(0);
    await user.keyboard("{Escape}");
    expect(search).toHaveValue("");
    await user.type(search, "mam{Enter}");
    expect(within(cart()).getByText("Nước mắm 500ml")).toBeInTheDocument();
  });

  it("máy quét USB khi focus không ở ô nhập: gõ nhanh + Enter thì thêm hàng", async () => {
    setup();
    const { search } = await openPos();
    act(() => search.blur());
    for (const key of "8934588012345") fireEvent.keyDown(document.body, { key });
    fireEvent.keyDown(document.body, { key: "Enter" });
    await waitFor(() => expect(within(cart()).getByText("Nước suối 500ml")).toBeInTheDocument());
  });

  it("thanh toán: gửi đúng hóa đơn, báo đã bán, làm trống đơn, đơn mới có idempotencyKey mới", async () => {
    const { sales } = setup();
    const { user, search } = await openPos();
    await user.type(search, "SP000003{Enter}");
    await user.click(screen.getByRole("button", { name: "10.000" }));
    expect(screen.getByText("Tiền thừa trả khách").nextSibling).toHaveTextContent("5.000");
    await user.click(payButton());

    expect(await screen.findByText("Đã bán HD000231")).toBeInTheDocument();
    expect(sales).toHaveLength(1);
    expect(sales[0]).toEqual({
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      contactId: null,
      lines: [{ productId: "p-nuoc", unitName: "Chai", qty: 1_000, unitPrice: 5_000 }],
      discount: 0,
      paid: 10_000,
      paymentMethod: "cash",
      force: false,
    });
    expect(screen.queryByRole("list", { name: "Hàng trong đơn" })).not.toBeInTheDocument();

    await user.type(search, "SP000003{Enter}");
    await user.keyboard("{F9}");
    await waitFor(() => expect(sales).toHaveLength(2));
    expect(sales[1]!.idempotencyKey).not.toBe(sales[0]!.idempotencyKey);
  });

  it("gửi lỗi mạng thì giữ đơn; gửi lại dùng đúng idempotencyKey cũ", async () => {
    const keys: unknown[] = [];
    let fail = true;
    setup("owner", {
      "POST /api/sales": ({ body }) => {
        keys.push((body as { idempotencyKey: string }).idempotencyKey);
        if (fail) {
          fail = false;
          throw new TypeError("Failed to fetch");
        }
        return Response.json(saleDoc(), { status: 201 });
      },
    });
    const { user, search } = await openPos();
    await user.type(search, "SP000003{Enter}");
    await user.click(payButton());
    expect(await screen.findByText(/Không kết nối được máy chủ/)).toBeInTheDocument();
    expect(within(cart()).getByText("Nước suối 500ml")).toBeInTheDocument();

    await user.click(payButton());
    expect(await screen.findByText("Đã bán HD000231")).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("OUT_OF_STOCK: tô đỏ dòng thiếu hàng kèm số tồn còn lại", async () => {
    setup("owner", {
      "POST /api/sales": () =>
        Response.json(
          {
            error: {
              code: "OUT_OF_STOCK",
              message: "Không đủ hàng trong kho: Nước mắm 500ml chỉ còn 2 Chai",
              details: {
                items: [
                  {
                    productId: "p-mam",
                    name: "Nước mắm 500ml",
                    unit: "Chai",
                    stock: 2_000,
                    requested: 3_000,
                  },
                ],
              },
            },
          },
          { status: 409 },
        ),
    });
    const { user, search } = await openPos();
    await user.type(search, "SP000052{Enter}");
    // Đã thấy cảnh báo mềm (tồn 2, mua 3) trước khi gửi.
    await user.click(screen.getByRole("button", { name: "Thêm 1 Nước mắm 500ml" }));
    await user.click(screen.getByRole("button", { name: "Thêm 1 Nước mắm 500ml" }));
    expect(within(cart()).getByText("Tồn kho chỉ còn 2 Chai")).toBeInTheDocument();

    await user.click(payButton());
    expect(await within(cart()).findByText("Không đủ hàng: chỉ còn 2 Chai")).toBeInTheDocument();
    // Sửa số lượng thì bỏ lỗi cũ.
    await user.click(screen.getByRole("button", { name: "Bớt 1 Nước mắm 500ml" }));
    expect(within(cart()).queryByText(/Không đủ hàng/)).not.toBeInTheDocument();
  });

  it("chọn khách, trả thiếu thì ghi nợ; vượt hạn mức: chủ cửa hàng xác nhận rồi gửi lại với force", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    setup("owner", {
      "POST /api/sales": ({ body }) => {
        const b = body as Record<string, unknown>;
        bodies.push(b);
        if (!b.force) {
          return apiError(409, "DEBT_LIMIT_EXCEEDED", "Vượt hạn mức nợ của Chị Lan (500.000)");
        }
        return Response.json(saleDoc("HD000232"), { status: 201 });
      },
    });
    const { user, search } = await openPos();
    await user.type(search, "8934588099999{Enter}"); // 1 thùng 110.000

    await user.click(screen.getByRole("combobox", { name: "Khách hàng" }));
    await user.keyboard("lan");
    await user.click(await screen.findByRole("option", { name: /Chị Lan/ }));
    expect(screen.getByText("Nợ cũ 350.000")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Khách thanh toán"), "0");
    expect(screen.getByText("Còn thiếu · ghi nợ").nextSibling).toHaveTextContent("110.000");
    expect(screen.getByText("Dư nợ của khách sau đơn này").nextSibling).toHaveTextContent(
      "460.000",
    );

    await user.click(payButton());

    const dialog = await screen.findByRole("dialog", { name: "Vượt hạn mức nợ" });
    expect(dialog).toHaveTextContent("Vượt hạn mức nợ của Chị Lan (500.000)");
    await user.click(within(dialog).getByRole("button", { name: "Vẫn bán và ghi nợ" }));

    expect(await screen.findByText("Đã bán HD000232")).toBeInTheDocument();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({ contactId: "c-lan", paid: 0, force: true });
    expect(bodies[1]!.idempotencyKey).toBe(bodies[0]!.idempotencyKey);
  });

  it("nhân viên vượt hạn mức chỉ thấy thông báo lỗi, không có nút vẫn bán", async () => {
    setup("staff", {
      "POST /api/sales": () =>
        apiError(409, "DEBT_LIMIT_EXCEEDED", "Vượt hạn mức nợ của Chị Lan (500.000)"),
    });
    const { user, search } = await openPos();
    await user.type(search, "SP000003{Enter}");
    await user.click(screen.getByRole("combobox", { name: "Khách hàng" }));
    await user.click(await screen.findByRole("option", { name: /Chị Lan/ }));
    await user.type(screen.getByLabelText("Khách thanh toán"), "0");
    await user.click(payButton());
    expect(await screen.findByText("Vượt hạn mức nợ của Chị Lan (500.000)")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("khách lẻ trả thiếu: chặn ngay, không gửi", async () => {
    const { sales } = setup();
    const { user, search } = await openPos();
    await user.type(search, "SP000003{Enter}");
    await user.type(screen.getByLabelText("Khách thanh toán"), "1000");
    expect(screen.getByText("Khách lẻ phải trả đủ. Chọn khách để ghi nợ.")).toBeInTheDocument();
    await user.click(payButton());
    expect(await screen.findByText(/Khách lẻ phải trả đủ. Chọn khách hàng/)).toBeInTheDocument();
    expect(sales).toHaveLength(0);
  });

  it("nhiều hóa đơn song song và giữ nguyên sau khi tải lại trang", async () => {
    setup();
    const { user, search } = await openPos();
    await user.type(search, "SP000003{Enter}");
    await user.click(screen.getByRole("button", { name: "Mở hóa đơn mới" }));
    expect(screen.getByRole("button", { name: "Hóa đơn 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("list", { name: "Hàng trong đơn" })).not.toBeInTheDocument();
    await user.type(search, "SP000052{Enter}");

    cleanup();
    await openPos();
    expect(within(cart()).getByText("Nước mắm 500ml")).toBeInTheDocument();
    await human().click(screen.getByRole("button", { name: /Hóa đơn 1/ }));
    expect(within(cart()).getByText("Nước suối 500ml")).toBeInTheDocument();
  });

  it("chọn in hóa đơn: mở trang in của hóa đơn vừa bán", async () => {
    localStorage.setItem("pos:print", "1");
    const printWindow = { location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(printWindow as unknown as Window);
    setup();
    const { user, search } = await openPos();
    expect(screen.getByRole("checkbox", { name: "In hóa đơn" })).toBeChecked();
    await user.type(search, "SP000003{Enter}");
    await user.click(payButton());
    await screen.findByText("Đã bán HD000231");
    expect(open).toHaveBeenCalledOnce();
    expect(printWindow.location.href).toBe("/in/hoa-don/doc-1");
    open.mockRestore();
  });

  it("máy quét gõ vào lúc focus đang ở ô đơn giá: ô giữ giá cũ, hàng quét được thêm vào đơn", async () => {
    setup();
    const { user, search } = await openPos();
    await user.type(search, "SP000052{Enter}");
    const price = within(cart()).getByLabelText("Đơn giá Nước mắm 500ml");
    await user.click(price);
    const scanner = userEvent.setup({ delay: null });
    await scanner.type(price, "8934588012345{Enter}", { skipClick: true });
    await waitFor(() => expect(within(cart()).getByText("Nước suối 500ml")).toBeInTheDocument());
    expect(within(cart()).getByLabelText("Đơn giá Nước mắm 500ml")).toHaveValue("38.000");
  });

  it("quét khi ô tìm đang có chữ dở: ô tìm giữ chữ cũ, hàng vẫn được thêm", async () => {
    setup();
    const { user, search } = await openPos();
    await user.type(search, "mi");
    const scanner = userEvent.setup({ delay: null });
    await scanner.type(search, "8934588012345{Enter}", { skipClick: true });
    await waitFor(() => expect(within(cart()).getByText("Nước suối 500ml")).toBeInTheDocument());
    expect(search).toHaveValue("mi");
  });

  it("F9 khi ô số lượng đang báo lỗi (1.000): không gửi, báo lỗi và giữ focus ở ô đó", async () => {
    const { sales } = setup();
    const { user, search } = await openPos();
    await user.type(search, "SP000003{Enter}");
    const qty = within(cart()).getByLabelText("Số lượng Nước suối 500ml");
    await user.clear(qty);
    await user.type(qty, "1.000");
    expect(qty).toHaveAttribute("aria-invalid", "true");
    await user.keyboard("{F9}");
    expect(await screen.findByText(/Có ô số lượng chưa hợp lệ/)).toBeInTheDocument();
    expect(qty).toHaveFocus();
    expect(sales).toHaveLength(0);
  });

  it("đang gửi thì khóa đơn: không thêm được hàng vào đơn đó, mở đơn mới thì được", async () => {
    let release: (r: Response) => void = () => {};
    setup("owner", {
      "POST /api/sales": () => new Promise<Response>((resolve) => (release = resolve)),
    });
    const { user, search } = await openPos();
    await user.type(search, "SP000003{Enter}");
    await user.click(payButton());
    expect(await screen.findByText(/Đang gửi hóa đơn/)).toBeInTheDocument();

    await user.type(search, "SP000052{Enter}");
    expect(await screen.findByText(/Hóa đơn này đang được gửi/)).toBeInTheDocument();
    expect(within(cart()).queryByText("Nước mắm 500ml")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mở hóa đơn mới" }));
    await user.type(search, "SP000052{Enter}");
    expect(within(cart()).getByText("Nước mắm 500ml")).toBeInTheDocument();

    act(() => release(Response.json(saleDoc(), { status: 201 })));
    expect(await screen.findByText("Đã bán HD000231")).toBeInTheDocument();
    // Đơn 2 vẫn giữ nguyên.
    expect(within(cart()).getByText("Nước mắm 500ml")).toBeInTheDocument();
  });

  it("server trả hóa đơn cũ khác nội dung (key đã dùng): giữ đơn, đổi key, báo chưa bán", async () => {
    const keys: string[] = [];
    let first = true;
    setup("owner", {
      "POST /api/sales": ({ body }) => {
        keys.push((body as { idempotencyKey: string }).idempotencyKey);
        if (first) {
          first = false;
          return Response.json(
            {
              ...saleDoc("HD000200"),
              contactId: null,
              discount: 0,
              lines: [{ productId: "p-khac", unitName: "Cái", qty: 1_000, unitPrice: 1_000 }],
            },
            { status: 200 },
          );
        }
        return Response.json(saleDoc("HD000233"), { status: 201 });
      },
    });
    const { user, search } = await openPos();
    await user.type(search, "SP000003{Enter}");
    await user.click(payButton());
    expect(
      await screen.findByText(/HD000200 đã được lưu trước đó với nội dung khác/),
    ).toBeInTheDocument();
    expect(within(cart()).getByText("Nước suối 500ml")).toBeInTheDocument();

    await user.click(payButton());
    expect(await screen.findByText("Đã bán HD000233")).toBeInTheDocument();
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("nhân viên bán dưới giá vốn: tô đỏ đúng dòng bằng câu lỗi của server", async () => {
    setup("staff", {
      "POST /api/sales": () =>
        Response.json(
          {
            error: {
              code: "PRICE_BELOW_COST",
              message: "Giá bán Nước mắm 500ml thấp hơn giá vốn. Chỉ chủ cửa hàng được bán giá này",
              details: { productId: "p-mam", name: "Nước mắm 500ml" },
            },
          },
          { status: 403 },
        ),
    });
    const { user, search } = await openPos();
    await user.type(search, "SP000003{Enter}");
    await user.type(search, "SP000052{Enter}");
    await user.click(payButton());
    const alerts = await within(cart()).findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("Giá bán Nước mắm 500ml thấp hơn giá vốn");
  });
});
