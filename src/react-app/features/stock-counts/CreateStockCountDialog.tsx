import { useState } from "react";
import { useNavigate } from "react-router";
import { MAX_DOCUMENT_LINES } from "../../../shared/schemas/document";
import { useCategories } from "../../api/categories";
import { errorMessage } from "../../api/errors";
import { useCreateStockCount } from "../../api/inventory";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { RadioCard } from "../../components/ui/RadioCard";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../components/ui/toast-context";
import { formatNumber } from "../../lib/format";

type Scope = "category" | "selected";

/**
 * Tạo phiếu kiểm kho: theo nhóm hàng (hoặc mọi hàng đang bán) hoặc các mặt hàng đang chọn ở
 * danh sách Hàng hóa. Tạo xong chuyển sang trang đếm.
 */
export function CreateStockCountDialog({
  open,
  onClose,
  selectedIds = [],
}: {
  open: boolean;
  onClose: () => void;
  selectedIds?: string[];
}) {
  // Mỗi lần mở là một form mới (mặc định theo các hàng đang chọn nếu có).
  return open ? <CreateForm onClose={onClose} selectedIds={selectedIds} /> : null;
}

function CreateForm({ onClose, selectedIds }: { onClose: () => void; selectedIds: string[] }) {
  const navigate = useNavigate();
  const toast = useToast();
  const categories = useCategories();
  const create = useCreateStockCount();
  const [scope, setScope] = useState<Scope>(selectedIds.length > 0 ? "selected" : "category");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    create.mutate(
      {
        categoryId: scope === "category" && categoryId ? categoryId : null,
        productIds: scope === "selected" ? selectedIds : null,
        note: note.trim() || null,
      },
      {
        onSuccess: (doc) => {
          toast(`Đã tạo phiếu kiểm ${doc.code} (${formatNumber(doc.summary.total)} mặt hàng)`);
          onClose();
          navigate(`/kiem-kho/${doc.id}`);
        },
      },
    );
  }

  const tooMany = scope === "selected" && selectedIds.length > MAX_DOCUMENT_LINES;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Tạo phiếu kiểm kho"
      description="Đếm hàng thực tế trên kệ, hệ thống tự tính chênh lệch và cân bằng tồn kho."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button loading={create.isPending} disabled={tooMany} onClick={submit}>
            Tạo phiếu và bắt đầu đếm
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-medium text-ink-body">
            Kiểm những hàng nào?
          </legend>
          <RadioCard
            name="kk-scope"
            label="Theo nhóm hàng"
            description="Các mặt hàng đang bán trong nhóm"
            checked={scope === "category"}
            onChange={() => setScope("category")}
          />
          {selectedIds.length > 0 && (
            <RadioCard
              name="kk-scope"
              label={`Các mặt hàng đang chọn (${formatNumber(selectedIds.length)})`}
              checked={scope === "selected"}
              onChange={() => setScope("selected")}
            />
          )}
        </fieldset>
        {scope === "category" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-body">Nhóm hàng</span>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Tất cả hàng đang bán</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({formatNumber(c.productCount)})
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-body">Ghi chú</span>
          <Textarea
            rows={2}
            maxLength={500}
            placeholder="Ví dụ: kiểm kệ gia vị cuối tháng"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {tooMany && (
          <Alert tone="warn">
            Mỗi phiếu kiểm tối đa {MAX_DOCUMENT_LINES} mặt hàng. Hãy chọn ít hàng hơn hoặc kiểm theo
            nhóm.
          </Alert>
        )}
        {create.isError && <Alert>{errorMessage(create.error)}</Alert>}
      </div>
    </Dialog>
  );
}
