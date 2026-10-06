import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Field } from "./Field";
import { QtyInput } from "./QtyInput";
import { QtyStepper } from "./QtyStepper";

function Harness({ initial = null }: { initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <Field label="Số lượng">
        <QtyInput value={value} onChange={setValue} />
      </Field>
      <output data-testid="value">{String(value)}</output>
      <button type="button" onClick={() => setValue(2500)}>
        Đặt 2,5
      </button>
    </>
  );
}

function setup(initial?: number | null) {
  const user = userEvent.setup();
  render(<Harness initial={initial} />);
  const input = screen.getByLabelText<HTMLInputElement>("Số lượng");
  const value = () => screen.getByTestId("value").textContent;
  return { user, input, value };
}

describe("QtyInput", () => {
  it("nhận số thập phân dấu phẩy, trả về milli", async () => {
    const { user, input, value } = setup();
    expect(input).toHaveAttribute("inputmode", "decimal");
    await user.type(input, "1,5");
    expect(input).toHaveValue("1,5");
    expect(value()).toBe("1500");
  });

  it("dấu chấm theo sau 1–2 chữ số là số lẻ; rời ô thì viết lại bằng dấu phẩy", async () => {
    const { user, input, value } = setup();
    await user.type(input, "0.25");
    expect(value()).toBe("250");
    await user.tab();
    expect(input).toHaveValue("0,25");
  });

  it('"1.000" không rõ nghĩa: báo đỏ, giá trị null, rời ô vẫn giữ chữ để sửa', async () => {
    const { user, input, value } = setup();
    await user.type(input, "1.000");
    expect(value()).toBe("null");
    expect(input).toHaveAttribute("aria-invalid", "true");
    await user.tab();
    expect(input).toHaveValue("1.000");
    expect(input).toHaveAttribute("aria-invalid", "true");
    await user.clear(input);
    await user.type(input, "1000");
    expect(value()).toBe("1000000");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("không cho gõ quá số lượng tối đa", async () => {
    const user = userEvent.setup();
    function Max() {
      const [v, setV] = useState<number | null>(null);
      return <QtyInput aria-label="SL" value={v} onChange={setV} max={99_000} />;
    }
    render(<Max />);
    const input = screen.getByLabelText("SL");
    await user.type(input, "100");
    expect(input).toHaveValue("10");
  });

  it("tối đa 3 số lẻ, bỏ qua chữ và dấu phẩy thứ hai", async () => {
    const { user, input, value } = setup();
    await user.type(input, "1a,23,45");
    expect(input).toHaveValue("1,234");
    expect(value()).toBe("1234");
  });

  it("rời ô thì chuẩn hóa cách viết", async () => {
    const { user, input, value } = setup();
    await user.type(input, "3,");
    expect(value()).toBe("3000");
    await user.tab();
    expect(input).toHaveValue("3");
  });

  it("xóa hết thì giá trị là null", async () => {
    const { user, input, value } = setup(2000);
    expect(input).toHaveValue("2");
    await user.clear(input);
    expect(value()).toBe("null");
  });

  it("cập nhật khi giá trị đổi từ bên ngoài", async () => {
    const { user, input } = setup(1000);
    await user.click(screen.getByRole("button", { name: "Đặt 2,5" }));
    expect(input).toHaveValue("2,5");
  });
});

describe("QtyStepper", () => {
  function StepperHarness() {
    const [value, setValue] = useState(1000);
    return (
      <>
        <QtyStepper label="Mì gói" value={value} onChange={setValue} min={1000} />
        <output data-testid="value">{value}</output>
      </>
    );
  }

  it("gõ số nhỏ hơn min thì báo đỏ, giá trị giữ nguyên; rời ô thì hiện lại số đang giữ", async () => {
    const user = userEvent.setup();
    render(<StepperHarness />);
    const input = screen.getByLabelText("Số lượng Mì gói");
    await user.clear(input);
    await user.type(input, "0,5");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("value")).toHaveTextContent("1000");
    await user.tab();
    expect(input).toHaveValue("1");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("nút +/− đổi 1 đơn vị, không xuống dưới min; xóa trắng rồi rời ô thì giữ số cũ", async () => {
    const user = userEvent.setup();
    render(<StepperHarness />);
    const input = screen.getByLabelText("Số lượng Mì gói");
    const minus = screen.getByRole("button", { name: "Bớt 1 Mì gói" });
    expect(minus).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Thêm 1 Mì gói" }));
    expect(input).toHaveValue("2");
    expect(screen.getByTestId("value")).toHaveTextContent("2000");

    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue("2");

    await user.clear(input);
    await user.type(input, "1,5");
    expect(screen.getByTestId("value")).toHaveTextContent("1500");
  });
});
