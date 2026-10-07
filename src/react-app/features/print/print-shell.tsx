import { type ReactNode } from "react";
import { IconButton } from "../../components/ui/Button";
import { PrinterIcon } from "../../components/ui/icons";
import { cn } from "../../lib/cn";

/** Thanh trên cùng: tên chứng từ + nút in thủ công. Không hiện khi in. */
export function PrintToolbar({ children }: { children?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-2.5 print:hidden">
      <span className="truncate text-sm font-medium text-ink-body">{children}</span>
      <IconButton label="In" variant="secondary" onClick={() => window.print()}>
        <PrinterIcon size={18} />
      </IconButton>
    </div>
  );
}

/** Khung ngoài: nền xám khi xem trên máy (phân biệt với trang trắng), trắng khi in. */
export function PrintScreen({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-page print:bg-white">{children}</div>;
}

/** Giấy in nhiệt 58mm/80mm (hóa đơn bán, phiếu thu/chi): nền trắng, chữ đen, không màu khi in. */
export function ThermalPaper({ widthMm, children }: { widthMm: 58 | 80; children: ReactNode }) {
  return (
    <>
      <style>{`@media print { @page { size: ${widthMm}mm auto; margin: 0; } }`}</style>
      <div className="flex justify-center py-6 print:py-0">
        <div
          className="flex flex-col gap-2.5 bg-white px-4 py-5 text-[12px] leading-[1.45] text-black tabular-nums shadow-[0_4px_16px_rgba(16,24,40,0.12)] print:px-3 print:py-4 print:shadow-none"
          style={{ width: `${widthMm}mm` }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

export function Dashed() {
  return <div className="border-t border-dashed border-black/60" />;
}

/** Một dòng "nhãn — giá trị" căn hai đầu, dùng trong hóa đơn/phiếu in. */
export function ReceiptRow({
  label,
  value,
  bold,
}: {
  label: ReactNode;
  value: ReactNode;
  bold?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2", bold && "font-bold")}>
      <span>{label}</span>
      <span className={cn(bold && "text-[14px]")}>{value}</span>
    </div>
  );
}
