import type { KeyboardEvent, RefObject } from "react";
import type { Category } from "../../api/categories";
import type { PosProduct } from "../../api/pos";
import { Input } from "../../components/ui/Input";
import { Kbd } from "../../components/ui/Kbd";
import { PlusIcon, SearchIcon } from "../../components/ui/icons";
import { Tabs } from "../../components/ui/Tabs";
import { cn } from "../../lib/cn";
import { formatMoney, formatQty } from "../../lib/format";
import { stockLevel } from "./product-search";

/** Số ô hàng hiển thị tối đa; cửa hàng nhiều hàng thì gõ để tìm. */
const MAX_VISIBLE = 120;
const ALL = "__all__";

export interface ProductCatalogProps {
  products: PosProduct[];
  /** Tổng số hàng trước khi lọc (để biết là "chưa có hàng" hay "không tìm thấy"). */
  totalCount: number;
  categories: Category[];
  query: string;
  onQueryChange: (q: string) => void;
  /** Enter trong ô tìm: khớp mã vạch / mã hàng / kết quả duy nhất. */
  onSubmitQuery: () => void;
  categoryId: string | null;
  onCategoryChange: (id: string | null) => void;
  onAdd: (product: PosProduct) => void;
  /** Số lượng (milli, đơn vị cơ bản) đã có trong đơn, theo productId. */
  inCart: Map<string, number>;
  searchRef: RefObject<HTMLInputElement | null>;
}

const stockText = {
  ok: "text-ink-muted",
  low: "font-semibold text-warn",
  out: "font-semibold text-danger",
};

export function ProductCatalog({
  products,
  totalCount,
  categories,
  query,
  onQueryChange,
  onSubmitQuery,
  categoryId,
  onCategoryChange,
  onAdd,
  inCart,
  searchRef,
}: ProductCatalogProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmitQuery();
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      onQueryChange("");
    }
  }

  const visible = products.slice(0, MAX_VISIBLE);
  const tabItems = [
    { value: ALL, label: "Tất cả" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <section aria-label="Chọn hàng" className="flex min-w-0 flex-[999_1_440px] flex-col gap-3.5">
      <Input
        ref={searchRef}
        type="search"
        aria-label="Tìm hàng"
        placeholder="Tìm tên hàng, mã hàng hoặc quét mã vạch"
        autoComplete="off"
        enterKeyHint="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        leading={<SearchIcon size={18} />}
        trailing={<Kbd className="mr-2 hidden md:inline">F3</Kbd>}
        data-pos-search=""
      />

      {categories.length > 0 && (
        <Tabs
          label="Nhóm hàng"
          items={tabItems}
          value={query ? ALL : (categoryId ?? ALL)}
          onChange={(v) => {
            onQueryChange("");
            onCategoryChange(v === ALL ? null : v);
          }}
        />
      )}

      <p className="sr-only" aria-live="polite">
        {query ? `${products.length} mặt hàng phù hợp` : ""}
      </p>

      {products.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-input bg-white px-6 py-10 text-center text-sm text-ink-muted">
          {totalCount === 0
            ? "Chưa có hàng nào để bán. Thêm hàng hóa trong mục Hàng hóa."
            : query
              ? `Không tìm thấy hàng phù hợp với "${query}".`
              : "Nhóm này chưa có hàng."}
        </div>
      ) : (
        <>
          {/* Máy tính, máy tính bảng: lưới ô hàng. */}
          <ul className="hidden grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5 md:grid">
            {visible.map((p) => {
              const level = stockLevel(p);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onAdd(p)}
                    className="flex h-full min-h-[100px] w-full flex-col justify-between gap-2.5 rounded-control border border-line bg-white p-3 text-left hover:border-primary hover:bg-primary-soft"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs text-ink-muted">{p.code}</span>
                      <span className="text-sm leading-snug font-medium text-ink">{p.name}</span>
                    </span>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[15px] font-semibold tabular-nums">
                        {formatMoney(p.salePrice)}
                      </span>
                      <span className={cn("text-xs tabular-nums", stockText[level])}>
                        Tồn {formatQty(p.stock)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Điện thoại: danh sách dòng, nút + bên phải. */}
          <ul className="-mx-4 border-t border-subtle bg-white md:hidden">
            {visible.map((p) => {
              const level = stockLevel(p);
              const qty = inCart.get(p.id);
              return (
                <li
                  key={p.id}
                  className="flex min-h-16 items-center gap-3 border-b border-subtle px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1 leading-snug">
                    <div className="text-[15px] font-medium">{p.name}</div>
                    <div className={cn("text-xs tabular-nums", stockText[level])}>
                      {p.code} · Tồn {formatQty(p.stock)}
                    </div>
                  </div>
                  <div className="text-[15px] font-semibold tabular-nums">
                    {formatMoney(p.salePrice)}
                  </div>
                  <button
                    type="button"
                    onClick={() => onAdd(p)}
                    aria-label={
                      qty ? `Thêm ${p.name}, đã chọn ${formatQty(qty)}` : `Thêm ${p.name}`
                    }
                    className={cn(
                      "inline-flex h-touch min-w-touch shrink-0 items-center justify-center rounded-control px-2 text-[15px] font-bold tabular-nums",
                      qty
                        ? "bg-primary text-white"
                        : "border border-line-input bg-white text-primary",
                    )}
                  >
                    {qty ? formatQty(qty) : <PlusIcon size={18} />}
                  </button>
                </li>
              );
            })}
          </ul>

          {products.length > MAX_VISIBLE && (
            <p className="text-center text-sm text-ink-muted">
              Đang hiện {MAX_VISIBLE} / {products.length} mặt hàng. Gõ tên hoặc mã để tìm nhanh hơn.
            </p>
          )}
        </>
      )}
    </section>
  );
}
