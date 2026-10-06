import {
  type ChangeEvent,
  type ClipboardEvent,
  useCallback,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { formatVnd, parseVnd } from "../../../shared/money";
import { MAX_AMOUNT } from "../../../shared/schemas/common";
import { cn } from "../../lib/cn";
import { Input, type InputProps } from "./Input";

export interface MoneyInputProps extends Omit<
  InputProps,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode"
> {
  /** Số tiền (số nguyên VND); null khi ô trống. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Số tiền lớn nhất được gõ; gõ quá thì phím vừa gõ bị bỏ qua. */
  max?: number;
}

const isDigit = (ch: string | undefined) => ch !== undefined && ch >= "0" && ch <= "9";

function digitsOf(s: string) {
  return s.replace(/\D/g, "");
}

function toText(value: number | null) {
  return value === null ? "" : formatVnd(value);
}

function parseText(text: string) {
  const digits = digitsOf(text);
  return digits === "" ? null : Number(digits);
}

/** Vị trí trong `text` ngay sau chữ số thứ `n` (đếm từ 1); n = 0 → đầu chuỗi. */
function caretAfterDigits(text: string, n: number) {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (isDigit(text[i]) && ++seen === n) return i + 1;
  }
  return text.length;
}

/**
 * Backspace/Delete chỉ xóa dấu chấm phân cách thì các chữ số không đổi, ô sẽ đứng yên. Khi đó
 * xóa luôn chữ số kề bên (trước con trỏ với Backspace, sau con trỏ với Delete) như người dùng muốn.
 */
function deleteAcrossSeparator(raw: string, cursor: number, backward: boolean) {
  if (backward) {
    let i = cursor - 1;
    while (i >= 0 && !isDigit(raw[i])) i--;
    if (i < 0) return { raw, cursor };
    return { raw: raw.slice(0, i) + raw.slice(i + 1), cursor: i };
  }
  let i = cursor;
  while (i < raw.length && !isDigit(raw[i])) i++;
  if (i >= raw.length) return { raw, cursor };
  return { raw: raw.slice(0, i) + raw.slice(i + 1), cursor };
}

/**
 * Ô nhập tiền: hiển thị "100.000" ngay khi gõ, giá trị là số nguyên VND. Gõ phím chỉ nhận chữ số;
 * dán thì phải là số tiền hợp lệ ("100.000đ" được, "1,5tr" bị từ chối thay vì hiểu sai thành 15).
 * Giữ đúng vị trí con trỏ khi thêm/bớt dấu chấm.
 */
export function MoneyInput({
  value,
  onChange,
  max = MAX_AMOUNT,
  className,
  onBlur,
  onPaste,
  ref: externalRef,
  ...props
}: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const [text, setText] = useState(() => toText(value));
  const [prevValue, setPrevValue] = useState(value);
  // Ép render lại khi chữ không đổi (phím bị bỏ qua) để layout effect đặt lại con trỏ.
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // Giá trị đổi từ bên ngoài (nút "Vừa đủ", reset form...) → hiển thị lại.
  if (value !== prevValue) {
    setPrevValue(value);
    if (parseText(text) !== value) setText(toText(value));
  }

  // Sau khi định dạng lại, đặt con trỏ về đúng sau chữ số vừa gõ.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (caret.current !== null && el && el === document.activeElement) {
      el.setSelectionRange(caret.current, caret.current);
    }
    caret.current = null;
  });

  const setRefs = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      if (typeof externalRef === "function") externalRef(el);
      else if (externalRef) externalRef.current = el;
    },
    [externalRef],
  );

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value;
    let cursor = e.target.selectionStart ?? raw.length;
    const inputType = (e.nativeEvent as InputEvent).inputType ?? "";

    if (
      inputType.startsWith("delete") &&
      raw.length < text.length &&
      digitsOf(raw) === digitsOf(text)
    ) {
      ({ raw, cursor } = deleteAcrossSeparator(raw, cursor, inputType.endsWith("Backward")));
    }

    // Bỏ số 0 ở đầu ("007" → "7"), nhưng "0" vẫn là 0.
    const allDigits = digitsOf(raw);
    const digits = allDigits.replace(/^0+(?=\d)/, "");
    const next = digits === "" ? null : Number(digits);
    if (next !== null && (!Number.isSafeInteger(next) || next > max)) {
      // Quá giới hạn: bỏ qua phím vừa gõ, con trỏ ở lại chỗ cũ.
      caret.current = Math.max(0, cursor - (raw.length - text.length));
      rerender();
      return;
    }

    const nextText = toText(next);
    const zerosRemoved = allDigits.length - digits.length;
    caret.current = caretAfterDigits(
      nextText,
      digitsOf(raw.slice(0, cursor)).length - zerosRemoved,
    );
    if (nextText === text) rerender();
    else setText(nextText);
    if (next !== value) onChange(next);
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    onPaste?.(e);
    const pasted = e.clipboardData.getData("text");
    const amount = parseVnd(pasted);
    // Chuỗi dán không phải số tiền rõ ràng (số âm, "1,5tr", "1.250.000,50"...): không nhận.
    if (amount === null || amount < 0) e.preventDefault();
  }

  return (
    <Input
      {...props}
      ref={setRefs}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={text}
      onChange={handleChange}
      onPaste={handlePaste}
      onBlur={(e) => {
        // Rời ô: hiển thị đúng giá trị đang giữ (phòng khi bên ngoài không nhận giá trị vừa gõ).
        setText(toText(value));
        onBlur?.(e);
      }}
      className={cn("text-right tabular-nums", className)}
    />
  );
}
