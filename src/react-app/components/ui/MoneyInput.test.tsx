import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Field } from "./Field";
import { MoneyInput } from "./MoneyInput";

function Harness({ initial = null, max }: { initial?: number | null; max?: number }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <Field label="Khách thanh toán">
        <MoneyInput value={value} onChange={setValue} max={max} />
      </Field>
      <output data-testid="value">{String(value)}</output>
      <button type="button" onClick={() => setValue(500000)}>
        Vừa đủ
      </button>
    </>
  );
}

function setup(props?: { initial?: number | null; max?: number }) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  const input = screen.getByLabelText<HTMLInputElement>("Khách thanh toán");
  const value = () => screen.getByTestId("value").textContent;
  return { user, input, value };
}

describe("MoneyInput", () => {
  it("hiển thị dấu chấm hàng nghìn khi gõ, giá trị là số nguyên", async () => {
    const { user, input, value } = setup();
    expect(input).toHaveAttribute("inputmode", "numeric");
    await user.type(input, "100000");
    expect(input).toHaveValue("100.000");
    expect(value()).toBe("100000");
  });

  it("bỏ qua ký tự không phải số và số 0 ở đầu", async () => {
    const { user, input, value } = setup();
    await user.type(input, "0012a,3");
    expect(input).toHaveValue("123");
    expect(value()).toBe("123");
  });

  it("dán chuỗi có định dạng vẫn ra đúng số", async () => {
    const { user, input, value } = setup();
    await user.click(input);
    await user.paste("1.250.000đ");
    expect(input).toHaveValue("1.250.000");
    expect(value()).toBe("1250000");
  });

  it("xóa hết thì giá trị là null", async () => {
    const { user, input, value } = setup({ initial: 5000 });
    expect(input).toHaveValue("5.000");
    await user.clear(input);
    expect(input).toHaveValue("");
    expect(value()).toBe("null");
  });

  it("không cho gõ quá số tối đa", async () => {
    const { user, input, value } = setup({ max: 1000 });
    await user.type(input, "10000");
    expect(input).toHaveValue("1.000");
    expect(value()).toBe("1000");
  });

  it("giữ con trỏ đúng chỗ khi chèn số vào giữa", async () => {
    const { user, input, value } = setup({ initial: 1000 });
    // "1.000": đặt con trỏ sau chữ số 1 rồi gõ 5 → "15.000", con trỏ sau chữ số 5.
    await user.type(input, "5", { initialSelectionStart: 1, initialSelectionEnd: 1 });
    expect(input).toHaveValue("15.000");
    expect(value()).toBe("15000");
    expect(input.selectionStart).toBe(2);
  });

  it("Backspace ngay sau dấu chấm thì xóa chữ số trước nó", async () => {
    const { user, input, value } = setup({ initial: 1234567 });
    // "1.234.567": con trỏ sau dấu chấm thứ nhất (vị trí 2) → xóa chữ số 1.
    await user.type(input, "{Backspace}", { initialSelectionStart: 2, initialSelectionEnd: 2 });
    expect(input).toHaveValue("234.567");
    expect(value()).toBe("234567");
    expect(input.selectionStart).toBe(0);
  });

  it("Delete ngay trước dấu chấm thì xóa chữ số sau nó", async () => {
    const { user, input, value } = setup({ initial: 1234 });
    // "1.234": con trỏ sau chữ số 1 (vị trí 1) → xóa chữ số 2.
    await user.type(input, "{Delete}", { initialSelectionStart: 1, initialSelectionEnd: 1 });
    expect(input).toHaveValue("134");
    expect(value()).toBe("134");
  });

  it("dán chuỗi không phải số tiền rõ ràng thì không nhận", async () => {
    const { user, input, value } = setup({ initial: 5000 });
    await user.clear(input);
    for (const text of ["1,5tr", "1.250.000,50", "-20.000"]) {
      await user.paste(text);
      expect(input, text).toHaveValue("");
    }
    expect(value()).toBe("null");
  });

  it("gõ quá số tối đa ở giữa chuỗi thì con trỏ ở lại chỗ cũ", async () => {
    const { user, input } = setup({ initial: 1000, max: 9999 });
    await user.type(input, "5", { initialSelectionStart: 1, initialSelectionEnd: 1 });
    expect(input).toHaveValue("1.000");
    expect(input.selectionStart).toBe(1);
  });

  it("cập nhật khi giá trị đổi từ bên ngoài", async () => {
    const { user, input } = setup({ initial: 1000 });
    await user.click(screen.getByRole("button", { name: "Vừa đủ" }));
    expect(input).toHaveValue("500.000");
  });
});
