import { useEffect, useState } from "react";

/** Giá trị trễ `delay` ms sau lần đổi cuối (tìm kiếm gọi API khi người dùng ngừng gõ). */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
