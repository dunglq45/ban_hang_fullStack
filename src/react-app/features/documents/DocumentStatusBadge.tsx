import { Badge } from "../../components/ui/Badge";
import { DOCUMENT_STATUS, type DocumentKind, type DocumentStatus } from "./document-status";

/** Nhãn trạng thái phiếu nhập / phiếu kiểm kho. */
export function DocumentStatusBadge({
  status,
  kind,
}: {
  status: DocumentStatus;
  kind: DocumentKind;
}) {
  const s = DOCUMENT_STATUS[status];
  return <Badge tone={s.tone}>{s[kind]}</Badge>;
}
