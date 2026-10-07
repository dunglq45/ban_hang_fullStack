import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockApi, type MockHandler, renderApp, sampleMe } from "../../test/render-app";

const store = {
  name: "Tạp hóa Minh Anh",
  phone: "0912345678",
  address: "12 Lê Lợi",
  receiptFooter: "Cảm ơn quý khách!",
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
    contact: { id: "kh-1", code: "KH000001", name: "Chị Lan", phone: "0912345678", debt: 300_000 },
    createdBy: { id: "u-staff", name: "Trần Văn Bình" },
    cancelledBy: null,
    store,
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

function setup(extra: Record<string, MockHandler>) {
  return mockApi({
    "GET /api/auth/me": () => Response.json(sampleMe("owner")),
    ...extra,
  });
}

describe("in hóa đơn bán hàng", () => {
  it("mở từ POS kèm ?auto=1: tự in rồi đóng tab", async () => {
    setup({ "GET /api/documents/hd-1": () => Response.json(invoice()) });
    const printSpy = vi.fn();
    const closeSpy = vi.fn();
    window.print = printSpy;
    window.close = closeSpy;
    renderApp("/in/hoa-don/hd-1?auto=1");

    expect(await screen.findByText("Tạp hóa Minh Anh")).toBeInTheDocument();
    expect(screen.getByText("Nước mắm 500ml")).toBeInTheDocument();
    expect(screen.getByText("HÓA ĐƠN BÁN HÀNG")).toBeInTheDocument();
    await waitFor(() => expect(printSpy).toHaveBeenCalledOnce());

    window.dispatchEvent(new Event("afterprint"));
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it("mở trực tiếp (không auto): chỉ hiện nút in thủ công", async () => {
    setup({ "GET /api/documents/hd-1": () => Response.json(invoice()) });
    const printSpy = vi.fn();
    window.print = printSpy;
    const user = userEvent.setup();
    renderApp("/in/hoa-don/hd-1");

    expect(await screen.findByText("Tạp hóa Minh Anh")).toBeInTheDocument();
    expect(printSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "In" }));
    expect(printSpy).toHaveBeenCalledOnce();
  });

  it("hóa đơn đã hủy: hiện rõ trạng thái", async () => {
    setup({
      "GET /api/documents/hd-1": () =>
        Response.json(invoice({ status: "cancelled", cancelledAt: Date.UTC(2026, 9, 5, 4) })),
    });
    renderApp("/in/hoa-don/hd-1");
    expect(await screen.findByText("HÓA ĐƠN ĐÃ HỦY")).toBeInTheDocument();
  });

  it("không tìm thấy hóa đơn: hiện thông báo lỗi", async () => {
    setup({
      "GET /api/documents/hd-1": () =>
        Response.json(
          { error: { code: "NOT_FOUND", message: "Không tìm thấy chứng từ" } },
          {
            status: 404,
          },
        ),
    });
    renderApp("/in/hoa-don/hd-1");
    expect(await screen.findByText("Không tìm thấy chứng từ")).toBeInTheDocument();
  });
});

function payment(patch: Record<string, unknown> = {}) {
  return {
    id: "pt-4",
    type: "receipt",
    code: "PT000004",
    status: "completed",
    amount: 50_000,
    method: "cash",
    note: null,
    createdAt: Date.UTC(2026, 9, 5, 3),
    cancelledAt: null,
    contactId: "kh-1",
    contact: { id: "kh-1", code: "KH000001", name: "Chị Lan", phone: "0912345678", debt: 300_000 },
    createdBy: { id: "u-owner", name: "Nguyễn Minh Anh" },
    balanceAfter: 250_000,
    store,
    ...patch,
  };
}

describe("in phiếu thu / phiếu chi", () => {
  it("phiếu thu: hiện số tiền, khách, dư nợ sau phiếu", async () => {
    setup({ "GET /api/payments/pt-4": () => Response.json(payment()) });
    renderApp("/in/phieu-thu/pt-4");
    expect(await screen.findByText("PHIẾU THU TIỀN")).toBeInTheDocument();
    expect(screen.getByText("Chị Lan")).toBeInTheDocument();
    expect(screen.getByText("50.000")).toBeInTheDocument();
    expect(screen.getByText("250.000")).toBeInTheDocument();
  });

  it("phiếu chi dùng cùng trang: tiêu đề và nhãn đối tác khác", async () => {
    setup({
      "GET /api/payments/pc-9": () =>
        Response.json(
          payment({
            id: "pc-9",
            type: "disbursement",
            code: "PC000009",
            contact: {
              id: "ncc-1",
              code: "NCC001",
              name: "Đại lý Hưng Thịnh",
              phone: null,
              debt: 0,
            },
          }),
        ),
    });
    renderApp("/in/phieu-chi/pc-9");
    expect(await screen.findByText("PHIẾU CHI TIỀN")).toBeInTheDocument();
    expect(screen.getByText("Đại lý Hưng Thịnh")).toBeInTheDocument();
  });
});

function purchase(patch: Record<string, unknown> = {}) {
  return {
    id: "pn-1",
    type: "purchase",
    code: "PN000012",
    status: "completed",
    subtotal: 500_000,
    discount: 0,
    total: 500_000,
    paid: 500_000,
    debtAmount: 0,
    paymentMethod: "cash",
    note: null,
    createdAt: Date.UTC(2026, 9, 5, 3),
    completedAt: Date.UTC(2026, 9, 5, 3),
    cancelledAt: null,
    contactId: "ncc-1",
    contact: { id: "ncc-1", code: "NCC001", name: "Đại lý Hưng Thịnh", phone: null, debt: 0 },
    createdBy: { id: "u-owner", name: "Nguyễn Minh Anh" },
    cancelledBy: null,
    store,
    lines: [
      {
        id: "l1",
        productId: "p-1",
        productCode: "SP000001",
        productName: "Dầu ăn 1 lít",
        unitName: "Chai",
        factor: 1,
        qty: 10_000,
        baseQty: 10_000,
        unitPrice: 50_000,
        lineTotal: 500_000,
        systemQty: null,
        actualQty: null,
        reason: null,
      },
    ],
    ...patch,
  };
}

describe("in phiếu nhập hàng (A5)", () => {
  it("hiện dòng hàng, tổng tiền và khung ký nhận", async () => {
    setup({ "GET /api/documents/pn-1": () => Response.json(purchase()) });
    renderApp("/in/phieu-nhap/pn-1");
    expect(await screen.findByText("Phiếu nhập hàng")).toBeInTheDocument();
    expect(screen.getByText("Dầu ăn 1 lít")).toBeInTheDocument();
    expect(screen.getByText("Người giao hàng")).toBeInTheDocument();
    expect(screen.getByText("Người nhận hàng")).toBeInTheDocument();
  });

  it("chứng từ không phải phiếu nhập (ví dụ hóa đơn bán): báo không tìm thấy", async () => {
    setup({ "GET /api/documents/hd-1": () => Response.json(invoice()) });
    renderApp("/in/phieu-nhap/hd-1");
    expect(await screen.findByText("Không tìm thấy phiếu nhập")).toBeInTheDocument();
  });
});
