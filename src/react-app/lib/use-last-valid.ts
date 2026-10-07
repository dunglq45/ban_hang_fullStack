import { useState } from "react";

/**
 * Giữ giá trị hợp lệ gần nhất: `value` là null (đang gõ dở / không hợp lệ) thì trả lại giá trị
 * hợp lệ trước đó, để truy vấn không nhảy sang kết quả khác trong lúc người dùng sửa ô.
 */
export function useLastValid<T>(value: T | null, initial: T): T {
  const [last, setLast] = useState<T>(value ?? initial);
  if (value !== null && JSON.stringify(value) !== JSON.stringify(last)) {
    setLast(value);
    return value;
  }
  return last;
}
