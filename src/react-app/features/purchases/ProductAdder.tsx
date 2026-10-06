import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, type Ref, useEffect, useId, useRef, useState } from "react";
import { api } from "../../api/client";
import { ApiError, call, errorMessage } from "../../api/errors";
import { productListQueryKey, productQueryKey } from "../../api/keys";
import { lookupBarcode } from "../../api/pos";
import { SearchIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { Kbd } from "../../components/ui/Kbd";
import { useToast } from "../../components/ui/toast-context";
import { cn } from "../../lib/cn";
import { formatQty } from "../../lib/format";
import { useBarcodeScanner } from "../../lib/use-barcode-scanner";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import type { PurchaseProduct } from "./purchase-lines";

const searchParams = (q: string) => ({ q, pageSize: "8", sort: "name" as const });

/**
 * Ô tìm hoặc quét hàng để thêm vào phiếu nhập. Tìm qua server (cả hàng ngừng bán vẫn nhập được),
 * chọn thì tải chi tiết hàng (giá vốn, đơn vị quy đổi mới nhất). Enter: thử tra mã vạch trước
 * (mã vạch thùng → thêm theo đơn vị thùng), không có thì chọn kết quả đang sáng.
 * Máy quét ở bất kỳ đâu trên trang cũng thêm được hàng.
 */
export function ProductAdder({
  onAdd,
  disabled = false,
  onBusyChange,
  ref,
}: {
  onAdd: (product: PurchaseProduct, unitName?: string) => void;
  disabled?: boolean;
  /** Báo trang đang có hàng chờ thêm (để chưa cho lưu phiếu thiếu dòng đó). */
  onBusyChange?: (busy: boolean) => void;
  ref?: Ref<HTMLInputElement>;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Số lượt tra mã / tải chi tiết đang chạy (máy quét có thể bắn nhiều mã song song).
  const [busyCount, setBusyCount] = useState(0);
  const busy = busyCount > 0;
  const onBusyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  });
  useEffect(() => {
    onBusyChangeRef.current?.(busy);
  }, [busy]);
  const listId = useId();
  const debounced = useDebouncedValue(query.trim(), 250);
  const search = useQuery({
    queryKey: productListQueryKey(searchParams(debounced)),
    queryFn: () => call(api.products.$get({ query: searchParams(debounced) })),
    enabled: debounced !== "",
    placeholderData: keepPreviousData,
  });
  // Chỉ hiện kết quả của đúng chữ đang gõ: kết quả cũ (của từ khóa trước) mà bấm nhanh thì
  // thêm nhầm hàng.
  const fresh = debounced === query.trim() && !search.isPlaceholderData;
  const options = debounced && open && fresh ? (search.data?.items ?? []) : [];

  async function pick(id: string) {
    setBusyCount((n) => n + 1);
    try {
      const product = await queryClient.fetchQuery({
        queryKey: productQueryKey(id),
        queryFn: () => call(api.products[":id"].$get({ param: { id } })),
      });
      onAdd(product);
      setQuery("");
      setOpen(false);
    } catch (err) {
      toast({ tone: "error", message: errorMessage(err) });
    } finally {
      setBusyCount((n) => n - 1);
    }
  }

  /** Tra mã vạch; trả về false nếu không có hàng mang mã này. */
  async function addByBarcode(code: string): Promise<boolean> {
    setBusyCount((n) => n + 1);
    try {
      const found = await lookupBarcode(code);
      onAdd(found.product, found.unit?.name);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOT_FOUND") return false;
      toast({ tone: "error", message: errorMessage(err) });
      return true;
    } finally {
      setBusyCount((n) => n - 1);
    }
  }

  useBarcodeScanner((code) => {
    if (disabled) return;
    void addByBarcode(code).then((ok) => {
      if (!ok) toast({ tone: "error", message: `Không tìm thấy hàng có mã vạch ${code}` });
    });
  });

  async function handleEnter() {
    const q = query.trim();
    if (!q) return;
    let results = options;
    if (q !== debounced || !open) {
      // Gõ xong Enter ngay (chưa qua debounce): tìm luôn với chữ hiện tại.
      try {
        results = (
          await queryClient.fetchQuery({
            queryKey: productListQueryKey(searchParams(q)),
            queryFn: () => call(api.products.$get({ query: searchParams(q) })),
          })
        ).items;
      } catch (err) {
        toast({ tone: "error", message: errorMessage(err) });
        return;
      }
    }
    // Khớp đúng mã hàng / mã vạch: chọn luôn.
    const exact = results.find((o) => o.barcode === q || o.code.toUpperCase() === q.toUpperCase());
    if (exact) return pick(exact.id);
    // Mã vạch của đơn vị quy đổi (thùng) không nằm ở cột barcode của hàng: tra riêng.
    if (q.length >= 4 && (await addByBarcode(q))) {
      setQuery("");
      setOpen(false);
      return;
    }
    const chosen = results[highlight] ?? (results.length === 1 ? results[0] : undefined);
    if (chosen) return pick(chosen.id);
    toast({ tone: "error", message: `Không tìm thấy hàng "${q}"` });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (options.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (h + delta + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!busy) void handleEnter();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (open && options.length > 0) setOpen(false);
      else setQuery("");
    }
  }

  const showList = open && debounced !== "";
  const activeId = showList && options[highlight] ? `${listId}-${highlight}` : undefined;

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        ref={ref}
        type="search"
        role="combobox"
        aria-label="Thêm hàng vào phiếu"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-busy={busy}
        autoComplete="off"
        data-scan-search=""
        disabled={disabled}
        placeholder="Tìm hoặc quét hàng để thêm vào phiếu"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        leading={<SearchIcon size={18} />}
        trailing={<Kbd className="hidden md:inline">F3</Kbd>}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Kết quả tìm hàng"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-control border border-line bg-white py-1 shadow-lg"
        >
          {options.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                if (!busy) void pick(p.id);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex min-h-touch cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm",
                i === highlight && "bg-subtle",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {p.name}
                  {!p.isActive && <span className="font-normal text-ink-muted"> · Ngừng bán</span>}
                </span>
                <span className="text-xs text-ink-muted">{p.code}</span>
              </span>
              <span className="shrink-0 text-[13px] text-ink-muted tabular-nums">
                Tồn {formatQty(p.stock, p.baseUnit.toLowerCase())}
              </span>
            </li>
          ))}
          {options.length === 0 && (
            <li role="presentation" className="px-3 py-3 text-sm text-ink-muted">
              {!fresh || search.isFetching
                ? "Đang tìm…"
                : "Không tìm thấy hàng. Enter để tra mã vạch."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
