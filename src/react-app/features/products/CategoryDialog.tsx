import { type FormEvent, useId, useState } from "react";
import {
  type Category,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
} from "../../api/categories";
import { errorMessage } from "../../api/errors";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Input";
import { useToast } from "../../components/ui/toast-context";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";

/** Thêm, đổi tên, xóa nhóm hàng (chỉ chủ cửa hàng). Nhóm còn hàng thì không xóa được. */
export function CategoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useCategories();
  const create = useCreateCategory();
  const [name, setName] = useState("");
  const toast = useToast();

  function add(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(trimmed, {
      onSuccess: () => {
        setName("");
        toast(`Đã thêm nhóm "${trimmed}"`);
      },
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nhóm hàng"
      description="Nhóm giúp lọc hàng và hiện thành tab ở màn Bán hàng."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      <form onSubmit={add} className="mb-4 flex gap-2">
        <Input
          aria-label="Tên nhóm mới"
          placeholder="Tên nhóm mới, ví dụ: Bánh kẹo"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          frameClassName="flex-1"
        />
        <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
          Thêm nhóm
        </Button>
      </form>
      {create.isError && <Alert className="mb-3">{errorMessage(create.error)}</Alert>}

      {categories.isPending ? (
        <p className="text-sm text-ink-muted">Đang tải…</p>
      ) : (categories.data ?? []).length === 0 ? (
        <p className="text-sm text-ink-muted">Chưa có nhóm nào.</p>
      ) : (
        <ul className="divide-y divide-subtle rounded-control border border-line">
          {categories.data!.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const rename = useRenameCategory();
  const remove = useDeleteCategory();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const countId = useId();

  function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) {
      setEditing(false);
      return;
    }
    rename.mutate(
      { id: category.id, name: trimmed },
      {
        onSuccess: () => {
          setEditing(false);
          setError(null);
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  function del() {
    // Nút vẫn bấm được (không dùng `disabled`) để trình đọc màn hình đọc được lý do qua Tab.
    if (category.productCount > 0) return;
    remove.mutate(category.id, {
      onSuccess: () => toast(`Đã xóa nhóm "${category.name}"`),
      onError: (err) => setError(errorMessage(err)),
    });
  }

  return (
    <li className="px-3 py-2">
      {editing ? (
        <form onSubmit={save} className="flex gap-2">
          <Input
            aria-label={`Tên mới cho nhóm ${category.name}`}
            value={name}
            maxLength={60}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            frameClassName="flex-1"
          />
          <Button type="submit" loading={rename.isPending}>
            Lưu
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setName(category.name);
              setError(null);
            }}
          >
            Hủy
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
          <span className="text-[13px] text-ink-muted tabular-nums">
            {formatNumber(category.productCount)} mặt hàng
          </span>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Đổi tên
          </Button>
          {category.productCount > 0 && (
            <span id={countId} className="sr-only">
              Nhóm còn {formatNumber(category.productCount)} mặt hàng nên chưa xóa được
            </span>
          )}
          <Button
            variant="ghost"
            className={cn(
              "text-danger",
              category.productCount > 0 && "cursor-not-allowed opacity-50",
            )}
            loading={remove.isPending}
            title={category.productCount > 0 ? "Nhóm còn hàng nên chưa xóa được" : undefined}
            aria-label={`Xóa nhóm ${category.name}`}
            aria-disabled={category.productCount > 0 || undefined}
            aria-describedby={category.productCount > 0 ? countId : undefined}
            onClick={del}
          >
            Xóa
          </Button>
        </div>
      )}
      {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
    </li>
  );
}
