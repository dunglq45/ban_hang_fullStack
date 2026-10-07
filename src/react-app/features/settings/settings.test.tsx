import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  apiError,
  mockApi,
  type MockHandler,
  renderApp,
  sampleDebtSummary,
  sampleMe,
  sampleStore,
} from "../../test/render-app";

const users = [
  {
    id: "u-owner",
    name: "Nguyễn Minh Anh",
    phone: "0900000001",
    role: "owner",
    isActive: true,
    createdAt: 0,
  },
  {
    id: "u-staff",
    name: "Trần Văn Bình",
    phone: "0900000002",
    role: "staff",
    isActive: true,
    createdAt: 0,
  },
  {
    id: "u-old",
    name: "Lê Thị Cúc",
    phone: "0900000003",
    role: "staff",
    isActive: false,
    createdAt: 0,
  },
];

function setup(extra: Record<string, MockHandler> = {}, role: "owner" | "staff" = "owner") {
  return mockApi({
    "GET /api/auth/me": () => Response.json(sampleMe(role)),
    "GET /api/debts/summary": () => Response.json(sampleDebtSummary),
    "GET /api/store": () => Response.json(sampleStore),
    "GET /api/users": () => Response.json({ items: users }),
    ...extra,
  });
}

afterEach(() => localStorage.clear());

describe("Cài đặt: cửa hàng", () => {
  it("sửa thông tin cửa hàng và dòng cuối hóa đơn → PUT đủ trường", async () => {
    let body: unknown;
    setup({
      "PUT /api/store": (req) => {
        body = req.body;
        return Response.json({ ...sampleStore, ...(req.body as object) });
      },
    });
    const user = userEvent.setup();
    renderApp("/cai-dat");

    const name = await screen.findByLabelText(/Tên cửa hàng/);
    expect(name).toHaveValue("Tạp hóa Minh Anh");
    const save = screen.getByRole("button", { name: "Lưu thay đổi" });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("Địa chỉ"), "12 Lê Lợi");
    await user.type(screen.getByLabelText("Dòng cuối hóa đơn"), "Cảm ơn quý khách!");
    await user.click(save);
    await waitFor(() =>
      expect(body).toEqual({
        name: "Tạp hóa Minh Anh",
        phone: "0900000001",
        address: "12 Lê Lợi",
        receiptFooter: "Cảm ơn quý khách!",
      }),
    );
    expect(await screen.findByText("Đã lưu thông tin cửa hàng")).toBeInTheDocument();
  });

  it("nhân viên chỉ thấy Tài khoản của tôi và Bán hàng", async () => {
    setup({}, "staff");
    renderApp("/cai-dat?muc=nhan-vien");
    const tabs = await screen.findByRole("tablist", { name: "Mục cài đặt" });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Tài khoản của tôi", "Bán hàng"]);
    expect(screen.getByRole("heading", { name: "Đổi mật khẩu" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Danh sách nhân viên" })).not.toBeInTheDocument();
  });
});

describe("Cài đặt: nhân viên", () => {
  it("liệt kê nhân viên; dòng của mình không có khóa/đặt lại mật khẩu", async () => {
    setup();
    const user = userEvent.setup();
    renderApp("/cai-dat?muc=nhan-vien");
    const table = await screen.findByRole("table", { name: "Danh sách nhân viên" });
    expect(within(table).getByText("Bạn")).toBeInTheDocument();
    expect(within(table).getByText("Đã khóa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Thao tác với Nguyễn Minh Anh" }));
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Sửa tên, vai trò"]);
  });

  it("thêm nhân viên: SĐT đã dùng thì báo ở ô SĐT; thành công gửi đủ thông tin", async () => {
    const posted: unknown[] = [];
    setup({
      "POST /api/users": (req) => {
        posted.push(req.body);
        if (posted.length === 1) {
          return apiError(409, "PHONE_TAKEN", "Số điện thoại này đã được dùng cho tài khoản khác");
        }
        return Response.json(
          { id: "u-new", name: "Phạm Dũng", phone: "0911222333", role: "staff", isActive: true },
          { status: 201 },
        );
      },
    });
    const user = userEvent.setup();
    renderApp("/cai-dat?muc=nhan-vien");
    await user.click(await screen.findByRole("button", { name: "Thêm nhân viên" }));
    const dialog = await screen.findByRole("dialog", { name: "Thêm nhân viên" });
    await user.type(within(dialog).getByLabelText(/Tên nhân viên/), "Phạm Dũng");
    await user.type(within(dialog).getByLabelText(/Số điện thoại/), "0911222333");
    await user.type(within(dialog).getByLabelText(/Mật khẩu tạm/), "abc123");
    await user.click(within(dialog).getByRole("button", { name: "Thêm nhân viên" }));

    expect(await within(dialog).findByText(/đã được dùng/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Số điện thoại/)).toHaveAttribute("aria-invalid", "true");

    await user.click(within(dialog).getByRole("button", { name: "Thêm nhân viên" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(posted[1]).toEqual({
      name: "Phạm Dũng",
      phone: "0911222333",
      password: "abc123",
      role: "staff",
    });
  });

  it("khóa (có xác nhận), mở khóa, đặt lại mật khẩu → PATCH đúng nội dung", async () => {
    const patches: Array<{ id: string; body: unknown }> = [];
    const patchOf =
      (i: number): MockHandler =>
      ({ body }) => {
        patches.push({ id: users[i]!.id, body });
        return Response.json(users[i]);
      };
    setup({ "PATCH /api/users/u-staff": patchOf(1), "PATCH /api/users/u-old": patchOf(2) });
    const user = userEvent.setup();
    renderApp("/cai-dat?muc=nhan-vien");

    await user.click(await screen.findByRole("button", { name: "Thao tác với Trần Văn Bình" }));
    await user.click(screen.getByRole("menuitem", { name: "Khóa tài khoản" }));
    const lock = await screen.findByRole("dialog", { name: "Khóa tài khoản Trần Văn Bình?" });
    await user.click(within(lock).getByRole("button", { name: "Khóa tài khoản" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ id: "u-staff", body: { isActive: false } });

    await user.click(screen.getByRole("button", { name: "Thao tác với Lê Thị Cúc" }));
    await user.click(screen.getByRole("menuitem", { name: "Mở khóa" }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]).toEqual({ id: "u-old", body: { isActive: true } });

    await user.click(screen.getByRole("button", { name: "Thao tác với Trần Văn Bình" }));
    await user.click(screen.getByRole("menuitem", { name: "Đặt lại mật khẩu" }));
    const reset = await screen.findByRole("dialog", { name: /Đặt lại mật khẩu cho Trần Văn Bình/ });
    await user.type(within(reset).getByLabelText(/Mật khẩu mới/), "123");
    await user.click(within(reset).getByRole("button", { name: "Đặt lại mật khẩu" }));
    expect(await within(reset).findByText("Mật khẩu tối thiểu 6 ký tự")).toBeInTheDocument();
    await user.type(within(reset).getByLabelText(/Mật khẩu mới/), "456");
    await user.click(within(reset).getByRole("button", { name: "Đặt lại mật khẩu" }));
    await waitFor(() => expect(patches).toHaveLength(3));
    expect(patches[2]).toEqual({ id: "u-staff", body: { password: "123456" } });
  });
});

describe("Cài đặt: tài khoản của tôi", () => {
  it("đổi mật khẩu: nhập lại không khớp chặn ở client; sai mật khẩu hiện tại báo ở ô", async () => {
    const bodies: unknown[] = [];
    setup(
      {
        "PUT /api/auth/password": (req) => {
          bodies.push(req.body);
          return bodies.length === 1
            ? apiError(400, "WRONG_PASSWORD", "Mật khẩu hiện tại không đúng")
            : Response.json({ ok: true });
        },
      },
      "staff",
    );
    const user = userEvent.setup();
    renderApp("/cai-dat");

    const current = await screen.findByLabelText(/Mật khẩu hiện tại/);
    const next = screen.getByLabelText(/^Mật khẩu mới/);
    const confirm = screen.getByLabelText(/Nhập lại mật khẩu mới/);
    await user.type(current, "sai-roi");
    await user.type(next, "moi123");
    await user.type(confirm, "moi124");
    await user.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));
    expect(await screen.findByText("Mật khẩu nhập lại không khớp")).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await user.clear(confirm);
    await user.type(confirm, "moi123");
    await user.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));
    expect(await screen.findByText("Mật khẩu hiện tại không đúng")).toBeInTheDocument();
    expect(current).toHaveAttribute("aria-invalid", "true");
    expect(bodies[0]).toEqual({ currentPassword: "sai-roi", password: "moi123" });

    await user.clear(current);
    await user.type(current, "123456");
    await user.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));
    expect(await screen.findByText(/Đã đổi mật khẩu/)).toBeInTheDocument();
    expect(current).toHaveValue("");
  });
});

describe("Cài đặt: bán hàng", () => {
  it("tắt/bật tự in hóa đơn lưu vào localStorage dùng chung với màn Bán hàng", async () => {
    setup();
    const user = userEvent.setup();
    renderApp("/cai-dat?muc=ban-hang");
    const box = await screen.findByLabelText("Tự động in hóa đơn sau khi bán");
    expect(box).toBeChecked();
    await user.click(box);
    expect(box).not.toBeChecked();
    expect(localStorage.getItem("pos:print")).toBe("0");
    await user.click(box);
    expect(localStorage.getItem("pos:print")).toBe("1");
  });
});
