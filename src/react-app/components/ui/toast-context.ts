import { createContext, useContext } from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Thời gian hiển thị (ms). Mặc định 4 giây, lỗi 6 giây. */
  duration?: number;
}

export type ShowToast = (options: ToastOptions | string) => void;

export const ToastContext = createContext<ShowToast | null>(null);

/** Hiện thông báo ngắn ở góc màn hình: `toast("Đã lưu")`, `toast({ message, tone: "error" })`. */
export function useToast(): ShowToast {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast phải dùng bên trong <ToastProvider>");
  return toast;
}
