import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi, renderApp, sampleDebtSummary, sampleMe } from "../../test/render-app";

const unauthorized = () => apiError(401, "UNAUTHORIZED", "Vui lòng đăng nhập");

describe("đăng nhập và khung app", () => {
  it("chưa đăng nhập mở trang trong app thì về /login, đăng nhập xong quay lại trang đó", async () => {
    let loggedIn = false;
    const fetchMock = mockApi({
      "GET /api/auth/me": () => (loggedIn ? Response.json(sampleMe()) : unauthorized()),
      "POST /api/auth/login": ({ body }) => {
        const { phone, password } = body as { phone: string; password: string };
        if (password !== "123456") {
          return apiError(401, "INVALID_CREDENTIALS", "Số điện thoại hoặc mật khẩu không đúng");
        }
        expect(phone).toBe("0900000001");
        loggedIn = true;
        return Response.json({ user: sampleMe().user });
      },
      "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
    });
    const user = userEvent.setup();
    const { router } = renderApp("/hang-hoa");

    expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");

    // Lỗi validate phía client, chưa gọi API.
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByText("Số điện thoại gồm 10 số, bắt đầu bằng 0")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập mật khẩu")).toBeInTheDocument();
    expect(screen.getByLabelText("Số điện thoại")).toHaveAttribute("aria-invalid", "true");

    // Sai mật khẩu: lỗi từ server hiện dưới form, không bị đá ra như hết phiên.
    await user.type(screen.getByLabelText("Số điện thoại"), "0900 000 001");
    await user.type(screen.getByLabelText("Mật khẩu"), "sai-mat-khau");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Số điện thoại hoặc mật khẩu không đúng",
    );

    await user.clear(screen.getByLabelText("Mật khẩu"));
    await user.type(screen.getByLabelText("Mật khẩu"), "123456");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Hàng hóa" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/hang-hoa");

    // Request ghi có header chống CSRF và gửi kèm cookie.
    const loginCall = fetchMock.mock.calls.findLast(([url]) => String(url).includes("/auth/login"));
    const init = loginCall?.[1];
    expect(new Headers(init?.headers).get("X-Requested-With")).toBe("fetch");
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(String(init?.body))).toEqual({
      phone: "0900000001",
      password: "123456",
      remember: true,
    });
  });

  it("chủ cửa hàng thấy đủ menu và badge số khách nợ; mục đang mở được đánh dấu", async () => {
    mockApi({
      "GET /api/auth/me": () => Response.json(sampleMe("owner")),
      "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
    });
    renderApp("/nhap-hang/moi");

    const nav = await screen.findByRole("navigation", { name: "Menu chính" });
    expect(within(nav).getByText("Tạp hóa Minh Anh")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /Tổng quan/ })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /Hàng hóa/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      await within(nav).findByRole("link", { name: "Sổ nợ, 14 khách đang nợ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Tạo phiếu nhập hàng" }),
    ).toBeInTheDocument();
  });

  it("nhân viên không thấy Tổng quan và bị chuyển khỏi trang chỉ dành cho chủ", async () => {
    mockApi({
      "GET /api/auth/me": () => Response.json(sampleMe("staff")),
      "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
    });
    const { router } = renderApp("/tong-quan");

    expect(await screen.findByRole("heading", { level: 1, name: "Bán hàng" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/ban-hang");
    expect(screen.queryByRole("link", { name: /Tổng quan/ })).not.toBeInTheDocument();
    const tabBar = screen.getByRole("navigation", { name: "Điều hướng" });
    expect(within(tabBar).queryByRole("link", { name: "Báo cáo" })).not.toBeInTheDocument();
    expect(within(tabBar).getAllByRole("link")).toHaveLength(4);
  });

  it("hết phiên giữa chừng (401 ở API bất kỳ) thì về trang đăng nhập", async () => {
    mockApi({
      "GET /api/auth/me": () => Response.json(sampleMe()),
      "GET /api/debts/summary": () => unauthorized(),
    });
    const { router } = renderApp("/so-no");

    expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("đăng xuất từ menu avatar", async () => {
    let loggedIn = true;
    mockApi({
      "GET /api/auth/me": () => (loggedIn ? Response.json(sampleMe()) : unauthorized()),
      "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
      "POST /api/auth/logout": () => {
        loggedIn = false;
        return Response.json({ ok: true });
      },
    });
    const user = userEvent.setup();
    renderApp("/ban-hang");

    await user.click(await screen.findByRole("button", { name: "Tài khoản: Nguyễn Minh Anh" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText(/Chủ cửa hàng/)).toBeInTheDocument();
    await waitFor(() => expect(within(menu).getAllByRole("menuitem")[0]).toHaveFocus());

    await user.click(within(menu).getByRole("menuitem", { name: "Đăng xuất" }));
    expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
  });

  it("đăng ký: kiểm tra mật khẩu nhập lại, gửi đúng dữ liệu rồi vào app", async () => {
    let registered = false;
    const fetchMock = mockApi({
      "GET /api/auth/me": () => (registered ? Response.json(sampleMe()) : unauthorized()),
      "POST /api/auth/register": () => {
        registered = true;
        return Response.json({ user: sampleMe().user }, { status: 201 });
      },
      "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
    });
    const user = userEvent.setup();
    const { router } = renderApp("/register");

    await user.type(await screen.findByLabelText(/Tên cửa hàng/), "Tạp hóa Minh Anh");
    await user.type(screen.getByLabelText(/Tên chủ cửa hàng/), "Nguyễn Minh Anh");
    await user.type(screen.getByLabelText(/Số điện thoại/), "0900000001");
    await user.type(screen.getByLabelText(/^Mật khẩu/), "123456");
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu/), "654321");
    await user.click(screen.getByRole("button", { name: "Tạo cửa hàng" }));
    expect(await screen.findByText("Mật khẩu nhập lại không khớp")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Nhập lại mật khẩu/));
    await user.type(screen.getByLabelText(/Nhập lại mật khẩu/), "123456");
    await user.click(screen.getByRole("button", { name: "Tạo cửa hàng" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Bán hàng" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/ban-hang");
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/auth/register"));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      storeName: "Tạp hóa Minh Anh",
      ownerName: "Nguyễn Minh Anh",
      phone: "0900000001",
      password: "123456",
    });
  });
});
