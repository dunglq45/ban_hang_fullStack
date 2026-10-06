import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  PRODUCT_SORTS,
  type ProductSort,
  type ProductStatus,
} from "../../../shared/schemas/product";
import { useSession } from "../../api/auth";
import { useCategories } from "../../api/categories";
import { errorMessage } from "../../api/errors";
import { type ProductListItem, useProducts, useSetProductActive } from "../../api/products";
import { ActionMenu } from "../../components/ui/ActionMenu";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { buttonClass } from "../../components/ui/button-class";
import { EmptyState } from "../../components/ui/EmptyState";
import { PlusIcon, SearchIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";
import { StatusDot } from "../../components/ui/StatusDot";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { Tabs } from "../../components/ui/Tabs";
import { useToast } from "../../components/ui/toast-context";
import { cn } from "../../lib/cn";
import { formatMoney, formatNumber, formatQty } from "../../lib/format";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { CreateStockCountDialog } from "../stock-counts/CreateStockCountDialog";
import { CategoryDialog } from "./CategoryDialog";
import { ImportDialog } from "./ImportDialog";
import { productStatus } from "./status";

const PAGE_SIZE = 20;
const STATUS_TABS: Array<{ value: ProductStatus; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "low", label: "Sắp hết" },
  { value: "out", label: "Hết hàng" },
  { value: "inactive", label: "Ngừng bán" },
];
const SORT_LABELS: Record<ProductSort, string> = {
  name: "Tên A–Z",
  code: "Mã hàng",
  newest: "Mới thêm",
  stock_asc: "Tồn ít nhất",
  stock_desc: "Tồn nhiều nhất",
};

function isStatus(v: string | null): v is ProductStatus {
  return STATUS_TABS.some((t) => t.value === v);
}
function isSort(v: string | null): v is ProductSort {
  return (PRODUCT_SORTS as readonly string[]).includes(v ?? "");
}

/** Danh sách hàng hóa (design/HangHoa). Bộ lọc nằm trên URL để tải lại / gửi link vẫn giữ. */
export function ProductListPage() {
  const { user } = useSession();
  const isOwner = user.role === "owner";
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get("status");
  const sortParam = params.get("sort");
  const status: ProductStatus = isStatus(statusParam) ? statusParam : "all";
  const sort: ProductSort = isSort(sortParam) ? sortParam : "name";
  const categoryId = params.get("nhom") ?? "";
  const page = Math.max(1, Number(params.get("trang")) || 1);
  const q = params.get("q") ?? "";

  // Ô tìm: gõ thì cập nhật URL sau 300ms (đổi từ khóa thì về trang 1). `lastSyncedQ` phân biệt
  // "q đổi vì chính ô này vừa gõ xong" với "q đổi từ nơi khác" (sidebar, nút Back, link có sẵn
  // ?q=...), để hai chiều đồng bộ không giẫm chân nhau.
  const [search, setSearch] = useState(q);
  const lastSyncedQ = useRef(q);
  const debounced = useDebouncedValue(search.trim(), 300);
  useEffect(() => {
    if (debounced === lastSyncedQ.current) return;
    lastSyncedQ.current = debounced;
    update({ q: debounced, trang: "" });
    // update chỉ đọc params hiện tại; chạy lại khi từ khóa đã debounce đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  // URL đổi từ nơi khác: đồng bộ lại ô tìm theo URL.
  useEffect(() => {
    if (q === lastSyncedQ.current) return;
    lastSyncedQ.current = q;
    setSearch(q);
  }, [q]);

  function update(patch: Record<string, string>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
  }

  const list = useProducts({
    q: q || undefined,
    status,
    sort,
    categoryId: categoryId || undefined,
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  const categories = useCategories();
  const setActive = useSetProductActive();
  const [checked, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const [counting, setCounting] = useState(false);

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  // Chỉ tính các dòng đang hiện (đổi trang/bộ lọc thì dòng cũ không còn được chọn).
  const selected = useMemo(
    () => new Set(items.filter((i) => checked.has(i.id)).map((i) => i.id)),
    [items, checked],
  );

  const counts = list.data?.counts;
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const someSelected = selected.size > 0 && !allSelected;

  async function bulkSetActive(isActive: boolean) {
    const ids = [...selected];
    let ok = 0;
    for (const id of ids) {
      try {
        await setActive.mutateAsync({ id, isActive });
        ok++;
      } catch (err) {
        toast({ tone: "error", message: errorMessage(err) });
      }
    }
    setSelected(new Set());
    if (ok > 0) toast(`${isActive ? "Đã bán lại" : "Đã ngừng bán"} ${formatNumber(ok)} mặt hàng`);
  }

  function toggleOne(p: ProductListItem) {
    setActive.mutate(
      { id: p.id, isActive: !p.isActive },
      {
        onSuccess: () => toast(`${p.isActive ? "Đã ngừng bán" : "Đã bán lại"} ${p.name}`),
        onError: (err) => toast({ tone: "error", message: errorMessage(err) }),
      },
    );
  }

  const filtered = Boolean(q || categoryId || status !== "all");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {counts ? `${formatNumber(counts.all)} mặt hàng` : " "}
          {isOwner && list.data?.stockValue !== undefined && (
            <>
              {" · Giá trị tồn kho theo giá vốn "}
              <span className="font-semibold text-ink tabular-nums">
                {formatMoney(list.data.stockValue)}
              </span>
            </>
          )}
        </p>
        {isOwner && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setImporting(true)}>
              Nhập từ Excel
            </Button>
            <Button variant="secondary" onClick={() => setCounting(true)}>
              Kiểm kho
            </Button>
            <Link to="/nhap-hang/moi" className={buttonClass({ variant: "secondary" })}>
              Nhập hàng
            </Link>
            <Link to="/hang-hoa/moi" className={buttonClass()}>
              <PlusIcon size={18} />
              Thêm hàng hóa
            </Link>
          </div>
        )}
      </div>

      <div className="rounded-card border border-line bg-white">
        <Tabs
          label="Lọc theo trạng thái"
          className="px-4"
          value={status}
          onChange={(v) => update({ status: v === "all" ? "" : v, trang: "" })}
          items={STATUS_TABS.map((t) => ({ ...t, count: counts?.[t.value] }))}
        />

        <div className="flex flex-wrap gap-2 px-4 py-3">
          <Input
            type="search"
            aria-label="Tìm hàng hóa"
            placeholder="Tìm theo tên, mã hàng hoặc mã vạch"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leading={<SearchIcon size={18} />}
            frameClassName="flex-[1_1_260px]"
          />
          <Select
            aria-label="Nhóm hàng"
            value={categoryId}
            onChange={(e) => update({ nhom: e.target.value, trang: "" })}
            className="w-full sm:w-52"
          >
            <option value="">Nhóm hàng: Tất cả</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {isOwner && (
            <Button variant="ghost" onClick={() => setManagingCategories(true)}>
              Quản lý nhóm
            </Button>
          )}
          <Select
            aria-label="Sắp xếp"
            value={sort}
            onChange={(e) =>
              update({ sort: e.target.value === "name" ? "" : e.target.value, trang: "" })
            }
            className="w-full sm:w-52"
          >
            {PRODUCT_SORTS.map((s) => (
              <option key={s} value={s}>
                Sắp xếp: {SORT_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>

        {isOwner && selected.size > 0 && (
          <div
            role="region"
            aria-label="Thao tác với các hàng đã chọn"
            className="flex flex-wrap items-center gap-2 border-t border-line bg-primary-soft px-4 py-2"
          >
            <span className="text-sm font-semibold text-primary">
              Đã chọn {formatNumber(selected.size)}
            </span>
            <Button
              variant="secondary"
              loading={setActive.isPending}
              onClick={() => void bulkSetActive(false)}
            >
              Ngừng bán
            </Button>
            <Button
              variant="secondary"
              loading={setActive.isPending}
              onClick={() => void bulkSetActive(true)}
            >
              Bán lại
            </Button>
            <Button variant="secondary" onClick={() => setCounting(true)}>
              Kiểm kho
            </Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              Bỏ chọn
            </Button>
          </div>
        )}

        <div className="border-t border-line">
          {list.isPending ? (
            <div className="flex justify-center py-16">
              <Spinner size={28} label="Đang tải danh sách hàng hóa" className="text-primary" />
            </div>
          ) : list.isError ? (
            <div className="p-4">
              <Alert>{errorMessage(list.error)}</Alert>
            </div>
          ) : items.length === 0 ? (
            filtered ? (
              <EmptyState
                title="Không tìm thấy hàng phù hợp"
                description="Thử từ khóa khác hoặc bỏ bớt bộ lọc."
              />
            ) : (
              <EmptyState
                title="Chưa có hàng hóa"
                description="Thêm từng mặt hàng hoặc nhập nhanh cả danh sách từ file Excel."
                action={
                  isOwner && (
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="secondary" onClick={() => setImporting(true)}>
                        Nhập từ Excel
                      </Button>
                      <Link to="/hang-hoa/moi" className={buttonClass()}>
                        Thêm hàng hóa
                      </Link>
                    </div>
                  )
                }
              />
            )
          ) : (
            <Table aria-label="Danh sách hàng hóa" minWidth={isOwner ? 940 : 820}>
              <THead>
                <TR>
                  {isOwner && (
                    <TH className="w-11 pr-0">
                      <label className="-m-3 flex size-touch cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          aria-label="Chọn tất cả hàng trong trang"
                          className="size-4 accent-primary"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected;
                          }}
                          onChange={() =>
                            setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))
                          }
                        />
                      </label>
                    </TH>
                  )}
                  <TH>Mã hàng</TH>
                  <TH>Tên hàng</TH>
                  <TH>Nhóm</TH>
                  <TH>Đơn vị</TH>
                  {isOwner && <TH numeric>Giá vốn</TH>}
                  <TH numeric>Giá bán</TH>
                  <TH numeric>Tồn kho</TH>
                  <TH>Trạng thái</TH>
                  <TH>
                    <span className="sr-only">Thao tác</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {items.map((p) => (
                  <TR
                    key={p.id}
                    onClick={() => navigate(`/hang-hoa/${p.id}`)}
                    className={cn(
                      "cursor-pointer hover:bg-table-head",
                      selected.has(p.id) && "bg-primary-soft",
                    )}
                  >
                    {isOwner && (
                      <TD className="pr-0" onClick={(e) => e.stopPropagation()}>
                        <label className="-m-3 flex size-touch cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            aria-label={`Chọn ${p.name}`}
                            className="size-4 accent-primary"
                            checked={selected.has(p.id)}
                            onChange={() =>
                              setSelected(() => {
                                const next = new Set(selected);
                                if (next.has(p.id)) next.delete(p.id);
                                else next.add(p.id);
                                return next;
                              })
                            }
                          />
                        </label>
                      </TD>
                    )}
                    <TD className="text-ink-muted">{p.code}</TD>
                    <TD className="font-medium">
                      <Link
                        to={`/hang-hoa/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-primary hover:underline"
                      >
                        {p.name}
                      </Link>
                    </TD>
                    <TD className="text-ink-soft">{p.categoryName ?? "—"}</TD>
                    <TD className="text-ink-soft">{p.baseUnit}</TD>
                    {isOwner && (
                      <TD numeric className="text-ink-soft">
                        {p.costPrice !== undefined ? formatMoney(p.costPrice) : ""}
                      </TD>
                    )}
                    <TD numeric className="font-semibold">
                      {formatMoney(p.salePrice)}
                    </TD>
                    <TD numeric className="font-semibold">
                      {formatQty(p.stock)}
                    </TD>
                    <TD>
                      <StatusDot status={productStatus(p)} />
                    </TD>
                    <TD className="text-right">
                      <ActionMenu
                        label={`Thao tác với ${p.name}`}
                        items={[
                          { label: "Xem chi tiết", to: `/hang-hoa/${p.id}` },
                          ...(isOwner
                            ? [
                                { label: "Sửa thông tin", to: `/hang-hoa/${p.id}/sua` },
                                { label: "Nhập thêm hàng", to: `/nhap-hang/moi?productId=${p.id}` },
                                {
                                  label: p.isActive ? "Ngừng bán" : "Bán lại",
                                  danger: p.isActive,
                                  onSelect: () => toggleOne(p),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>

        {list.data && list.data.total > 0 && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            itemLabel="mặt hàng"
            onChange={(p) => update({ trang: p > 1 ? String(p) : "" })}
          />
        )}
      </div>

      {isOwner && <ImportDialog open={importing} onClose={() => setImporting(false)} />}
      {isOwner && (
        <CategoryDialog open={managingCategories} onClose={() => setManagingCategories(false)} />
      )}
      {isOwner && (
        <CreateStockCountDialog
          open={counting}
          onClose={() => setCounting(false)}
          selectedIds={[...selected]}
        />
      )}
    </div>
  );
}
