import type { BadgeTone } from "../../components/ui/Badge";

export type DocumentStatus = "draft" | "completed" | "cancelled";
export type DocumentKind = "purchase" | "count";

export const DOCUMENT_STATUS: Record<
  DocumentStatus,
  { tone: BadgeTone } & Record<DocumentKind, string>
> = {
  draft: { tone: "neutral", purchase: "Phiếu nháp", count: "Đang kiểm" },
  completed: { tone: "success", purchase: "Đã nhập kho", count: "Đã cân bằng kho" },
  cancelled: { tone: "danger", purchase: "Đã hủy", count: "Đã hủy" },
};
