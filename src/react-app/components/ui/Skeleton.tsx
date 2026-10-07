import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";
import { TBody, TD, TR } from "./Table";

/** Thanh chữ nhật nhấp nháy, giữ chỗ khi đang tải. Trang trí, ẩn với trình đọc màn hình. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-small bg-subtle", className)}
      {...props}
    />
  );
}

/**
 * Hàng giữ chỗ cho bảng đang tải (thay vòng xoay giữa trang): số cột và số dòng khớp bảng thật
 * để không bị giật layout khi dữ liệu về.
 */
export function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <TBody aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <TR key={r}>
          {Array.from({ length: columns }, (_, c) => (
            <TD key={c}>
              <Skeleton className="h-4" style={{ width: `${55 + ((r + c) % 4) * 10}%` }} />
            </TD>
          ))}
        </TR>
      ))}
    </TBody>
  );
}
