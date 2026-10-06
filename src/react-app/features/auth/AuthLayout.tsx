import type { ReactNode } from "react";
import { CheckIcon } from "../../components/ui/icons";

export const APP_NAME = "Quản lý cửa hàng";

const BENEFITS = [
  "Tồn kho tự cập nhật sau mỗi đơn bán và phiếu nhập.",
  "Sổ nợ ghi rõ từng lần mua, từng lần trả của mỗi khách.",
  "Dùng trên máy tính, máy tính bảng và điện thoại.",
];

/** Khung trang đăng nhập/đăng ký theo design/DangNhap: form bên trái, giới thiệu nền tối bên phải. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-wrap bg-page text-[15px]">
      <main className="flex min-w-0 flex-[1_1_480px] flex-col justify-between gap-8 bg-white px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-[34px] items-center justify-center rounded-control bg-primary text-[13px] font-bold text-white"
            aria-hidden="true"
          >
            QL
          </span>
          <span className="text-base font-semibold">{APP_NAME}</span>
        </div>

        <div className="flex w-full max-w-[380px] flex-col gap-[22px] self-center">
          <div className="leading-snug">
            <h1 className="mb-1.5 text-[26px] font-semibold">{title}</h1>
            <p className="text-ink-muted">{subtitle}</p>
          </div>
          {children}
          <div className="border-t border-line pt-4 text-center text-sm text-ink-soft">
            {footer}
          </div>
        </div>

        {/* Giữ khoảng trống dưới để khối form nằm giữa (justify-between). */}
        <div aria-hidden="true" />
      </main>

      <aside className="hidden min-w-0 flex-[1_1_480px] flex-col justify-center gap-7 bg-ink px-14 py-14 text-white lg:flex">
        <h2 className="max-w-[460px] text-[30px] leading-tight font-semibold">
          Bán hàng, nhập kho và ghi nợ trong một chỗ.
        </h2>
        <ul className="flex max-w-[460px] flex-col gap-4">
          {BENEFITS.map((text) => (
            <li key={text} className="flex items-start gap-3">
              <CheckIcon className="shrink-0 text-[#84ADFF]" />
              <span className="text-base text-[#D0D5DD]">{text}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
