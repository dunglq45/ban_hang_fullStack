import { type ChangeEvent, type FocusEvent, useState } from "react";
import { formatQtyInput, parseQty } from "../../../shared/qty";
import { MAX_QTY_MILLI } from "../../../shared/schemas/common";
import { cn } from "../../lib/cn";
import { Input, type InputProps } from "./Input";

export interface QtyInputProps extends Omit<
  InputProps,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode"
> {
  /** Số lượng dạng milli (1,5 → 1500); null khi ô trống hoặc gõ chưa hợp lệ. */
  value: number | null;
  /** `text`: chữ đang có trong ô, để phân biệt ô trống (null hợp lệ) với gõ chưa hợp lệ. */
  onChange: (milli: number | null, text: string) => void;
  /** Số lượng lớn nhất (milli). */
  max?: number;
}

// Chuỗi được phép gõ: chữ số, một dấu phân cách (phẩy hoặc chấm), tối đa 3 chữ số sau nó.
const ALLOWED = /^\d*([.,]\d{0,3})?$/;

function toText(milli: number | null) {
  return milli === null ? "" : formatQtyInput(milli);
}

/** Chuỗi không đọc được thành số lượng, trừ lúc đang gõ dở ("1," hoặc "1."). */
function isInvalid(text: string) {
  return text !== "" && !/[.,]$/.test(text) && parseQty(text) === null;
}

/**
 * Ô nhập số lượng, trả giá trị milli. Số lẻ dùng dấu phẩy ("1,5"); dấu chấm theo sau 1–2 chữ số
 * cũng được hiểu là số lẻ ("1.5"). "1.000" không rõ nghĩa: ô báo đỏ và giá trị là null, không
 * lặng lẽ hiểu thành 1. Phím không hợp lệ (chữ, dấu thứ hai, số lẻ thứ 4) bị bỏ qua.
 */
export function QtyInput({
  value,
  onChange,
  max = MAX_QTY_MILLI,
  className,
  onBlur,
  ...props
}: QtyInputProps) {
  const [text, setText] = useState(() => toText(value));
  const [prevValue, setPrevValue] = useState(value);

  // Giá trị đổi từ bên ngoài (nút +/−, reset form...) → hiển thị lại.
  if (value !== prevValue) {
    setPrevValue(value);
    if (parseQty(text) !== value) setText(toText(value));
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const nextText = e.target.value.replace(/\s/g, "");
    if (!ALLOWED.test(nextText)) return;
    // "1." đang gõ dở: tạm hiểu là 1 (parseQty không nhận dấu chấm ở cuối).
    const next = parseQty(nextText.replace(/\.$/, ""));
    if (next !== null && next > max) return;
    setText(nextText);
    onChange(next, nextText);
  }

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    // Rời ô: chuẩn hóa cách viết ("3," → "3", "01,50" → "1,5"). Chuỗi chưa hợp lệ thì giữ nguyên
    // để người dùng thấy và sửa, trừ khi bên ngoài vẫn giữ một số (QtyStepper) → hiện lại số đó.
    if (parseQty(text) !== null || value !== null || text.trim() === "") setText(toText(value));
    onBlur?.(e);
  }

  const invalid = isInvalid(text);
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      aria-invalid={invalid ? true : props["aria-invalid"]}
      title={invalid ? "Số lượng không hợp lệ. Số lẻ dùng dấu phẩy, ví dụ 1,5" : props.title}
      className={cn("text-right tabular-nums", className)}
    />
  );
}
