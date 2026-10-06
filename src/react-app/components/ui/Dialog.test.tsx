import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Field } from "./Field";
import { Input } from "./Input";

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    onClose?.();
    setOpen(false);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>Thu nợ</Button>
      <Dialog
        open={open}
        onClose={close}
        title="Thu nợ"
        description="Chị Lan · 0912 345 678"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Hủy
            </Button>
            <Button>Xác nhận thu</Button>
          </>
        }
      >
        <Field label="Số tiền thu">
          <Input />
        </Field>
      </Dialog>
    </>
  );
}

async function openDialog(onClose?: () => void) {
  const user = userEvent.setup();
  render(<Harness onClose={onClose} />);
  const opener = screen.getByRole("button", { name: "Thu nợ" });
  await user.click(opener);
  return { user, opener, dialog: screen.getByRole("dialog") };
}

describe("Dialog", () => {
  it("không render khi đóng", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("có aria-modal, tên và mô tả; focus vào ô nhập đầu tiên", async () => {
    const { dialog } = await openDialog();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Thu nợ");
    expect(dialog).toHaveAccessibleDescription("Chị Lan · 0912 345 678");
    expect(screen.getByLabelText("Số tiền thu")).toHaveFocus();
  });

  it("Esc để đóng và trả focus về nút đã mở", async () => {
    const onClose = vi.fn();
    const { user, opener } = await openDialog(onClose);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("giữ focus bên trong: Tab ở nút cuối quay về nút đầu và ngược lại", async () => {
    const { user } = await openDialog();
    const closeButton = screen.getByRole("button", { name: "Đóng" });
    const confirm = screen.getByRole("button", { name: "Xác nhận thu" });

    confirm.focus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();

    // Đi hết một vòng bằng Tab vẫn ở trong hộp thoại.
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("bấm nút Đóng hoặc ra ngoài thì đóng", async () => {
    const onClose = vi.fn();
    const { user } = await openDialog(onClose);
    await user.click(screen.getByRole("button", { name: "Đóng" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Thu nợ" }));
    const overlay = screen.getByRole("dialog").parentElement!;
    await user.pointer({ keys: "[MouseLeft]", target: overlay });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("bấm bên trong hộp thoại thì không đóng", async () => {
    const onClose = vi.fn();
    const { user } = await openDialog(onClose);
    await user.click(screen.getByLabelText("Số tiền thu"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
