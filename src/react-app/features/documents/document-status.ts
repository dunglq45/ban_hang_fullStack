import type { BadgeTone } from "../../components/ui/Badge";

export type DocumentStatus = "draft" | "completed" | "cancelled";
export type DocumentKind = "purchase" | "count" | "sale";

export const DOCUMENT_STATUS: Record<
  DocumentStatus,
  { tone: BadgeTone } & Record<DocumentKind, string>
> = {
  draft: { tone: "neutral", purchase: "Phiếu nháp", count: "Đang kiểm", sale: "Chưa hoàn thành" },
  completed: {
    tone: "success",
    purchase: "Đã nhập kho",
    count: "Đã cân bằng kho",
    sale: "Hoàn thành",
  },
  cancelled: { tone: "danger", purchase: "Đã hủy", count: "Đã hủy", sale: "Đã hủy" },
};

export const PAYMENT_METHOD_LABEL = { cash: "Tiền mặt", transfer: "Chuyển khoản" } as const;
