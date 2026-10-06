import { useState } from "react";
import { Input, type InputProps } from "./Input";

/** Ô mật khẩu có nút Hiện/Ẩn. */
export function PasswordInput(props: Omit<InputProps, "type" | "trailing">) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          className="-my-px h-touch min-w-touch shrink-0 rounded-small px-2.5 text-[13px] font-semibold text-ink-soft hover:bg-subtle"
        >
          {visible ? "Ẩn" : "Hiện"}
        </button>
      }
    />
  );
}
